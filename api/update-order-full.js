import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });

    const adminPassword = req.headers['x-admin-password'];
    if (adminPassword !== process.env.PASSWORD_ADMIN) return res.status(401).json({ message: 'No autorizado' });

    const {
        orderId,
        part_name, part_number, vin, vehicle_brand, vehicle_model, vehicle_year,
        supplier_url, tracking_number, status,
        cost_fob, sale_price
    } = req.body;

    if (!orderId) return res.status(400).json({ message: 'orderId requerido' });

    try {
        // 1. Actualizar tabla orders
        const { error: orderErr } = await supabase
            .from('orders')
            .update({
                part_name, part_number, vin, vehicle_brand, vehicle_model, vehicle_year,
                supplier_url, tracking_number, status,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (orderErr) throw orderErr;

        // 2. Actualizar tabla financials
        const { error: finErr } = await supabase
            .from('financials')
            .update({
                cost_fob: parseFloat(cost_fob) || 0,
                sale_price: parseFloat(sale_price) || 0,
                updated_at: new Date().toISOString()
            })
            .eq('order_id', orderId);

        if (finErr) throw finErr;

        return res.status(200).json({ message: 'Orden actualizada correctamente' });
    } catch (error) {
        console.error('Error updating order:', error);
        return res.status(500).json({ message: 'Error al actualizar', error: error.message });
    }
}
