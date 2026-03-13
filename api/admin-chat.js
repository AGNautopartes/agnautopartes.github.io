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

    const { message, conversationHistory = [], adminName = 'Admin' } = req.body;

    // === DETERMINAR API A USAR ===
    const USE_OPENROUTER = process.env.USE_OPENROUTER === 'true';
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (USE_OPENROUTER && !OPENROUTER_API_KEY) {
        return res.status(500).json({ error: 'OPENROUTER_API_KEY no configurada.' });
    }
    if (!USE_OPENROUTER && !GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Clave de API de Google no configurada.' });
    }

    // === OBTENER CONTEXTO DE ÓRDENES (igual) ===
    const { data: existingOrders } = await supabase
        .from('orders')
        .select(`
            readable_id, part_name, status, vehicle_brand, vehicle_model, vehicle_year, costo_fob,
            customers(full_name),
            order_items(part_name, part_number)
        `)
        .order('created_at', { ascending: false })
        .limit(20);

    const ordersContext = (existingOrders || []).map(o => {
        const vBrand = o.vehicle_brand || 'N/A';
        const vModel = o.vehicle_model || 'N/A';
        const vYear = o.vehicle_year || 'N/A';
        const itemsList = (o.order_items && o.order_items.length > 0)
            ? o.order_items.map(i => `${i.part_name} (#${i.part_number || 'S/N'})`).join('; ')
            : 'Ninguno';
        return `- [${o.readable_id}] | CLIENTE: ${o.customers?.full_name} | CARRO: ${vBrand} ${vModel} ${vYear} | PIEZA PRINCIPAL (Legacy): ${o.part_name} | DESGLOSE RELACIONAL: [${itemsList}] | STATUS: ${o.status}`;
    }).join('\n');

    const today = new Date().toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });

    const SYSTEM_PROMPT = `
Eres "Aria", la asistente IA del ERP AGN Autopartes. FECHA: ${today}.

REGLA DE ORO: TIENES MEMORIA TOTAL.
Revisa la lista de abajo antes de responder. Si el usuario te habla de una orden existente, YA SABES que su carro y repuestos están en esta lista. Solo pide datos si la orden NO existe.

LISTA DE ÓRDENES REALES (Contexto):
${ordersContext}

INSTRUCCIONES:
1. BREVEDAD: Responde en máximo 20 palabras.
2. VEHÍCULO: Si te preguntan por el carro de una orden, búscalo en la lista anterior (Columna CARRO). No preguntes al usuario.
3. REPUESTOS: Para añadir piezas a una orden existente (#ORD-X), usa UPDATE_FIELDS con el array "items_json". El número de parte y la URL son OPCIONALES.
4. ACCIONES (JSON obligatorio al final):
   - CREAR: [ACTION:{"type":"CREATE_ORDER","data":{...}}]
   - ACTUALIZAR CAMPOS: [ACTION:{"type":"UPDATE_FIELDS","data":{"order_id":"ORD-X","fields":{"vehicle_brand":"...", "items_json": [{"part_name":"Item", "part_number":"#", "supplier_url":"url"}]}}}]
   - ACTUALIZAR ESTADO: [ACTION:{"type":"UPDATE_STATUS","data":{"order_id":"ORD-X","new_status":"..."}}]

ESTADOS: Solicitado, Cotizado, Comprado, Tránsito 1 (Prov→Log), Tránsito 2 (Log→EC), En Aduana, Entregado, Cancelado.
`.trim();

    // === PREPARAR MENSAJES SEGÚN API ===
    let messagesForAPI;
    if (USE_OPENROUTER) {
        // Formato OpenAI: [{role, content}]
        messagesForAPI = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversationHistory.map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            })),
            { role: 'user', content: message }
        ];
    } else {
        // Formato Gemini: [{role, parts:[{text}]}]
        messagesForAPI = [
            { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
            ...conversationHistory.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            })),
            { role: 'user', parts: [{ text: message }] }
        ];
    }

    try {
        let responseText;

        if (USE_OPENROUTER) {
            // === OPENROUTER CALL ===
            const requestedModel = req.body.model || process.env.OPENROUTER_MODEL || 'mistralai/mixtral-8x7b-instruct';
            const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://agnautopartes.vercel.app',
                    'X-Title': process.env.OPENROUTER_TITLE || 'AGN AutoPartes ERP'
                },
                body: JSON.stringify({
                    model: requestedModel,
                    messages: messagesForAPI,
                    temperature: 0.7
                })
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error?.message || 'Error en OpenRouter');
            }

            const data = await resp.json();
            responseText = data.choices?.[0]?.message?.content || '';

        } else {
            // === GEMINI CALL ===
            const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: messagesForAPI })
                }
            );

            if (!geminiRes.ok) {
                const err = await geminiRes.json();
                throw new Error(err.error?.message || 'Error en Gemini');
            }

            const data = await geminiRes.json();
            responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }

        // === PARSE ACCIONES (misma lógica) ===
        let action = null;
        let displayText = responseText;

        const startToken = '[ACTION:';
        const startIdx = responseText.indexOf(startToken);
        if (startIdx !== -1) {
            const endIdx = responseText.lastIndexOf(']');
            if (endIdx > startIdx) {
                const rawContent = responseText.substring(startIdx + startToken.length, endIdx).trim();
                try {
                    action = JSON.parse(rawContent);
                    displayText = (responseText.substring(0, startIdx) + responseText.substring(endIdx + 1)).trim();
                } catch (e) {
                    console.error('Error parseando bloque de acción:', e);
                }
            }
        }

        if (action && !displayText) {
            displayText = "De acuerdo, procedo con esa acción.";
        } else if (!displayText && !action) {
            displayText = "Lo siento, no pude procesar esa solicitud.";
        }

        return res.status(200).json({ response: displayText, action: action });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
