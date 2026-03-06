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
    document.getElementById('search-input')?.addEventListener('input', debounce(renderOrders, 300));
    document.getElementById('status-filter')?.addEventListener('change', renderOrders);
    document.getElementById('btn-new-order')?.onclick = openManualOrderModal;
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

    const query = document.getElementById('search-input').value.toLowerCase();
    const filter = document.getElementById('status-filter').value;

    const visible = allOrders.filter(o => {
        const matchSearch = !query ||
            (o.customers?.full_name || '').toLowerCase().includes(query) ||
            (o.part_name || '').toLowerCase().includes(query) ||
            (o.readable_id || '').toLowerCase().includes(query);
        const matchFilter = !filter || o.status === filter;
        return matchSearch && matchFilter;
    });

    if (visible.length === 0) {
        container.innerHTML = '<div class="empty-state">No se encontraron órdenes.</div>';
        return;
    }

    container.innerHTML = visible.map(o => `
        <div class="order-card ${window.selectedOrder?.id === o.id ? 'selected' : ''}" onclick="selectOrder('${o.id}')">
            <div>
                <div class="order-client">${o.customers?.full_name || 'Sin Cliente'}</div>
                <div class="order-part">${o.part_name}</div>
                <div class="order-vehicle">${o.vehicle_brand || ''} ${o.vehicle_model || ''} ${o.vehicle_year || ''}</div>
            </div>
            <div class="order-meta">
                <span class="sbadge s-${o.status.toLowerCase().replace(/\s+/g, '-')}">${o.status}</span>
                <span class="order-date">${new Date(o.created_at).toLocaleDateString()}</span>
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
    panel.classList.remove('empty');

    container.innerHTML = `
        <div class="detail-header">
            <h3>Orden #${order.readable_id}</h3>
            <div class="detail-sub">${order.customers?.full_name}</div>
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
                    <select id="detail-status-select">
                        ${['Solicitado', 'Cotizado', 'Comprado', 'Tránsito 1', 'Tránsito 2', 'En Aduana', 'Entregado', 'Cancelado']
            .map(s => `<option ${order.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                    <button class="btn-action btn-blue" onclick="updateStatus('${order.id}')">Actualizar</button>
                </div>
            </div>
        </div>
    `;
}

async function updateStatus(orderId) {
    const newStatus = document.getElementById('detail-status-select').value;
    try {
        const res = await window.AGN_CORE.fetchWithTimeout('/api/update-order-status', {
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
