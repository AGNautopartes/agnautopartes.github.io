import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });

    const adminPassword = req.headers['x-admin-password'];
    if (adminPassword !== process.env.PASSWORD_ADMIN) return res.status(401).json({ message: 'No autorizado' });

    const {
        orderId,
        vin, vehicle_brand, vehicle_model, vehicle_year,
        tracking_number, status,
        items, // Array [{ id, part_name, part_number, quantity, cost_fob, sale_price, vendor_name, buy_link, image_data }]
        itemsToDelete // Array of IDs to remove
    } = req.body;

    if (!orderId) return res.status(400).json({ message: 'orderId requerido' });

    try {
        // 1. Actualizar tabla orders
        const { error: orderErr } = await supabase
            .from('orders')
            .update({
                vin, vehicle_brand, vehicle_model, vehicle_year,
                tracking_number, status,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (orderErr) throw orderErr;

        // 2. Gestionar items (Eliminar solicitados)
        if (itemsToDelete && Array.isArray(itemsToDelete) && itemsToDelete.length > 0) {
            const { error: delErr } = await supabase
                .from('order_items')
                .delete()
                .in('id', itemsToDelete);
            if (delErr) throw delErr;
        }

        // 3. Upsert de items recibidos
        if (items && Array.isArray(items) && items.length > 0) {
            const itemsToUpsert = items.map(item => ({
                id: item.id || undefined, // Si no hay ID, Supabase genera uno (INSERT)
                order_id: orderId,
                part_name: item.part_name,
                part_number: item.part_number || '',
                quantity: item.quantity || 1,
                cost_fob: parseFloat(item.cost_fob) || 0,
                sale_price: parseFloat(item.sale_price) || 0,
                vendor_name: item.vendor_name || '',
                buy_link: item.buy_link || '',
                image_data: item.image_data || ''
            }));

            const { error: upsertErr } = await supabase
                .from('order_items')
                .upsert(itemsToUpsert);

            if (upsertErr) throw upsertErr;
        }

        return res.status(200).json({ message: 'Orden e ítems actualizados correctamente' });
    } catch (error) {
        console.error('Error updating order:', error);
        return res.status(500).json({ message: 'Error al actualizar', error: error.message });
    }
}
