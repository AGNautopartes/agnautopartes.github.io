import supabase from '../supabase-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const adminPassword = req.headers['x-admin-password'];
    if (adminPassword !== process.env.PASSWORD_ADMIN) {
        return res.status(401).json({ message: 'No autorizado' });
    }

    const { message, conversationHistory = [], adminName = 'Admin' } = req.body;
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (!GOOGLE_API_KEY) {
        return res.status(500).json({ error: 'Clave de API de Google no configurada.' });
    }

    // Obtener contexto de órdenes recientes
    const { data: existingOrders } = await supabase
        .from('orders')
        .select('readable_id, status, vehicle_brand, vehicle_model, customers(full_name)')
        .order('created_at', { ascending: false })
        .limit(10);

    const ordersContext = (existingOrders || []).map(o =>
        `[${o.readable_id}] ${o.customers?.full_name} - ${o.vehicle_brand} ${o.vehicle_model || ''} (${o.status})`
    ).join('\n');

    const today = new Date().toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });

    const SYSTEM_PROMPT = `
Eres "Aria", la asistente IA de AGN Autopartes ERP.
HOY ES: ${today}.

CONTEXTO RECIENTE (Órdenes):
${ordersContext}

CAPACIDADES:
- BUSCAR ORDEN: Usa SEARCH_ORDER para encontrar una orden por nombre de cliente, marca o modelo.
- AGREGAR REPUESTOS A ORDEN EXISTENTE: Cuando el usuario pida *agregar*, *añadir* o *actualizar* repuestos de una orden existente, usa ADD_ITEMS_TO_ORDER. NUNCA uses CREATE_QUOTE_VOLATILE para esto.
- CREAR COTIZACIÓN VOLÁTIL: Solo cuando el usuario pida explícitamente *crear una cotización nueva* sin especificar una orden. Usa CREATE_QUOTE_VOLATILE.
- ACTUALIZAR ESTADO: Usa UPDATE_FIELDS para cambiar el status de una orden.
- NOTA: Usa ADD_NOTE para registrar una nota interna.

REGLAS CRÍTICAS:
1. Si el usuario dice "agrega X a la orden de Y", busca el ID de esa orden en el contexto y usa ADD_ITEMS_TO_ORDER.
2. Nunca uses CREATE_QUOTE_VOLATILE si el usuario ya está hablando de una orden existente.
3. Respuestas de máximo 2 líneas de texto.

ACCIONES (JSON al final del mensaje):
- BUSCAR: [ACTION:{"type":"SEARCH_ORDER","data":{"query":"Nombre o Marca"}}]
- AGREGAR REPUESTOS: [ACTION:{"type":"ADD_ITEMS_TO_ORDER","data":{"order_readable_id":"ORD-X","items":[{"part_name":"...","part_number":"","quantity":1,"cost_fob":0,"sale_price":0}]}}]
- COTIZAR NUEVA (Volátil): [ACTION:{"type":"CREATE_QUOTE_VOLATILE","data":{"customer_name":"...","items":[{"part_name":"...","quantity":1,"cost_fob":0,"sale_price":0}]}}]
- ACTUALIZAR ORDEN: [ACTION:{"type":"UPDATE_FIELDS","data":{"order_id":"ORD-X","fields":{"status":"..."}}}]
- NOTA: [ACTION:{"type":"ADD_NOTE","data":{"order_id":"ORD-X","note":"..."}}]

ESTADOS: Solicitado, Cotizado, Comprado, Tránsito 1, Tránsito 2, En Aduana, Entregado, Cancelado.
`.trim();

    // Lógica para procesar búsquedas si el mensaje es explícito (opcional, Aria lo hará vía JSON usualmente)
    // Pero aquí interceptamos el resultado de la acción si Aria solicita buscar.

    const formattedHistory = conversationHistory.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    formattedHistory.push({ role: 'user', parts: [{ text: message }] });
    formattedHistory.unshift({ role: 'user', parts: [{ text: SYSTEM_PROMPT }] });
    formattedHistory.splice(1, 0, { role: 'model', parts: [{ text: 'Entendido. ¿En qué le puedo ayudar hoy?' }] });

    try {
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: formattedHistory })
            }
        );

        if (!geminiRes.ok) throw new Error('Error en la API de Gemini');

        const data = await geminiRes.json();
        const responseText = data.candidates[0].content.parts[0].text;

        const actionTagStart = responseText.indexOf('[ACTION:');
        let action = null;
        let displayText = responseText;

        if (actionTagStart !== -1) {
            try {
                // Find the matching closing bracket by counting nested brackets
                let depth = 0;
                let jsonStart = actionTagStart + '[ACTION:'.length;
                let jsonEnd = jsonStart;
                for (let i = jsonStart; i < responseText.length; i++) {
                    if (responseText[i] === '{') depth++;
                    else if (responseText[i] === '}') {
                        depth--;
                        if (depth === 0) { jsonEnd = i + 1; break; }
                    }
                }
                const jsonStr = responseText.substring(jsonStart, jsonEnd);
                action = JSON.parse(jsonStr);
                // Remove the entire [ACTION:{...}] tag from display text
                displayText = (responseText.substring(0, actionTagStart) + responseText.substring(jsonEnd + 1)).trim();

                // Interceptar búsqueda
                if (action.type === 'SEARCH_ORDER' && action.data.query) {
                    const { data: searchResults } = await supabase
                        .from('orders')
                        .select('readable_id, status, vehicle_brand, vehicle_model, customers(full_name)')
                        .or(`vehicle_brand.ilike.%${action.data.query}%,vehicle_model.ilike.%${action.data.query}%`)
                        .limit(5);

                    if (searchResults && searchResults.length > 0) {
                        const resultsStr = searchResults.map(r => `[${r.readable_id}] ${r.customers?.full_name}: ${r.vehicle_brand} ${r.vehicle_model}`).join(' | ');
                        displayText = `He encontrado estas órdenes: ${resultsStr}. ¿Deseas agregar repuestos a alguna?`;
                    } else {
                        displayText = `No encontré órdenes para "${action.data.query}".`;
                    }
                    action = null;
                }

                // Interceptar agregar items directamente a una orden existente
                if (action && action.type === 'ADD_ITEMS_TO_ORDER' && action.data.order_readable_id) {
                    const orderId = action.data.order_readable_id.replace(/ord-?/i, 'ORD-').trim().toUpperCase();
                    const { data: orderData } = await supabase
                        .from('orders')
                        .select('id, readable_id, customers(full_name)')
                        .eq('readable_id', orderId)
                        .maybeSingle();

                    if (!orderData) {
                        displayText = `No encontré la orden "${action.data.order_readable_id}". Verifique el ID (ej: ORD-1).`;
                        action = null;
                    } else {
                        const itemsToInsert = (action.data.items || []).map(i => ({
                            order_id: orderData.id,
                            part_name: i.part_name,
                            part_number: i.part_number || '',
                            quantity: i.quantity || 1,
                            cost_fob: parseFloat(i.cost_fob) || 0,
                            sale_price: parseFloat(i.sale_price) || 0
                        }));

                        const { error: insertErr } = await supabase
                            .from('order_items')
                            .insert(itemsToInsert);

                        if (insertErr) {
                            displayText = `Error al insertar los repuestos: ${insertErr.message}`;
                        } else {
                            displayText = `✅ Agregué ${itemsToInsert.length} repuesto(s) a la orden ${orderData.readable_id} de ${orderData.customers?.full_name}. Recarga la orden para verlos.`;
                        }
                        action = null;
                    }
                }
            } catch (e) {
                console.error('JSON Action Parse Error:', e);
                // If we can't parse the action, at least clean up the display text
                displayText = responseText.replace(/\[ACTION:[\s\S]*?\}\]/g, '').trim();
                action = null;
            }
        }

        if (!displayText || displayText.length === 0) {
            displayText = "He procesado tu solicitud correctamente.";
        }

        return res.status(200).json({ response: displayText, action: action });


    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

