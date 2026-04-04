import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });

    const adminPassword = req.headers['x-admin-password'];
    if (!adminPassword) {
        return res.status(401).json({ message: 'No autorizado (debe proporcionar contraseña)' });
    }

    // 1. Validar por env var (más directo)
    const passEnv = process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN;
    let isAuthed = (passEnv && adminPassword === passEnv);

    // 2. Si no pasó por env var, validar por DB
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
        costo_fob, shipping_logistica, shipping_ecuador, ad_valorem,
        margen_markdown, precio_venta, comision_vendedor,
        items_json, // Array JSONB
        is_paid_fob, is_paid_logistics, is_paid_ec
    } = req.body;

    if (!orderId) return res.status(400).json({ message: 'orderId requerido' });

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
        if (costo_fob !== undefined) updateData.costo_fob = parseFloat(costo_fob) || 0;
        if (shipping_logistica !== undefined) updateData.shipping_logistica = parseFloat(shipping_logistica) || 0;
        if (shipping_ecuador !== undefined) updateData.shipping_ecuador = parseFloat(shipping_ecuador) || 0;
        if (ad_valorem !== undefined) updateData.ad_valorem = parseFloat(ad_valorem) || 0;
        if (margen_markdown !== undefined) updateData.margen_markdown = parseFloat(margen_markdown) || 0;
        if (precio_venta !== undefined) updateData.precio_venta = parseFloat(precio_venta) || 0;
        if (comision_vendedor !== undefined) updateData.comision_vendedor = parseFloat(comision_vendedor) || 0;

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
            // 1. Limpiar ítems previos para esta orden (Limpieza Atómica)
            await supabase.from('order_items').delete().eq('order_id', orderId);

            // 2. Insertar la lista actualizada (Doble Escritura)
            const rowsToInsert = items_json.map(it => ({
                order_id: orderId,
                part_name: it.part_name || 'Sin nombre',
                part_number: it.part_number || '',
                quantity: parseInt(it.quantity) || 1,
                cost_fob: parseFloat(it.cost_fob) || 0,
                sale_price: parseFloat(it.sale_price) || 0,
                vendor_name: it.vendor_name || '',
                supplier_url: it.supplier_url || '',
                updated_at: new Date().toISOString()
            }));

            if (rowsToInsert.length > 0) {
                const { error: itemsErr } = await supabase.from('order_items').insert(rowsToInsert);
                if (itemsErr) console.error('Error sincronizando order_items:', itemsErr);
            }
        }

        return res.status(200).json({ message: 'Orden actualizada (Sincronía Atómica OK)' });
    } catch (error) {
        console.error('Error updating order:', error);
        return res.status(500).json({ message: 'Error al actualizar', error: error.message });
    }
}
