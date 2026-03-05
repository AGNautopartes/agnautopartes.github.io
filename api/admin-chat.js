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

    const today = new Date().toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });

    const SYSTEM_PROMPT = `
Eres "Aria", la asistente IA de AGN Autopartes ERP.
HOY ES: ${today}.

CAPACIDADES:
- BUSCAR ORDEN: Usa SEARCH_ORDER.
- CREAR ORDEN: Cuando pidan una orden nueva, usa CREATE_ORDER. 
  * Si el cliente no está en la base de datos o contexto, pregunta "El cliente [Nombre] no existe, ¿lo creo?".
  * Estado inicial siempre: "Solicitado".
- AGREGAR REPUESTOS: Usa ADD_ITEMS_TO_ORDER para órdenes existentes.
- ACTUALIZAR ESTADO: Usa UPDATE_FIELDS.
- NOTA: Usa ADD_NOTE.

REGLAS CRÍTICAS:
1. NO USES COTIZADOR VOLÁTIL. Crea las órdenes directamente.
2. Si el usuario dice "agrega X a la orden de Y", búscalo y usa ADD_ITEMS_TO_ORDER.
3. Respuestas breves (máx 2 líneas).

ACCIONES (JSON final):
- BUSCAR: [ACTION:{"type":"SEARCH_ORDER","data":{"query":"..."}}]
- CREAR: [ACTION:{"type":"CREATE_ORDER","data":{"customer_name":"...","vehicle_brand":"...","vehicle_model":"...","items":[{"part_name":"...","quantity":1,"cost_fob":0,"sale_price":0}]}}]
- AGREGAR: [ACTION:{"type":"ADD_ITEMS_TO_ORDER","data":{"order_readable_id":"ORD-X","items":[{"part_name":"...","quantity":1,"cost_fob":0,"sale_price":0}]}}]
- ESTADO: [ACTION:{"type":"UPDATE_FIELDS","data":{"order_id":"ORD-X","fields":{"status":"..."}}}]
- NOTA: [ACTION:{"type":"ADD_NOTE","data":{"order_id":"ORD-X","note":"..."}}]

ESTADOS: Solicitado, Cotizado, Comprado, Tránsito 1, Tránsito 2, En Aduana, Entregado, Cancelado.
`.trim();

    // Contexto de órdenes recientes para Aria
    const { data: recentOrders } = await supabase
        .from('orders')
        .select('readable_id, status, vehicle_brand, vehicle_model, customers(full_name)')
        .order('created_at', { ascending: false })
        .limit(10);

    const ordersContext = (recentOrders || []).map(o =>
        `[${o.readable_id}] ${o.customers?.full_name}: ${o.vehicle_brand} ${o.vehicle_model || ''} (${o.status})`
    ).join('\n');

    const fullPrompt = `${SYSTEM_PROMPT}\n\nCONTEXTO RECIENTE:\n${ordersContext}`;

    const formattedHistory = conversationHistory.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    formattedHistory.push({ role: 'user', parts: [{ text: message }] });
    formattedHistory.unshift({ role: 'user', parts: [{ text: fullPrompt }] });
    formattedHistory.splice(1, 0, { role: 'model', parts: [{ text: 'Entendido. ¿En qué le puedo ayudar?' }] });

    try {
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: formattedHistory })
            }
        );

        if (!geminiRes.ok) throw new Error('Error Gemini');

        const data = await geminiRes.json();
        const responseText = data.candidates[0].content.parts[0].text;

        const actionTagStart = responseText.indexOf('[ACTION:');
        let action = null;
        let displayText = responseText;

        if (actionTagStart !== -1) {
            try {
                let depth = 0, jsonStart = actionTagStart + 8, jsonEnd = jsonStart;
                for (let i = jsonStart; i < responseText.length; i++) {
                    if (responseText[i] === '{') depth++;
                    else if (responseText[i] === '}') {
                        depth--;
                        if (depth === 0) { jsonEnd = i + 1; break; }
                    }
                }
                const jsonStr = responseText.substring(jsonStart, jsonEnd);
                action = JSON.parse(jsonStr);
                displayText = (responseText.substring(0, actionTagStart) + responseText.substring(jsonEnd + 1)).trim();

                // --- INTERCEPTORES DE BACKEND ---

                // 1. SEARCH_ORDER
                if (action.type === 'SEARCH_ORDER' && action.data.query) {
                    const { data: sr } = await supabase.from('orders').select('readable_id, status, customers(full_name)').or(`vehicle_brand.ilike.%${action.data.query}%,vehicle_model.ilike.%${action.data.query}%,customers.full_name.ilike.%${action.data.query}%`).limit(5);
                    if (sr?.length) {
                        displayText = `Encontré: ${sr.map(r => `[${r.readable_id}] ${r.customers?.full_name}`).join(', ')}.`;
                    } else displayText = `No encontré órdenes para "${action.data.query}".`;
                    action = null;
                }

                // 2. CREATE_ORDER con confirmación de cliente
                if (action.type === 'CREATE_ORDER') {
                    const cName = action.data.customer_name;
                    // Verificar si el cliente existe
                    const { data: cust } = await supabase.from('customers').select('id').ilike('full_name', `%${cName}%`).maybeSingle();

                    if (!cust) {
                        // Si no existe, vemos si el usuario acaba de decir que sí lo cree
                        const lastMsgSnippet = message.toLowerCase();
                        const isConfirm = ['si', 'sí', 'dale', 'procede', 'crealo', 'creálo', 'ok'].some(w => lastMsgSnippet.includes(w));

                        if (!isConfirm) {
                            displayText = `El cliente **${cName}** no existe en el sistema. ¿Deseas que lo cree para proceder con la orden?`;
                            action = null; // Detener acción
                        }
                    }
                    // Si existe o ya confirmó, CREATE_ORDER sigue al frontend (executeAriaAction)
                }

                // 3. ADD_ITEMS_TO_ORDER directo al DB
                if (action.type === 'ADD_ITEMS_TO_ORDER' && action.data.order_readable_id) {
                    const rid = action.data.order_readable_id.toUpperCase().replace('ORD-', '');
                    const { data: order } = await supabase.from('orders').select('id, readable_id').eq('readable_id', 'ORD-' + rid).maybeSingle();
                    if (order) {
                        const items = action.data.items.map(i => ({
                            order_id: order.id,
                            part_name: i.part_name,
                            quantity: i.quantity || 1,
                            cost_fob: i.cost_fob || 0,
                            sale_price: i.sale_price || 0
                        }));
                        await supabase.from('order_items').insert(items);
                        displayText = `✅ Repuestos agregados a la orden #${order.readable_id}.`;
                        action = null; // Ya cumplido en backend
                    }
                }

            } catch (e) {
                console.error('Parse Error', e);
                displayText = responseText.replace(/\[ACTION:[\s\S]*?\}\]/g, '').trim();
                action = null;
            }
        }

        return res.status(200).json({ response: displayText || 'Procesado.', action });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

