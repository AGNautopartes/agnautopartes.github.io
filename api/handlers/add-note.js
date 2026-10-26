// api/add-note.js
import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });

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
            const { data: user } = await supabase
                .from('admin_users')
                .select('username')
                .eq('password_hash', adminPassword)
                .eq('is_active', true)
                .maybeSingle();
            if (user) isAuthed = true;
        } catch (e) { console.error("Auth error:", e); }
    }
    
    if (!isAuthed) return res.status(401).json({ message: 'No autorizado' });

    const { orderId, content, author = 'Admin' } = req.body;
    if (!orderId || !content) return res.status(400).json({ message: 'orderId y content son requeridos' });

    try {
        const { data, error } = await supabase
            .from('order_notes')
            .insert([{ order_id: orderId, content, author }])
            .select().single();

        if (error) throw error;
        return res.status(201).json({ message: 'Nota agregada', note: data });
    } catch (error) {
        return res.status(500).json({ message: 'Error interno', error: error.message });
    }
}
