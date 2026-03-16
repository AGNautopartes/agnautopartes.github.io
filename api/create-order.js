// api/create-order.js
// Crea una orden completa con cliente, vehículo y múltiples partes.
import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const adminPassword = req.headers['x-admin-password'];
    let user = null;
    try {
        const { data } = await supabase.from('admin_users').select('username').eq('password_hash', adminPassword).eq('is_active', true).limit(1).maybeSingle();
        user = data;
    } catch (e) {
        // Fallback to Env validation if RLS fails
    }
    if (!user && adminPassword !== process.env.PASSWORD_ADMIN) {
        return res.status(401).json({ message: 'No autorizado' });
    }

    // Extraer TODOS los posibles nombres de campo que la IA puede enviar
    const body = req.body || {};
    
    // Cliente - cualquier nombre de campo posible
    const customer_name = body.customer_name || body.cliente || body.name || body.nombre || body.client_name || body.customerName || null;
    const customer_phone = body.customer_phone || body.telefono || body.phone || 'N/A';
    const customer_email = body.customer_email || body.email || body.correo || '';
    
    // Vehículo - cualquier nombre de campo posible
    const vehicle_model = body.vehicle_model || body.modelo || body.carro || body.model || null;
    const vehicle_brand = body.vehicle_brand || body.marca || body.brand || 'N/A';
    const vehicle_year = body.vehicle_year || body.ano || body.year || 'N/A';
    const vin = body.vin || '';
    
    // Ítems
    const items = body.items;
    const part_name = body.part_name || body.main_part || body.pieza || body.repuesto || '';
    const part_number = body.part_number || body.numero_pieza || '';
    const cost_fob = body.cost_fob || body.costo || 0;
    const sale_price = body.sale_price || body.precio || 0;
    const vendor_name = body.vendor_name || body.vendedor || '';
    const supplier_url = body.supplier_url || body.url || '';
    
    // Logística
    const status = body.status || 'Solicitado';
    const tracking_number = body.tracking_number || '';
    const estimated_delivery_client = body.estimated_delivery_client || '';
    const notes = body.notes || body.notas || '';
    const created_by = body.created_by || 'admin';

    // Normalizar valores nulos o undefined a strings vacíos o valores por defecto
    const safeString = (val, def = '') => (val === null || val === undefined) ? def : String(val);
    const safeName = (val) => (val === null || val === undefined || String(val).trim() === '') ? 'Cliente Sin Nombre' : String(val).trim();

    // Validación mínima requerida
    if (!customer_name || !vehicle_model) {
        return res.status(400).json({ 
            message: 'Faltan datos requeridos', 
            error: 'Se requiere: customer_name (o cliente/name/nombre) y vehicle_model (o modelo/carro/model)' 
        });
    }

    try {
        // 1. Buscar o crear cliente
        let query = supabase.from('customers').select('id, full_name, phone');
        if (customer_phone && customer_phone !== 'N/A' && customer_phone !== '') {
            query = query.eq('phone', customer_phone);
        } else {
            query = query.eq('full_name', customer_name);
        }

        let { data: customer } = await query.maybeSingle();

        if (!customer) {
            const { data: newCustomer, error: createErr } = await supabase
                .from('customers')
                .insert([{
                    full_name: safeName(customer_name),
                    phone: safeString(customer_phone, 'N/A'),
                    email: safeString(customer_email, ''),
                    source: 'manual'
                }])
                .select().single();
            if (createErr) throw createErr;
            customer = newCustomer;
        }

        // 2. Preparar los ítems (Convertir legacy a array si es necesario)
        let partsList = [];
        if (items && Array.isArray(items) && items.length > 0) {
            partsList = items;
        } else if (part_name) {
            partsList = [{
                part_name,
                part_number: part_number || '',
                quantity: 1,
                cost_fob: parseFloat(cost_fob) || 0,
                sale_price: parseFloat(sale_price) || 0,
                vendor_name: vendor_name || '',
                supplier_url: supplier_url || ''
            }];
        }

        // 3. Crear la cabecera de la orden (con nombre visual dinámico)
        // Determinamos el part_name solo para propósitos visuales en el UI (lista lateral)
        let basePartName = 'Orden de Repuestos'; // Valor por defecto si viene vacía
        if (partsList.length > 0 && partsList[0].part_name) {
            basePartName = partsList[0].part_name; // Toma el nombre del primer ítem
        }

        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .insert([{
                customer_id: customer.id,
                part_name: safeString(basePartName, 'Orden de Repuestos'),
                vin: safeString(vin, ''),
                vehicle_model: safeString(vehicle_model, 'N/A'),
                vehicle_year: safeString(vehicle_year, 'N/A'),
                status: safeString(status, 'Solicitado'),
                tracking_number: safeString(tracking_number, ''),
                estimated_delivery_client: estimated_delivery_client || null,
                notes: safeString(notes, ''),
                items_json: partsList // Sincronización crucial para el Panel de Admin
            }])
            .select().single();

        if (orderErr) throw orderErr;

        // 4. Inicializar registro financiero vacío
        const { error: finErr } = await supabase
            .from('financials')
            .insert([{
                order_id: order.id,
                cost_fob: 0,
                shipping_cost: 0,
                customs_cost: 0,
                taxes: 0,
                other_expenses: 0,
                sale_price: 0,
                margin_percent: 20
            }]);

        if (finErr) throw finErr;

        // 5. Insertar ítems en order_items
        if (partsList.length > 0) {
            const itemsToInsert = partsList.map(item => ({
                order_id: order.id,
                part_name: item.part_name,
                part_number: item.part_number || '',
                quantity: item.quantity || 1,
                cost_fob: parseFloat(item.cost_fob) || 0,
                sale_price: parseFloat(item.sale_price) || 0,
                vendor_name: item.vendor_name || '',
                supplier_url: item.supplier_url || '',
                image_data: item.image_data || ''
            }));

            const { error: itemsErr } = await supabase
                .from('order_items')
                .insert(itemsToInsert);

            if (itemsErr) throw itemsErr;
        }


        // 5. Registrar en historial
        await supabase.from('order_history').insert([{
            order_id: order.id,
            changed_by: created_by,
            field_changed: 'status',
            old_value: null,
            new_value: status
        }]);

        return res.status(201).json({
            message: `Orden creada para ${customer.full_name} con ${partsList.length} ítems`,
            orderId: order.id,
            customerId: customer.id
        });

    } catch (error) {
        console.error('Error en create-order:', error);
        return res.status(500).json({ message: 'Error interno', error: error.message });
    }
}
