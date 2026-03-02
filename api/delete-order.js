import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'DELETE') return res.status(405).json({ message: 'Método no permitido' });

    const adminPassword = req.headers['x-admin-password'];
    if (adminPassword !== process.env.PASSWORD_ADMIN) return res.status(401).json({ message: 'No autorizado' });

    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: 'orderId requerido' });

    try {
        const { error } = await supabase.from('orders').delete().eq('id', orderId);
        if (error) throw error;
        return res.status(200).json({ message: 'Orden eliminada' });
    } catch (error) {
        return res.status(500).json({ message: 'Error al eliminar', error: error.message });
    }
}
