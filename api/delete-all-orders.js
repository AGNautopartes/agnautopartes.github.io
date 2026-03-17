import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'DELETE') return res.status(405).json({ message: 'Método no permitido' });

    const adminPassword = req.headers['x-admin-password'];
    let user = null;
    try {
        const { data } = await supabase.from('admin_users').select('username').eq('password_hash', adminPassword).eq('is_active', true).limit(1).maybeSingle();
        user = data;
    } catch (e) {
        // Fallback to Env validation if RLS fails
    }
    if (!user && adminPassword !== process.env.PASSWORD_ADMIN) return res.status(401).json({ message: 'No autorizado' });

    try {
        // Borrar todas las órdenes
        const { error: orderError } = await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (orderError) throw orderError;

        // Borrar todos los clientes (opcional pero bueno para limpiar PRUEBAS)
        const { error: custError } = await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (custError) console.error("Error al borrar clientes en limpieza:", custError.message);

        return res.status(200).json({ message: 'Todas las órdenes eliminadas' });
    } catch (error) {
        return res.status(500).json({ message: 'Error al eliminar todas las órdenes', error: error.message });
    }
}
