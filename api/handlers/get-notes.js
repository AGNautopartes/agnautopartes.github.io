import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Método no permitido' });

    const adminPassword = req.headers['x-admin-password'];
    let user = null;
    try {
        const { data } = await supabase.from('admin_users').select('username').eq('password_hash', adminPassword).eq('is_active', true).limit(1).maybeSingle();
        user = data;
    } catch (e) {
        // Fallback to Env validation if RLS fails
    }
    if (!user && adminPassword !== process.env.PASSWORD_ADMIN) return res.status(401).json({ message: 'No autorizado' });

    const { orderId } = req.query;
    if (!orderId) return res.status(400).json({ message: 'orderId requerido' });

    try {
        const { data, error } = await supabase
            .from('order_notes')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ message: 'Error al obtener notas', error: error.message });
    }
}
