import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const { phone } = req.query;

    if (!phone) {
        return res.status(400).json({ message: 'El número de teléfono es requerido' });
    }

    try {
        // 1. Buscar el cliente por teléfono
        const { data: customer, error: customerError } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', phone.replace(/\D/g, ''))
            .single();

        if (customerError) {
            if (customerError.code === 'PGRST116') {
                return res.status(404).json({ message: 'No se encontraron pedidos para este número' });
            }
            throw customerError;
        }

        // 2. Buscar pedidos asociados al cliente
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('part_name, status, updated_at')
            .eq('customer_id', customer.id)
            .order('updated_at', { ascending: false });

        if (ordersError) throw ordersError;

        return res.status(200).json(orders);

    } catch (error) {
        console.error('Error fetching order status:', error);
        return res.status(500).json({
            message: 'Error interno del servidor',
            error: error.message
        });
    }
}
