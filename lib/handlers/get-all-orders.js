import supabase from '../../supabase-client.js';

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
        // Paginación con cursor (UUID) para evitar offsets costosos
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const cursor = req.query.cursor || null;
        const statusFilter = req.query.status || null;
        const orderRef = String(req.query.orderRef || '').trim();

        let query = supabase
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
                items_json,
                costo_fob,
                margen_markdown,
                precio_venta,
                comision_vendedor,
                created_at,
                updated_at,
                customers (
                    full_name,
                    phone,
                    ruc,
                    cedula
                )
            `)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(limit);

        // Cursor-based pagination: fetch orders created before cursor_id
        if (cursor) {
            const { data: cursorOrder } = await supabase
                .from('orders')
                .select('created_at, id')
                .eq('id', cursor)
                .maybeSingle();

            if (cursorOrder) {
                query = query.lt('created_at', cursorOrder.created_at);
            } else {
                return res.status(410).json({ message: 'Cursor expirado o inválido' });
            }
        }

        if (statusFilter) {
            query = query.eq('status', statusFilter);
        }

        if (orderRef) {
            const readableId = orderRef.toUpperCase().startsWith('ORD-')
                ? orderRef.toUpperCase()
                : `ORD-${orderRef}`;
            query = query.eq('readable_id', readableId).limit(1);
        }

        const { data: orders, error: ordersError } = await query;

        if (ordersError) throw ordersError;

        const hasMore = orders && orders.length === limit;
        const nextCursor = hasMore ? orders[orders.length - 1].id : null;

        if (orders && orders.length > 0) {
            try {
                const orderIds = orders.map(o => o.id);
                const { data: allItems } = await supabase
                    .from('order_items')
                    .select(`
                        id, order_id, part_name, part_number, quantity,
                        cost_fob, fob_cost, supplier_freight,
                        customs_nationalization, sale_price, price,
                        price_with_vat, margin_percent, item_status,
                        vendor_name, supplier_url, tracking_number,
                        order_date, estimated_arrival
                    `)
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

        return res.status(200).json({
            data: orders || [],
            nextCursor,
            hasMore: !!hasMore
        });

    } catch (error) {
        console.error('Error al obtener pedidos:', error);
        return res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
}
