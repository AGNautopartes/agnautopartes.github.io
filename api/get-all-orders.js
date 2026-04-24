import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
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
                costo_fob,
                shipping_logistica,
                shipping_ecuador,
                ad_valorem,
                margen_markdown,
                precio_venta,
                comision_vendedor,
                items_json,
                created_at,
                updated_at,
                customers (
                    full_name,
                    phone,
                    ruc,
                    cedula
                )
            `)
            .order('created_at', { ascending: false });


        if (orders && orders.length > 0) {
            try {
                const orderIds = orders.map(o => o.id);
                const { data: allItems } = await supabase
                    .from('order_items')
                    .select('*')
                    .in('order_id', orderIds);

                if (allItems) {
                    const itemsMap = {};
                    allItems.forEach(item => {
                        if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
                        itemsMap[item.order_id].push(item);
                    });
                    orders.forEach(o => {
                        o.order_items = itemsMap[o.id] || [];
                    });
                }
            } catch (itemsErr) {
                console.error('Error fetching order_items:', itemsErr);
            }
        }

        if (error) throw error;

        return res.status(200).json(orders);

    } catch (error) {
        console.error('Error al obtener pedidos:', error);
        return res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
}
