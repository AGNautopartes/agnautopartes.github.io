// api/create-order.js
// Crea una orden completa con cliente, vehículo y múltiples partes.
import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const adminPassword = req.headers['x-admin-password'];
    const { data: user } = await supabase.from('admin_users').select('username').eq('password_hash', adminPassword).eq('is_active', true).limit(1).maybeSingle();
    if (!user && adminPassword !== process.env.PASSWORD_ADMIN) {
        return res.status(401).json({ message: 'No autorizado' });
    }

    const {
        // Cliente
        customer_name, customer_phone, customer_email,
        // Vehículo
        vehicle_brand, vehicle_model, vehicle_year, vin,
        // Ítems (Legacy support or Array)
        items, // Esperamos [{ part_name, part_number, quantity, cost_fob, sale_price, vendor_name, supplier_url, image_data }]
        part_name, part_number, cost_fob, sale_price, vendor_name, supplier_url, // Legacy single-item fields
        // Logística
        status = 'Solicitado', tracking_number,
        estimated_delivery_client, notes,
        // Meta
        created_by = 'admin'
    } = req.body;

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
                    full_name: customer_name,
                    phone: customer_phone || 'N/A',
                    email: customer_email || '',
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
                part_name: basePartName,
                vin,
                vehicle_brand, vehicle_model, vehicle_year,
                status, tracking_number,
                estimated_delivery_client,
                notes
            }])
            .select().single();

        if (orderErr) throw orderErr;

        // 4. Inicializar registro financiero vacío (Requerido para que la vista sume bien y no se rompa la UI)
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

        // 5. Insertar ítems en la tabla order_items usando el order_id recién creado
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
