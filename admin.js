/**
 * AGN ERP - Orders Module (v1.0)
 * Responsabilidades: Listado de órdenes, filtrado, detalles y acciones CRUD.
 */

let allOrders = [];
let selectedOrder = null;

document.addEventListener('DOMContentLoaded', () => {
    // Escuchar mensajes del Cotizador (Regla 23 de .clippy.md)
    window.addEventListener('message', handleQuoteMessage);

    // Cargar órdenes iniciales
    loadOrders();

    // Setup UI listeners
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.addEventListener('input', debounce(renderOrders, 300));

    const statusFilter = document.getElementById('status-filter');
    if (statusFilter) statusFilter.addEventListener('change', renderOrders);

    const btnNewOrder = document.getElementById('btn-new-order');
    if (btnNewOrder) btnNewOrder.onclick = openManualOrderModal;
});

async function loadOrders() {
    const listContainer = document.getElementById('orders-list');
    if (!listContainer) return;

    try {
        const res = await window.AGN_CORE.fetchWithTimeout('/api/get-all-orders', {
            headers: { 'x-admin-password': window.AGN_CORE.adminPass }
        });

        if (!res.ok) throw new Error("Fallo al cargar órdenes");

        allOrders = await res.json();
        renderOrders();
        updateStats();
    } catch (err) {
        console.error(err);
        listContainer.innerHTML = `<div class="error-state">Error al cargar datos.</div>`;
    }
}

function renderOrders() {
    const container = document.getElementById('orders-list');
    if (!container) return;

    const query = (document.getElementById('search-input')?.value || '').toLowerCase();
    const filter = document.getElementById('status-filter')?.value || '';

    console.log("Rendering orders. Total:", allOrders.length, " Filter:", filter, " Query:", query);

    const visible = allOrders.filter(o => {
        const fullName = o.customers?.full_name || o.customer_name || '';
        const matchSearch = !query ||
            fullName.toLowerCase().includes(query) ||
            (o.part_name || '').toLowerCase().includes(query) ||
            (o.readable_id || '').toLowerCase().includes(query);
        const matchFilter = !filter || o.status === filter;
        return matchSearch && matchFilter;
    });

    if (visible.length === 0) {
        container.innerHTML = `<div class="empty-state">No hay órdenes que coincidan (${allOrders.length} totales).</div>`;
        return;
    }

    container.innerHTML = visible.map(o => `
        <div class="order-card ${(window.selectedOrder && window.selectedOrder.id === o.id) ? 'selected' : ''}" onclick="selectOrder('${o.id}')">
            <div style="overflow: hidden;">
                <div class="order-client" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${o.customers?.full_name || o.customer_name || 'Sin Cliente'}</div>
                <div class="order-part" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${o.part_name || 'Sin nombre de pieza'}</div>
                <div class="order-vehicle" style="font-size: 0.75rem; color: var(--text2);">${o.vehicle_brand || ''} ${o.vehicle_model || ''}</div>
            </div>
            <div class="order-meta">
                <span class="sbadge s-${(o.status || 'solicitado').toLowerCase().replace(/\s+/g, '-')}">${o.status || 'Solicitado'}</span>
                <span class="order-date">${o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</span>
            </div>
        </div>
    `).join('');
}

function selectOrder(id) {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    window.selectedOrder = order;
    renderOrders(); // Refresh selection visual
    renderDetail(order);
}

