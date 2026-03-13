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

OBJETIVO: Crear órdenes de repuestos de forma SIMPLE y RÁPIDA.

REGLAS:
1. BREVEDAD: Máximo 20 palabras por respuesta.
2. CREAR ORDEN: Solo necesitas cliente + vehículo. Todo lo demás es OPCIONAL.
3. VALIDACIÓN MÍNIMA: Para crear una orden solo requiere:
   - client_name: Nombre del cliente (OBLIGATORIO)
   - vehicle_model: Modelo del carro (OBLIGATORIO)  
   - vehicle_brand: Marca del carro (opcional,si no se da usar "N/A")
   - main_part: Repuesto (opcional, si no se da usar "Repuesto sin especificar")
   
SI EL USUARIO DA: "crea orden para Juan, Toyota Hilux"
ENTONCES: Crear orden INMEDIATAMENTE con:
{"client_name":"Juan", "vehicle_model":"Hilux", "vehicle_brand":"Toyota"}

NO PREGUNTES DETALLES EXTRA. Si tienes cliente + vehículo, CREA LA ORDEN.

FORMATO DE ACCIÓN (JSON obligatorio al final):
[ACTION:{"type":"CREATE_ORDER","data":{"client_name":"NOMBRE","vehicle_model":"MODELO","vehicle_brand":"MARCA","main_part":"REPUESTO"}}]

SI ES UPDATE STATUS:
[ACTION:{"type":"UPDATE_STATUS","data":{"order_id":"ORD-1","new_status":"Cotizado"}}]

SI ES UPDATE FIELDS (agregar repuestos a orden existente):
[ACTION:{"type":"UPDATE_FIELDS","data":{"order_id":"ORD-1","fields":{"items_json":[{"part_name":"Faro","cost_fob":45}]}}}]

NO pongas texto después del JSON. El JSON debe ser la ÚLTIMA cosa en tu respuesta.

LISTA DE ÓRDENES ACTUALES:
${ordersContext}

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
            const requestedModel = req.body.model || process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct';
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
