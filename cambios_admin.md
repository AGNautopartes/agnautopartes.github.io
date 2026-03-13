### Resumen de Cambios Exactos en `admin.html`

Para cumplir con las instrucciones sin romper la arquitectura monolítica ni el diseño de 3 columnas, realizaré las siguientes modificaciones exactas en `admin.html`:

#### 1. Modificación de `renderDetail(o)` (Aprox. Líneas 1588-1612)
Reemplazaré la sección estática de `Vehículo & Pieza` y `Financieros` por una estructura dinámica:

```html
<!-- Vehículo -->
<div class="detail-section">
    <h4>🚗 Vehículo</h4>
    <div class="info-grid">
        <div class="info-item"><div class="il">Marca</div><div class="iv"><input type="text" id="edit-brand" value="${o.vehicle_brand || ''}"></div></div>
        <div class="info-item"><div class="il">Modelo</div><div class="iv"><input type="text" id="edit-model" value="${o.vehicle_model || ''}"></div></div>
        <div class="info-item"><div class="il">Año</div><div class="iv"><input type="text" id="edit-year" value="${o.vehicle_year || ''}"></div></div>
        <div class="info-item"><div class="il">VIN</div><div class="iv"><input type="text" id="edit-vin" value="${o.vin || ''}" style="font-family:monospace"></div></div>
        <div class="info-item"><div class="il">Tracking</div><div class="iv"><input type="text" id="edit-tracking" value="${o.tracking_number || ''}"></div></div>
    </div>
</div>

<!-- Repuestos Dinámicos -->
<div class="detail-section">
    <div style="display:flex; justify-content:space-between; align-items:center;">
        <h4>⚙️ Repuestos</h4>
        <button class="btn-action btn-sm" onclick="addDetailItem()">+ Añadir Pieza</button>
    </div>
    <div id="dynamic-items-container">
        <!-- Generado dinámicamente desde o.items_json o un bloque vacío -->
    </div>
</div>

<!-- Financieros con Cálculos -->
<div class="detail-section">
    <h4>💰 Financieros</h4>
    <div class="financial-grid">
        <div class="fin-item"><div class="fl">Costo FOB</div><div class="fv"><input type="number" id="edit-fob" value="${o.costo_fob || 0}" step="0.01" oninput="recalculateTotals()"></div></div>
        <div class="fin-item"><div class="fl">Logística</div><div class="fv"><input type="number" id="edit-logistica" value="${o.shipping_logistica || 0}" step="0.01" oninput="recalculateTotals()"></div></div>
        <div class="fin-item"><div class="fl">Shipping EC</div><div class="fv"><input type="number" id="edit-shipping-ec" value="${o.shipping_ecuador || 0}" step="0.01" oninput="recalculateTotals()"></div></div>
        <div class="fin-item"><div class="fl">Ad Valorem</div><div class="fv"><input type="number" id="edit-advalorem" value="${o.ad_valorem || 0}" step="0.01" oninput="recalculateTotals()"></div></div>
        <div class="fin-item"><div class="fl">Costo Total</div><div class="fv"><input type="number" id="calc-costo-total" value="0" readonly style="background:var(--bg-card); color:var(--text2)"></div></div>
        
        <div class="fin-item"><div class="fl">Margen (%)</div><div class="fv"><input type="number" id="edit-margen" value="${(o.margen_markdown * 100) || 30}" step="0.1" oninput="recalculateTotals()"></div></div>
        <div class="fin-item"><div class="fl">Precio Venta (Subtotal)</div><div class="fv"><input type="number" id="edit-sale" value="${o.precio_venta || 0}" step="0.01" oninput="recalculateTotals(true)"></div></div>
        <div class="fin-item"><div class="fl">IVA (15%)</div><div class="fv"><input type="number" id="calc-iva" value="0" readonly style="background:var(--bg-card); color:var(--text2)"></div></div>
        <div class="fin-item"><div class="fl">Total Cliente</div><div class="fv"><input type="number" id="calc-total-iva" value="0" readonly style="background:var(--bg-card); font-weight:bold; color:var(--blue)"></div></div>
        <div class="fin-item"><div class="fl">Comisión Vend.</div><div class="fv"><input type="number" id="edit-comision" value="${o.comision_vendedor || 0}" step="0.01"></div></div>
    </div>
</div>
```

#### 2. Inyección de nuevas funciones JS globales
Añadiré estas funciones al final del `<script>` (sin crear archivos nuevos) para manejar el HTML dinámico y las mates:

