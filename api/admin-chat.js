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
    const { message, conversationHistory = [], adminName = 'Admin', model = process.env.DEFAULT_MODEL || '' } = req.body;

    const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    // Routing: si el modelo es de Google, usar Gemini nativo (GOOGLE_API_KEY o GEMINI_API_KEY).
    // Para todo lo demás, usar OpenRouter.
    const isGoogleModel = model.startsWith('google/');
    const useGeminiNative = isGoogleModel && !!GEMINI_API_KEY;
    const useOpenRouter = !useGeminiNative && !!OPENROUTER_API_KEY;

    if (!useGeminiNative && !useOpenRouter) {
        return res.status(500).json({ error: 'No hay API key disponible para el modelo seleccionado. Configura GEMINI_API_KEY u OPENROUTER_API_KEY en Vercel.' });
    }

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
Eres "Aria", el núcleo inteligente del ERP de AGN Autopartes. FECHA: ${today}.

TU MISIÓN: Gestionar el flujo de órdenes, finanzas y logística con precisión total.

📋 OPERACIONES SOPORTADAS:
1. CREAR ÓRDEN: customer_name y vehicle_model obligatorios.
2. ACTUALIZAR ESTADO: new_status (ver abajo).
3. GESTIÓN FINANCIERA (UPDATE_FIELDS): Puedes modificar uno o varios campos:
   - costo_fob: Costo base en origen ($).
   - shipping_logistica: Valor flete Miami.
   - shipping_ecuador: Otros fletes.
   - ad_valorem: Impuestos aduana.
   - precio_venta: Precio final pactado.
   - margen_markdown: % de ganancia (decimal, ej: 0.35 para 35%).
   - comision_vendedor: Valor comisión.

4. NOTAS: Agregar aclaraciones importantes.

📋 CAMPOS EXACTOS PARA UPDATE_FIELDS (Usar estos keys):
- "costo_fob", "precio_venta", "tracking_number", "vehicle_brand", "vehicle_model", "vehicle_year", "vin"
- "shipping_logistica", "shipping_ecuador", "ad_valorem", "margen_markdown", "comision_vendedor"
- Para ítems: "items_json" (array de objetos {part_name, part_number, cost_fob, quantity})

🧠 CAPACIDAD MATEMÁTICA:
- Si el usuario dice: "Súmale $15 de shipping a la orden 10", tú buscas la orden 10, tomas su 'costo_fob' y envías un UPDATE_FIELDS con el nuevo total o solo los campos modificados.
- Si el usuario dice: "Dime cuánto gano con la orden 5 si la vendo en $200", haz el cálculo (Venta - Costo) y responde amablemente.

REGLAS DE ORO:
1. Responde SIEMPRE de forma ejecutiva pero amigable. 
2. Si recibes comandos de voz (transcritos), ignora muletillas ("ehh", "este", "ponle").
3. Al crear órdenes, asume que si dicen "Toyota Hilux", Marca=Toyota, Modelo=Hilux.

ESTADOS (Usar EXACTAMENTE estos): Solicitado, Cotizado, Comprado, Tránsito 1 (Prov→Log), Tránsito 2 (Log→EC), En Aduana, Entregado, Cancelado.

FORMATOS DE ACCIÓN (SIEMPRE AL FINAL):
[ACTION:{"type":"CREATE_ORDER","data":{...}}]
[ACTION:{"type":"UPDATE_STATUS","data":{"order_id":"ORD-1","new_status":"..."}}]
[ACTION:{"type":"UPDATE_FIELDS","data":{"order_id":"ORD-1","fields":{...}}}]
`.trim();

    try {
        let responseText;

        if (useOpenRouter) {
            // === OPENROUTER CALL ===
            const messagesForAPI = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...conversationHistory.map(m => ({
                    role: m.role,
                    content: m.content
                })),
                { role: 'user', content: message }
            ];

            const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'https://agnautopartes.github.io', 
                    'X-Title': 'AGN Autopartes ERP'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messagesForAPI
                })
            });

            if (!orRes.ok) {
                const err = await orRes.json();
                console.error('OPENROUTER ERROR:', err);
                throw new Error(err.error?.message || 'Error en OpenRouter');
            }

            const data = await orRes.json();
            responseText = data.choices?.[0]?.message?.content || '';

        } else {
            // === NATIVE GEMINI CALL ===
            if (!GEMINI_API_KEY) {
                return res.status(500).json({ error: 'Falta GEMINI_API_KEY u OPENROUTER_API_KEY.' });
            }

            const geminiModelStr = model.startsWith('google/') ? model.replace('google/', '') : process.env.GEMINI_MODEL;
            if (!geminiModelStr) {
                return res.status(500).json({ error: 'No se especificó modelo Gemini. Selecciona uno en el panel o configura GEMINI_MODEL en las variables de entorno.' });
            }

            const messagesForAPI = [
                { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
                ...conversationHistory.map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                })),
                { role: 'user', parts: [{ text: message }] }
            ];

            const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${geminiModelStr}:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: messagesForAPI })
                }
            );

            if (!geminiRes.ok) {
                const err = await geminiRes.json();
                console.error('GEMINI ERROR:', err);
                throw new Error(err.error?.message || 'Error en Gemini');
            }

            const data = await geminiRes.json();
            responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }

        // === PARSE ACCIONES ===
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