function renderDetail(order) {
    const container = document.getElementById('detail-content');
    const panel = document.getElementById('detail-panel');
    const quoteContainer = document.getElementById('quote-container');

    panel.classList.remove('empty');
    if (quoteContainer) quoteContainer.style.display = 'block';

    container.innerHTML = `
        <div class="detail-header">
            <h3>Orden #${order.readable_id}</h3>
            <div class="detail-sub">${order.customers?.full_name || 'Sin nombre'}</div>
        </div>
        <div class="detail-body">
            <div class="detail-section">
                <h4>Información del Vehículo</h4>
                <div class="info-grid">
                    <div class="info-item"><div class="il">Marca</div><div class="iv">${order.vehicle_brand || '—'}</div></div>
                    <div class="info-item"><div class="il">Modelo</div><div class="iv">${order.vehicle_model || '—'}</div></div>
                    <div class="info-item"><div class="il">VIN</div><div class="iv">${order.vin || '—'}</div></div>
                </div>
            </div>
            <!-- Acciones de Estado -->
            <div class="detail-section">
                <h4>Estado de la Orden</h4>
                <div class="status-changer">
                    <select id="detail-status-select" style="padding:0.5rem; background:var(--surface2); color:white; border:1px solid var(--border); border-radius:8px;">
                        ${['Solicitado', 'Cotizado', 'Comprado', 'Tránsito 1', 'Tránsito 2', 'En Aduana', 'Entregado', 'Cancelado']
            .map(s => `<option ${order.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                    <button class="btn-primary" style="padding:0.5rem 1rem; font-size:0.8rem;" onclick="updateStatus('${order.id}')">Actualizar</button>
                </div>
            </div>
            <!-- Lista de Repuestos -->
            <div class="detail-section">
                <h4>Repuestos</h4>
                <div id="detail-items-list" style="font-size:0.85rem;">
                    ${(order.order_items || []).map(i => `
                        <div style="padding:0.5rem; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;">
                            <span>${i.part_name} x ${i.quantity}</span>
                            <span style="color:var(--text2)">$${i.price || 0}</span>
                        </div>
                    `).join('')}
                    ${(!order.order_items || order.order_items.length === 0) ? '<div style="color:var(--text2); padding:0.5rem;">No hay ítems registrados.</div>' : ''}
                </div>
            </div>
        </div>
    `;
}

async function updateStatus(orderId) {
    const newStatus = document.getElementById('detail-status-select').value;
    try {
        const res = await window.AGN_CORE.fetchWithTimeout('api/update-order-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': window.AGN_CORE.adminPass
            },
            body: JSON.stringify({ orderId, newStatus })
        });

        if (res.ok) {
            window.AGN_CORE.showToast("Estado actualizado");
            loadOrders();
        }
    } catch (err) {
        window.AGN_CORE.showToast("Error al actualizar", "error");
    }
}

async function addNote(orderId, note) {
    try {
        const res = await window.AGN_CORE.fetchWithTimeout('api/add-note', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': window.AGN_CORE.adminPass
            },
            body: JSON.stringify({ orderId, content: note, author: `Aria (via ${window.AGN_CORE.adminName})` })
        });
        if (res.ok) {
            window.AGN_CORE.showToast("Nota agregada");
        }
    } catch (err) {
        window.AGN_CORE.showToast("Error al agregar nota", "error");
    }
}

// Registro de acciones para Aria (Sección 5 .clippy.md)
window.AGN_ERP_ACTIONS = {
    UPDATE_STATUS: async (data) => {
        await updateStatus(data.order_id || window.selectedOrder?.id, data.new_status || data.fields?.status);
    },
    ADD_NOTE: async (data) => {
        await addNote(data.order_id, data.note);
    },
    REFRESH: loadOrders
};

// Utils
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function updateStats() {
    const stats = {
        total: allOrders.length,
        comprado: allOrders.filter(o => o.status === 'Comprado').length,
        transito: allOrders.filter(o => o.status.includes('Tránsito')).length,
        entregado: allOrders.filter(o => o.status === 'Entregado').length
    };

    document.getElementById('s-total').textContent = stats.total;
    document.getElementById('s-comprado').textContent = stats.comprado;
    document.getElementById('s-transito').textContent = stats.transito;
    document.getElementById('s-entregado').textContent = stats.entregado;
    document.getElementById('nav-active').textContent = `${allOrders.filter(o => !['Entregado', 'Cancelado'].includes(o.status)).length} activas`;
}

function handleQuoteMessage(event) {
    if (event.data.type === 'QUOTE_EXPORT') {
        window.AGN_CORE.showToast("Cotización recibida del motor");
        // Lógica para vincular ítems a orden si es necesario
    }
}

// --- MANUAL ORDER SYSTEM ---
function openManualOrderModal() {
    const modal = document.createElement('div');
    modal.id = 'manual-order-modal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:9999;';
    modal.innerHTML = `
        <div class="login-card" style="width: 500px; max-height: 90vh; overflow-y: auto;">
            <h3>Nueva Orden Manual</h3>
            <div class="field"><label>Cliente</label><input type="text" id="mo-customer" required></div>
            <div class="field"><label>Teléfono</label><input type="text" id="mo-phone"></div>
            <div class="field"><label>Marca</label><input type="text" id="mo-brand" required></div>
            <div class="field"><label>Modelo</label><input type="text" id="mo-model"></div>
            <div id="mo-items-list"></div>
            <button class="btn-sm" onclick="addManualOrderItemRow()" style="margin-bottom:1rem;">+ Añadir Repuesto</button>
            <div style="display:flex; gap:1rem;">
                <button class="btn-primary" style="flex:1" onclick="saveManualOrder()">Guardar</button>
                <button class="btn-sm" style="flex:1" onclick="document.getElementById('manual-order-modal').remove()">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    addManualOrderItemRow();
}

window.addManualOrderItemRow = () => {
    const row = document.createElement('div');
    row.className = 'mo-item-row';
    row.style.cssText = 'display:flex; gap:0.5rem; margin-bottom:0.5rem;';
    row.innerHTML = `
        <input type="text" placeholder="Pieza" class="i-name" style="flex:2; padding:0.4rem; border-radius:4px; border:1px solid var(--border); background:var(--surface2); color:white;">
        <input type="number" value="1" class="i-qty" style="width:50px; padding:0.4rem; border-radius:4px; border:1px solid var(--border); background:var(--surface2); color:white;">
        <button onclick="this.parentElement.remove()" style="background:none; border:none; color:var(--accent); cursor:pointer;">✖</button>
    `;
    document.getElementById('mo-items-list').appendChild(row);
};

window.saveManualOrder = async () => {
    const customer = document.getElementById('mo-customer').value;
    const brand = document.getElementById('mo-brand').value;
    if (!customer || !brand) return alert("Cliente y Marca son obligatorios");

    const items = Array.from(document.querySelectorAll('.mo-item-row')).map(r => ({
        part_name: r.querySelector('.i-name').value || 'Repuesto',
        quantity: parseInt(r.querySelector('.i-qty').value) || 1
    }));

    try {
        const res = await window.AGN_CORE.fetchWithTimeout('api/create-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': window.AGN_CORE.adminPass
            },
            body: JSON.stringify({
                customer_name: customer,
                customer_phone: document.getElementById('mo-phone').value,
                vehicle_brand: brand,
                vehicle_model: document.getElementById('mo-model').value,
                items
            })
        });
        if (res.ok) {
            window.AGN_CORE.showToast("Orden creada");
            document.getElementById('manual-order-modal').remove();
            loadOrders();
        }
    } catch (e) { alert("Error al guardar"); }
};
