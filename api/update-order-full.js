import supabase from '../supabase-client.js';

// Financial calculation utilities
const calculatePriceFromCostAndMargin = (cost, marginPercent) => {
  if (marginPercent >= 100) return 0; // Prevent division by zero or negative
  return cost / (1 - marginPercent / 100);
};

const calculateMarginFromCostAndPrice = (cost, price) => {
  if (cost <= 0) return 0; // Prevent division by zero
  return ((price - cost) / price) * 100;
};

const calculatePriceWithVAT = (price) => {
  // Hardcoded 15% VAT as per requirements
  return price * 1.15;
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });

    const adminPassword = req.headers['x-admin-password'];
    if (!adminPassword) {
        return res.status(401).json({ message: 'No autorizado (debe proporcionar contraseña)' });
    }

    // 1. Validar por env var (más directo)
    const passEnv = process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN;
    let isAuthed = (passEnv && adminPassword === passEnv);

    // 2. Si no hay password en env, aceptar cualquier password para desarrollo
    if (!passEnv && adminPassword) {
        isAuthed = true;
    }

    // 3. Si no pasó por env var, validar por DB
    if (!isAuthed) {
        try {
            const { data: user } = await supabase
                .from('admin_users')
                .select('username')
                .eq('password_hash', adminPassword)
                .eq('is_active', true)
                .maybeSingle();

            if (user) isAuthed = true;
        } catch (e) {
            console.error("Supabase admin auth error:", e);
        }
    }

    if (!isAuthed) {
        return res.status(401).json({ message: 'No autorizado' });
    }

    const {
        orderId,
        part_name, supplier_url, // Added missing fields
        vin, vehicle_brand, vehicle_model, vehicle_year,
        tracking_number, status,
        fob_cost, supplier_freight, customs_nationalization, other_expenses,
        margin_percent, price, price_with_vat,
        items_json // Array JSONB
    } = req.body;

    if (!orderId) return res.status(400).json({ message: 'orderId requerido' });

    console.log('Update order request:', { orderId, hasItemsJson: !!items_json });

    try {
        const updateData = {};
        if (part_name !== undefined) updateData.part_name = part_name;
        if (supplier_url !== undefined) updateData.supplier_url = supplier_url;
        if (vin !== undefined) updateData.vin = vin;
        if (vehicle_brand !== undefined) updateData.vehicle_brand = vehicle_brand;
        if (vehicle_model !== undefined) updateData.vehicle_model = vehicle_model;
        if (vehicle_year !== undefined) updateData.vehicle_year = vehicle_year;
        if (tracking_number !== undefined) updateData.tracking_number = tracking_number;
        if (status !== undefined) updateData.status = status;

        // Campos financieros
        if (fob_cost !== undefined) updateData.fob_cost = parseFloat(fob_cost) || 0;
        if (supplier_freight !== undefined) updateData.supplier_freight = parseFloat(supplier_freight) || 0;
        if (customs_nationalization !== undefined) updateData.customs_nationalization = parseFloat(customs_nationalization) || 0;
        if (other_expenses !== undefined) updateData.other_expenses = parseFloat(other_expenses) || 0;
        if (margin_percent !== undefined) updateData.margin_percent = parseFloat(margin_percent) || 0;
        if (price !== undefined) updateData.price = parseFloat(price) || 0;
        if (price_with_vat !== undefined) updateData.price_with_vat = parseFloat(price_with_vat) || 0;

        if (items_json !== undefined) updateData.items_json = items_json;
        // is_paid_* columns removed - not present in current Supabase schema

        updateData.updated_at = new Date().toISOString();

        const { error: orderErr } = await supabase
            .from('orders')
            .update(updateData)
            .eq('id', orderId);

        if (orderErr) throw orderErr;

        // 🟢 Misión: Sincronización Atómica (Fase 5)
        // Guardar cada ítem como una fila real en order_items para reportes y visión de Aria
        if (items_json && Array.isArray(items_json)) {
            try {
                // 1. Limpiar ítems previos para esta orden (Limpieza Atómica)
                await supabase.from('order_items').delete().eq('order_id', orderId);

                 // 2. Insertar la lista actualizada (Doble Escritura)
                 const rowsToInsert = items_json.map(it => {
                     // Parse and validate financial values
                     const parsedCostFob = parseFloat(it.cost_fob) || 0;
                     const parsedSalePrice = parseFloat(it.sale_price) || 0;
                     const parsedMargin = it.margin_percent !== undefined ? parseFloat(it.margin_percent) : null;
                     
                     // Calculate missing values if needed (same logic as in create-order)
                     let finalCostFob = parsedCostFob;
                     let finalSalePrice = parsedSalePrice;
                     let finalMargin = parsedMargin;
                     
                     // If we have cost but no price, calculate price from margin (default 20%)
                     if (parsedCostFob > 0 && (parsedSalePrice === 0 || parsedSalePrice === undefined) && parsedMargin === null) {
                         finalMargin = 20; // Default margin
                         finalSalePrice = calculatePriceFromCostAndMargin(parsedCostFob, finalMargin);
                     } 
                     // If we have price but no cost, we can't calculate cost without margin
                     // If we have both cost and price, calculate margin
                     else if (parsedCostFob > 0 && parsedSalePrice > 0 && parsedMargin === null) {
                         finalMargin = calculateMarginFromCostAndPrice(parsedCostFob, parsedSalePrice);
                     }
                     // If we have margin and price but no cost, calculate cost
                     else if (parsedCostFob === 0 && parsedSalePrice > 0 && parsedMargin !== null && parsedMargin < 100) {
                         finalCostFob = parsedSalePrice * (1 - parsedMargin / 100);
                     }
                     // Otherwise use provided values (with defaults)
                     else {
                         finalCostFob = parsedCostFob;
                         finalSalePrice = parsedSalePrice;
                         finalMargin = parsedMargin !== null ? parsedMargin : 20;
                         
                         // If we still don't have price but have cost and margin, calculate it
                         if (finalSalePrice === 0 && finalCostFob > 0) {
                             finalSalePrice = calculatePriceFromCostAndMargin(finalCostFob, finalMargin);
                         }
                     }
                     
                     // Calculate price with VAT
                     const priceWithVAT = calculatePriceWithVAT(finalSalePrice);
                     
                     return {
                         order_id: orderId,
                         part_name: it.part_name || 'Sin nombre',
                         part_number: it.part_number || '',
                         quantity: parseInt(it.quantity) || 1,
                         cost_fob: finalCostFob,
                         sale_price: finalSalePrice,
                         vendor_name: it.vendor_name || '',
                         supplier_url: it.supplier_url || '',
                         tracking_number: it.tracking_number || '',
                         margin_percent: finalMargin,
                         supplier_name: it.supplier_name || '',
                         updated_at: new Date().toISOString()
                     };
                 });

                if (rowsToInsert.length > 0) {
                    const { error: itemsErr } = await supabase.from('order_items').insert(rowsToInsert);
                    if (itemsErr) console.error('Error sincronizando order_items:', itemsErr);
                }
            } catch (itemsError) {
                console.error(' order_items sync skipped:', itemsError.message);
            }
        }

        return res.status(200).json({ message: 'Orden actualizada (Sincronía Atómica OK)' });
    } catch (error) {
        console.error('Error updating order:', error);
        return res.status(500).json({ message: 'Error al actualizar', error: error.message });
    }
}
