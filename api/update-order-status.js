import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const adminPassword = req.headers['x-admin-password'];
    if (adminPassword !== process.env.PASSWORD_ADMIN) {
        return res.status(401).json({ message: 'No autorizado' });
    }

    const { orderId, newStatus } = req.body;

    const validStatuses = ['Solicitado', 'Cotizado', 'Comprado', 'En Tránsito', 'Entregado', 'Cancelado'];
    if (!orderId || !newStatus || !validStatuses.includes(newStatus)) {
        return res.status(400).json({ message: 'Datos inválidos. orderId y newStatus son requeridos.' });
    }

    try {
        const { data, error } = await supabase
            .from('orders')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', orderId)
            .select()
            .single();

        if (error) throw error;

        return res.status(200).json({ message: 'Estado actualizado con éxito', order: data });

    } catch (error) {
        console.error('Error al actualizar pedido:', error);
        return res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
}
