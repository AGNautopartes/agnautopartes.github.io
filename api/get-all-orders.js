import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const adminPassword = req.headers['x-admin-password'];
    if (adminPassword !== process.env.PASSWORD_ADMIN) {
        return res.status(401).json({ message: 'No autorizado' });
    }

    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                id,
                part_name,
                status,
                vin,
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
