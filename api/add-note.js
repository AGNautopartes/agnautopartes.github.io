// api/add-note.js
import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });

    const adminPassword = req.headers['x-admin-password'];
    if (adminPassword !== process.env.PASSWORD_ADMIN) return res.status(401).json({ message: 'No autorizado' });

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
