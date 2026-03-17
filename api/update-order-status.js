import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const adminPassword = req.headers['x-admin-password'];
    if (!adminPassword) {
        return res.status(401).json({ message: 'No autorizado (debe proporcionar contraseña)' });
    }

    // 1. Validar por env var (más directo)
    const passEnv = process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN;
    let isAuthed = (passEnv && adminPassword === passEnv);

    // 2. Si no pasó por env var, validar por DB
    if (!isAuthed) {
        try {
            const { data: user } = await supabase
                .from('admin_users')
                .select('username')
                .eq('password_hash', adminPassword)
                .eq('is_active', true)
                .maybeSingle();

            if (user) isAuthed = true;
        } catch (e) {
            console.error("Supabase admin auth error:", e);
        }
    }

    if (!isAuthed) {
        return res.status(401).json({ message: 'No autorizado' });
    }

    const { orderId, newStatus } = req.body;

    const validStatuses = [
        'Solicitado',
        'Cotizado',
        'Comprado',
        'Tránsito 1 (Prov→Log)',
        'Tránsito 2 (Log→EC)',
        'En Aduana',
        'Entregado',
        'Recogido en Local',
        'Cancelado'
    ];
    if (!orderId || !newStatus || !validStatuses.includes(newStatus)) {
        return res.status(400).json({
            message: 'Datos inválidos.',
            received: { orderId, newStatus },
            validStatuses
        });
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
