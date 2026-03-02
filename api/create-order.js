// api/create-order.js
// Crea una orden completa con cliente, vehículo, parte y financieros.
import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const adminPassword = req.headers['x-admin-password'];
    if (adminPassword !== process.env.PASSWORD_ADMIN) {
        return res.status(401).json({ message: 'No autorizado' });
    }

    const {
        // Cliente
        customer_name, customer_phone, customer_email,
        // Vehículo y parte
        vehicle_brand, vehicle_model, vehicle_year,
        part_name, part_number, supplier_url, vin,
        // Logística
        status = 'Solicitado', tracking_number, vendor_name,
        estimated_delivery_client, notes,
        // Financieros
        cost_fob = 0, shipping_cost = 0, customs_cost = 0,
        taxes = 0, other_expenses = 0, sale_price = 0,
        // Meta
        created_by = 'admin'
    } = req.body;

    try {
        // 1. Buscar o crear cliente
        let { data: customer } = await supabase
            .from('customers')
            .select('id, full_name')
            .eq('phone', customer_phone)
            .maybeSingle();

        if (!customer) {
            const { data: newCustomer, error: createErr } = await supabase
                .from('customers')
                .insert([{ full_name: customer_name, phone: customer_phone, email: customer_email, source: 'manual' }])
                .select().single();
            if (createErr) throw createErr;
            customer = newCustomer;
        }

        // 2. Crear la orden
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .insert([{
                customer_id: customer.id,
                part_name, part_number, vin,
                vehicle_brand, vehicle_model, vehicle_year,
                supplier_url, status, tracking_number,
                vendor_name, estimated_delivery_client,
                notes
            }])
            .select().single();

        if (orderErr) throw orderErr;

        // 3. Crear financieros
        const { error: finErr } = await supabase
            .from('financials')
            .insert([{
                order_id: order.id,
                cost_fob, shipping_cost, customs_cost,
                taxes, other_expenses, sale_price
            }]);
        if (finErr) throw finErr;

        // 4. Registrar en historial
        await supabase.from('order_history').insert([{
            order_id: order.id,
            changed_by: created_by,
            field_changed: 'status',
            old_value: null,
            new_value: status
        }]);

        return res.status(201).json({
            message: `Orden creada para ${customer.full_name}`,
            orderId: order.id,
            customerId: customer.id,
            isNewCustomer: !customer.created_at
        });

    } catch (error) {
        console.error('Error en create-order:', error);
        return res.status(500).json({ message: 'Error interno', error: error.message });
    }
}
