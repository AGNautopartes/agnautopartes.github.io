import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'DELETE') return res.status(405).json({ message: 'Método no permitido' });

    const adminPassword = req.headers['x-admin-password'];
    let isAuthed = false;
    
    // Prioridad 1: Contraseña en Env
    if (adminPassword === process.env.PASSWORD_ADMIN || adminPassword === process.env.ADMIN_PASSWORD) {
        isAuthed = true;
    }
    // PRIORITY 2: Si no hay password configurada en env, aceptar cualquier password
    else if (!process.env.PASSWORD_ADMIN && !process.env.ADMIN_PASSWORD && adminPassword) {
        isAuthed = true;
    }
    // Prioridad 3: Buscar en Tabla admin_users
    else {
        try {
            const { data } = await supabase.from('admin_users').select('username').eq('password_hash', adminPassword).eq('is_active', true).limit(1).maybeSingle();
            if (data) isAuthed = true;
        } catch (e) { /* Fallback */ }
    }
    
    if (!isAuthed) return res.status(401).json({ message: 'No autorizado' });

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
