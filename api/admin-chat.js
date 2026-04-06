import supabase from '../supabase-client.js';
export const maxDuration = 30;
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    // 1. Validar Autenticación
    const adminPassword = req.headers['x-admin-password'];
    let isAuthed = false;

    // Prioridad 1: Contraseña en Env
    if (adminPassword === process.env.PASSWORD_ADMIN || adminPassword === process.env.ADMIN_PASSWORD) {
        isAuthed = true;
    } 
    // PRIORITY 2: Contraseña de desarrollo (solo si no hay password configurada en env)
    else if ((!process.env.PASSWORD_ADMIN && !process.env.ADMIN_PASSWORD) && adminPassword) {
        console.log('DEV MODE: Accepting password for development');
        isAuthed = true;
    }
    else {
        // Prioridad 3: Buscar en Tabla admin_users (Supabase)
        try {
            const { data: user, error: userError } = await supabase
                .from('admin_users')
                .select('username')
                .eq('password_hash', adminPassword)
                .eq('is_active', true)
                .maybeSingle();

            if (user) isAuthed = true;
            if (userError) console.error('Supabase Auth Error:', userError);
        } catch (authErr) {
            console.error('Critical Auth Error:', authErr);
        }
    }

    if (!isAuthed) {
        return res.status(401).json({ message: 'No autorizado' });
    }

    // 2. Extraer parámetros
    const { message, conversationHistory = [], adminName = 'Admin' } = req.body;
    const model = req.body.model || 'openrouter/free';

    console.log('=== ARIA DEBUG ===');
    console.log('Model recibido:', model);

    const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    
    console.log('GEMINI_API_KEY configurada:', !!GEMINI_API_KEY);
    console.log('OPENROUTER_API_KEY configurada:', !!OPENROUTER_API_KEY);

    // Routing: si el modelo es de Google, usar Gemini nativo (GOOGLE_API_KEY o GEMINI_API_KEY).
    // Para todo lo demás, usar OpenRouter.
    const isGoogleModel = model.startsWith('google/');
    const useGeminiNative = isGoogleModel && !!GEMINI_API_KEY;
    const useOpenRouter = !useGeminiNative && !!OPENROUTER_API_KEY;

    console.log('isGoogleModel:', isGoogleModel);
    console.log('useGeminiNative:', useGeminiNative);
    console.log('useOpenRouter:', useOpenRouter);

    if (!useGeminiNative && !useOpenRouter) {
        console.log('ERROR: No hay API key disponible');
        return res.status(500).json({ error: 'No hay API key disponible para el modelo seleccionado. Configura GEMINI_API_KEY u OPENROUTER_API_KEY en Vercel.' });
    }

    console.log('Consultando Supabase orders...');
    const { data: existingOrders, error: ordersError } = await supabase
        .from('orders')
        .select(`
            readable_id, part_name, status, vehicle_brand, vehicle_model, vehicle_year, costo_fob,
            customers(full_name),
            order_items(part_name, part_number)
        `)
        .order('created_at', { ascending: false })
        .limit(20);

    if (ordersError) {
        console.error('ERROR consultando orders:', ordersError);
    } else {
        console.log('Orders consultadas:', existingOrders?.length || 0);
    }

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
You are Aria, assistant for AGN Autopartes ERP.

You help manage orders. When user asks for action, respond simply.

If user wants to CREATE order: ask for customer name, vehicle model, part name.
If user wants to UPDATE status: ask for order ID and new status.
If user wants to UPDATE price/cost: ask for order ID and new price/cost.
If user wants to ADD part: ask for order ID, part name, cost.
If user wants to DELETE order: ask for order ID to confirm.
If user wants to ADD note: ask for order ID and note text.

Just respond in Spanish, be helpful.
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
                    'HTTP-Referer': 'https://agnautopartes-two.vercel.app',
                    'X-OpenRouter-Title': 'AGN Autopartes ERP'
                },
                body: JSON.stringify({
                    model: model.trim(),
                    messages: messagesForAPI,
                    temperature: 0.1,
                    top_p: 0.1,
                    max_tokens: 500
                })
            });

            console.log('OPENROUTER REQUEST:', {
                model: model.trim(),
                messagesCount: messagesForAPI.length
            });

            if (!orRes.ok) {
                const err = await orRes.json();
                console.error('OPENROUTER ERROR:', JSON.stringify(err));
                throw new Error(err.error?.message || 'Error en OpenRouter: ' + JSON.stringify(err));
            }

            const data = await orRes.json();
            console.log('OPENROUTER RESPONSE:', JSON.stringify(data).substring(0, 500));
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

        // Just return the response as text - no action parsing
        let displayText = responseText;

        if (!displayText) {
            displayText = "Lo siento, no pude procesar esa solicitud.";
        }

        return res.status(200).json({ response: displayText, _debug: { model, useOpenRouter, useGeminiNative, ordersCount: existingOrders?.length || 0 } });

    } catch (error) {
        console.error('ADMIN-CHAT CRITICAL ERROR:', error);
        // Devolvemos el mensaje de error específico para diagnóstico en el UI
        return res.status(500).json({
            error: error.message || 'Error desconocido',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            _debug: { model, useOpenRouter, useGeminiNative }
        });
    }
}
