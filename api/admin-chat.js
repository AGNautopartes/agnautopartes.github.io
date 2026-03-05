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

CONTEXTO RECIENTE:
${ordersContext}

CAPACIDADES:
- BUSCAR: Si te piden buscar una orden por nombre, marca o modelo, usa SEARCH_ORDER.
- CREAR COTIZACIÓN: Si envían una lista o imagen, usa CREATE_QUOTE_VOLATILE. Esto abrirá el cotizador pero NO guardará en la nube hasta que el usuario lo pida.
- ENLAZAR: Para vincular una cotización a una orden existente, usa LINK_QUOTE.

REGLAS:
1. Respuestas de máximo 2 líneas.
2. Las imágenes sirven para identificar piezas en una cotización.
3. Si pides crear una orden con muchos repuestos, usa la estructura de items.

ACCIONES (JSON):
- BUSCAR: [ACTION:{"type":"SEARCH_ORDER","data":{"query":"Nombre o Marca"}}]
- COTIZAR (Volátil): [ACTION:{"type":"CREATE_QUOTE_VOLATILE","data":{"customer_name":"...","items":[{"part_name":"...","quantity":1,"cost_fob":0}]}}]
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

        const actionMatch = responseText.match(/\[ACTION:(.*?)\]/s);
        let action = null;
        let displayText = responseText;

        if (actionMatch) {
            try {
                action = JSON.parse(actionMatch[1]);
                displayText = responseText.replace(/\[ACTION:.*?\]/s, '').trim();

                // Interceptar búsqueda para responder de una vez si es posible
                if (action.type === 'SEARCH_ORDER' && action.data.query) {
                    const { data: searchResults } = await supabase
                        .from('orders')
                        .select('readable_id, status, vehicle_brand, vehicle_model, customers(full_name)')
                        .or(`vehicle_brand.ilike.%${action.data.query}%,vehicle_model.ilike.%${action.data.query}%,customers.full_name.ilike.%${action.data.query}%`)
                        .limit(5);

                    if (searchResults && searchResults.length > 0) {
                        const resultsStr = searchResults.map(r => `[${r.readable_id}] ${r.customers?.full_name}: ${r.vehicle_brand}`).join(', ');
                        displayText = `He encontrado estas coincidencias: ${resultsStr}. ¿Deseas hacer algo con alguna de ellas?`;
                    } else {
                        displayText = `No encontré órdenes que coincidan con "${action.data.query}".`;
                    }
                }
            } catch (e) { console.error('JSON Error:', e); }
        }

        if (actionMatch && !displayText) {
            displayText = "He procesado tu solicitud correctamente.";
        }

        return res.status(200).json({ response: displayText, action: action });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

