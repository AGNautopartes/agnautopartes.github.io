import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });

    const adminPassword = req.headers['x-admin-password'];
    const { data: user } = await supabase.from('admin_users').select('username').eq('password_hash', adminPassword).eq('is_active', true).limit(1).maybeSingle();
    if (!user && adminPassword !== process.env.PASSWORD_ADMIN) return res.status(401).json({ message: 'No autorizado' });

    const {
        orderId,
        vin, vehicle_brand, vehicle_model, vehicle_year,
        tracking_number, status,
        costo_fob, shipping_logistica, shipping_ecuador, ad_valorem,
        margen_markdown, precio_venta, comision_vendedor,
        items_json // Array JSONB
    } = req.body;

    if (!orderId) return res.status(400).json({ message: 'orderId requerido' });

    try {
        const updateData = {};
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

        updateData.updated_at = new Date().toISOString();

        const { error: orderErr } = await supabase
            .from('orders')
            .update(updateData)
            .eq('id', orderId);

        if (orderErr) throw orderErr;

        return res.status(200).json({ message: 'Orden actualizada correctamente' });
    } catch (error) {
        console.error('Error updating order:', error);
        return res.status(500).json({ message: 'Error al actualizar', error: error.message });
    }
}