```javascript
// Funciones inyectadas para multi-repuesto y cálculos interactivos
function addDetailItem(partName = '', partNo = '', url = '') {
    const container = document.getElementById('dynamic-items-container');
    const div = document.createElement('div');
    div.className = 'info-grid dynamic-item';
    div.style = 'margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.02); border-left: 2px solid var(--blue); border-radius: 4px;';
    div.innerHTML = \`
        <div class="info-item" style="grid-column:1/-1; display:flex; justify-content:space-between;">
            <strong>Repuesto</strong>
            <button class="btn-action btn-sm btn-danger" onclick="this.parentElement.parentElement.remove()">X</button>
        </div>
        <div class="info-item"><div class="il">Nombre</div><div class="iv"><input type="text" class="dyn-part-name" value="\${partName}"></div></div>
        <div class="info-item"><div class="il">Núm. Parte</div><div class="iv"><input type="text" class="dyn-part-no" value="\${partNo}"></div></div>
        <div class="info-item" style="grid-column:1/-1"><div class="il">Link / URL</div><div class="iv"><input type="text" class="dyn-url" value="\${url}"></div></div>
    \`;
    container.appendChild(div);
}

function recalculateTotals(reverse = false) {
    const fob = parseFloat(document.getElementById('edit-fob').value) || 0;
    const log = parseFloat(document.getElementById('edit-logistica').value) || 0;
    const ec = parseFloat(document.getElementById('edit-shipping-ec').value) || 0;
    const adv = parseFloat(document.getElementById('edit-advalorem').value) || 0;
    
    const costoTotal = fob + log + ec + adv;
    document.getElementById('calc-costo-total').value = costoTotal.toFixed(2);

    const inputMargen = document.getElementById('edit-margen');
    const inputSale = document.getElementById('edit-sale');

    if (!reverse) {
        // Calcular Venta a partir del Margen (Markdown)
        let margenDecimal = (parseFloat(inputMargen.value) || 0) / 100;
        if (margenDecimal >= 1) margenDecimal = 0.99; // Evitar división por cero o negativo
        const venta = costoTotal / (1 - margenDecimal);
        inputSale.value = venta.toFixed(2);
    } else {
        // Calcular Margen a partir del Precio Venta manual
        const venta = parseFloat(inputSale.value) || 0;
        if (venta > 0) {
            const margenDecimal = 1 - (costoTotal / venta);
            inputMargen.value = (margenDecimal * 100).toFixed(2);
        }
    }

    // IVA 15% sobre Venta
    const ventaActual = parseFloat(inputSale.value) || 0;
    const iva = ventaActual * 0.15;
    document.getElementById('calc-iva').value = iva.toFixed(2);
    document.getElementById('calc-total-iva').value = (ventaActual + iva).toFixed(2);
}
```

#### 3. Actualización de `updateManualOrder(orderId)` (Aprox. Línea 1626)
Modificar el payload JSON para enviar `items_json` serializado y los campos financieros:

```javascript
        async function updateManualOrder(orderId) {
            // Recopilar items multi-repuesto
            const items = [];
            document.querySelectorAll('.dynamic-item').forEach(el => {
                items.push({
                    part_name: el.querySelector('.dyn-part-name').value,
                    part_number: el.querySelector('.dyn-part-no').value,
                    supplier_url: el.querySelector('.dyn-url').value
                });
            });

            const data = {
                orderId,
                part_name: document.getElementById('edit-part-name').value,
                vehicle_brand: document.getElementById('edit-brand').value,
                vehicle_model: document.getElementById('edit-model').value,
                vehicle_year: document.getElementById('edit-year').value,
                vin: document.getElementById('edit-vin').value,
                tracking_number: document.getElementById('edit-tracking').value,
                status: document.getElementById('det-status').value,
                
                // Financieros
                costo_fob: parseFloat(document.getElementById('edit-fob').value) || 0,
                shipping_logistica: parseFloat(document.getElementById('edit-logistica').value) || 0,
                shipping_ecuador: parseFloat(document.getElementById('edit-shipping-ec').value) || 0,
                ad_valorem: parseFloat(document.getElementById('edit-advalorem').value) || 0,
                margen_markdown: (parseFloat(document.getElementById('edit-margen').value) || 0) / 100,
                precio_venta: parseFloat(document.getElementById('edit-sale').value) || 0,
                comision_vendedor: parseFloat(document.getElementById('edit-comision').value) || 0,
                
                // JSONB
                items_json: items
            };
            // ... resto del fetch ...
```
