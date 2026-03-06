import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const adminPassword = req.headers['x-admin-password'];

    // 1. Intentar validar contra la tabla admin_users de Supabase
    const { data: user, error: authError } = await supabase
        .from('admin_users')
        .select('username')
        .eq('password_hash', adminPassword)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

    if (!user) {
        // Fallback a variable de entorno para no romper accesos existentes durante la migración
        if (adminPassword !== process.env.PASSWORD_ADMIN) {
            return res.status(401).json({ message: 'No autorizado' });
        }
    }

    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                id,
                readable_id,
                part_name,
                part_number,
                status,
                vin,
                vehicle_brand,
                vehicle_model,
                vehicle_year,
                supplier_url,
                tracking_number,
                estimated_delivery_client,
                notes,
                created_at,
                updated_at,
                customers (
                    full_name,
                    phone
                )
            `)
            .order('created_at', { ascending: false });


        if (error) throw error;

        return res.status(200).json(orders);

    } catch (error) {
        console.error('Error al obtener pedidos:', error);
        return res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
}
