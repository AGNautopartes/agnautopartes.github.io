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

    const SYSTEM_PROMPT = `Eres Aria, la asistente inteligente de AGN AutoPartes ERP.
Tu objetivo es ayudar al administrador a gestionar órdenes, clientes y cotizaciones.

ESTADO DEL COTIZADOR:
Usa el cotizador para presupuestos rápidos. No requiere crear orden en DB.

ACCIONES DISPONIBLES (JSON final):
- BUSCAR ORDEN: [ACTION:{"type":"SEARCH_ORDER","data":{"query":"..."}}]
- CREAR ORDEN: [ACTION:{"type":"CREATE_ORDER","data":{"customer_name":"...","vehicle_brand":"...","vehicle_model":"...","items":[{"part_name":"...","quantity":1,"cost_fob":0,"sale_price":0}]}}]
- AGREGAR A ORDEN: [ACTION:{"type":"ADD_ITEMS_TO_ORDER","data":{"order_readable_id":"ORD-X","items":[{"part_name":"...","quantity":1,"cost_fob":0,"sale_price":0}]}}]
- ACTUALIZAR ESTADO: [ACTION:{"type":"UPDATE_FIELDS","data":{"order_id":"ORD-X","fields":{"status":"..."}}}]
- NOTA: [ACTION:{"type":"ADD_NOTE","data":{"order_id":"ORD-X","note":"..."}}]
- COTIZADOR_ADD: [ACTION:{"type":"ADD_TO_QUOTE","data":{"items":[{"name":"...","description":"...","cost":0,"shipping":0,"brand":"..."}]}}]
- COTIZADOR_CLEAR: [ACTION:{"type":"CLEAR_QUOTE","data":{}}]
- COTIZADOR_SET_CLIENT: [ACTION:{"type":"SET_QUOTE_CLIENT","data":{"client_name":"...","vehicle":"..."}}]

REGLAS DE ORO:
1. Siempre devuelve la acción dentro de [ACTION:{...}]. NO uses bloques de markdown con comillas invertidas.
2. Si el cliente no existe para una orden, pregunta ANTES de crear.
3. Si el usuario te habla del cotizador, USA LAS ACCIONES DEL COTIZADOR mencionadas arriba.

IMPORTANTE: El Cotizador es para WhatsApp. La Orden es para el sistema financiero local.
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
        const rData = await geminiRes.json();
        const responseText = rData.candidates[0].content.parts[0].text;

        let action = null;
        let displayText = responseText;

        // --- PARSER AGRESIVO ---
        function extractJson(text) {
            const tagMatch = text.match(/\[ACTION:\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*\]/);
            if (tagMatch) return { raw: tagMatch[0], json: tagMatch[1] };
            const mdMatch = text.match(/```json\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*```/i);
            if (mdMatch) return { raw: mdMatch[0], json: mdMatch[1] };
            const looseMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (looseMatch) return { raw: looseMatch[0], json: looseMatch[1] };
            return null;
        }

        const found = extractJson(responseText);
        if (found) {
            try {
                let parsed = JSON.parse(found.json);
                action = Array.isArray(parsed) ? parsed[0] : parsed;
                displayText = responseText.replace(found.raw, '').trim();
            } catch (e) { console.warn("JSON error:", e); }
        }

        // --- INTERCEPTORES ---
        if (action) {
            if (action.type === 'SEARCH_ORDER') {
                const { data: sr } = await supabase.from('orders').select('readable_id, status, customers(full_name)').or(`vehicle_brand.ilike.%${action.data.query}%,vehicle_model.ilike.%${action.data.query}%,customers.full_name.ilike.%${action.data.query}%`).limit(5);
                displayText = sr?.length ? `Encontré: ${sr.map(r => `[${r.readable_id}] ${r.customers?.full_name}`).join(', ')}.` : `No encontré órdenes para "${action.data.query}".`;
                action = null;
            } else if (action.type === 'CREATE_ORDER') {
                const { data: cust } = await supabase.from('customers').select('id').ilike('full_name', `%${action.data.customer_name}%`).maybeSingle();
                if (!cust) {
                    const lastMsgSnippet = message.toLowerCase();
                    const isConfirm = ['si', 'sí', 'dale', 'procede', 'crealo', 'ok'].some(w => lastMsgSnippet.includes(w));
                    if (!isConfirm) {
                        displayText = `El cliente **${action.data.customer_name}** no existe. ¿Deseas que lo cree?`;
                        action = null;
                    }
                }
            } else if (action.type === 'ADD_ITEMS_TO_ORDER') {
                const rid = action.data.order_readable_id.toUpperCase().replace('ORD-', '');
                const { data: order } = await supabase.from('orders').select('id, readable_id').eq('readable_id', 'ORD-' + rid).maybeSingle();
                if (order) {
                    const items = action.data.items.map(i => ({ order_id: order.id, part_name: i.part_name, quantity: i.quantity || 1, cost_fob: i.cost_fob || 0, sale_price: i.sale_price || 0 }));
                    await supabase.from('order_items').insert(items);
                    displayText = `✅ Repuestos agregados a la orden #${order.readable_id}.`;
                    action = null;
                }
            }
        }

        return res.status(200).json({ response: displayText || 'Procesado.', action });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
}
