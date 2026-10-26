import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const {
        nombre_cliente,
        contacto_cliente,
        marca_vehiculo,
        modelo_vehiculo,
        año_vehiculo,
        repuesto_solicitado,
        numero_de_parte,
        vin,
        ubicacion,
        observaciones_resumen,
        source = 'web_form'
    } = req.body;

    try {
        // 1. Buscar o Crear Cliente
        // Intentamos buscar por teléfono (contacto_cliente)
        let { data: customer, error: customerError } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', contacto_cliente)
            .single();

        if (customerError && customerError.code !== 'PGRST116') { // PGRST116 es "no rows found"
            throw customerError;
        }

        if (!customer) {
            const { data: newCustomer, error: createError } = await supabase
                .from('customers')
                .insert([
                    {
                        full_name: nombre_cliente,
                        phone: contacto_cliente,
                        source: source
                    }
                ])
                .select()
                .single();

            if (createError) throw createError;
            customer = newCustomer;
        }

        // 2. Crear el Pedido (Order)
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert([
                {
                    customer_id: customer.id,
                    part_name: repuesto_solicitado,
                    vin: vin || (numero_de_parte !== 'No proporcionado' ? numero_de_parte : null),
                    status: 'Solicitado'
                }
            ])
            .select()
            .single();

        if (orderError) throw orderError;

        // 3. (Opcional) Guardar en historial de Quotes
        await supabase.from('quotes').insert([
            {
                customer_name: nombre_cliente,
                data: {
                    ...req.body,
                    timestamp: new Date().toISOString()
                }
            }
        ]);

        // 4. Responder éxito
        return res.status(200).json({
            message: 'Cotización guardada con éxito',
            orderId: order.id,
            customerId: customer.id
        });

    } catch (error) {
        console.error('Error saving quotation:', error);
        return res.status(500).json({
            message: 'Error interno al guardar la cotización',
            error: error.message
        });
    }
}
