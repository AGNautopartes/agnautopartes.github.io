import supabase from '../supabase-client.js';

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const readableIdCandidates = value => {
    const normalized = String(value || '').trim().replace(/^#/, '').toUpperCase();
    if (!normalized) return [];
    const withoutPrefix = normalized.replace(/^ORD-/, '');
    return [...new Set([normalized, withoutPrefix, `ORD-${withoutPrefix}`])];
};

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
        const customerName = String(req.query?.customerName || '').trim();
        const ariaView = req.query?.view === 'aria' || Boolean(customerName);
        const orderReference = String(req.query?.orderRef || '').trim();
        const singleOrderView = Boolean(orderReference);
        const requestedLimit = Number.parseInt(req.query?.limit, 10);
        const ariaLimit = Number.isFinite(requestedLimit)
            ? Math.min(Math.max(requestedLimit, 1), 2)
            : 2;
        const customerRelation = customerName ? 'customers!inner' : 'customers';
        const fields = ariaView
            ? `
id,
readable_id,
part_name,
status,
alarm,
vehicle_brand,
vehicle_model,
vehicle_year,
${customerRelation} (
full_name
)
`
            : `
id,
readable_id,
part_name,
part_number,
status,
alarm,
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
`;

        let ordersQuery = supabase
            .from('orders')
            .select(fields)
            .order('created_at', { ascending: false });

        if (singleOrderView) {
            ordersQuery = UUID_PATTERN.test(orderReference)
                ? ordersQuery.eq('id', orderReference)
                : ordersQuery.in('readable_id', readableIdCandidates(orderReference));
            ordersQuery = ordersQuery.limit(1);
        } else if (customerName) {
            ordersQuery = ordersQuery
                .eq('customers.full_name', customerName)
                .limit(ariaLimit);
        } else if (ariaView) {
            ordersQuery = ordersQuery.limit(ariaLimit);
        }

        const { data: orders, error: ordersError } = await ordersQuery;

        if (ordersError) throw ordersError;

        if (!ariaView && orders && orders.length > 0) {
            try {
                // Fetch order items for these orders
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

            if (!singleOrderView) {
                try {
                    const { data: financialSummaries } = await supabase
                        .from('order_financial_summary')
                        .select('*');

                    if (financialSummaries) {
                        const financialMap = {};
                        financialSummaries.forEach(summary => {
                            financialMap[summary.order_id] = summary;
                        });
                        orders.forEach(o => {
                            o.financial_summary = financialMap[o.id] || null;
                        });
                    }
                } catch (financialErr) {
                    console.error('Error fetching financial summary:', financialErr);
                }
            }
        }

        return res.status(200).json(orders);

    } catch (error) {
        console.error('Error al obtener pedidos:', error);
        return res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
}
