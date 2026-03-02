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

    // Obtener contexto de órdenes reales para que Aria "recuerde"
    const { data: existingOrders } = await supabase
        .from('orders')
        .select('readable_id, part_name, status, customers(full_name)')
        .order('created_at', { ascending: false })
        .limit(20);

    const ordersContext = (existingOrders || []).map(o =>
        `[${o.readable_id}] Cliente: ${o.customers?.full_name}, Pieza: ${o.part_name}, Estado: ${o.status}`
    ).join('\n');

    const today = new Date().toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });

    const SYSTEM_PROMPT = `
Eres "Aria", la asistente IA interna de AGN Autopartes ERP.
HOY ES: ${today}.

CONTEXTO DE ÓRDENES EXISTENTES (Usa esto para ACTUALIZAR en lugar de duplicar):
${ordersContext}

CAPACIDADES:
- Crear (CREATE_ORDER), Actualizar (UPDATE_STATUS), Borrar (DELETE_ORDER) y anotar (ADD_NOTE).

REGLAS CRÍTICAS:
1. RESPUESTAS CORTAS: Máximo 2 líneas de texto. Sé directa.
2. NO DUPLICAR: Si te piden algo para un cliente o pieza que ya ves en el CONTEXTO, usa UPDATE_STATUS con el readable_id.
3. TELÉFONO OBLIGATORIO: Para órdenes nuevas, DEBES pedir el teléfono si no lo tienes. El cliente lo usará para ver su estado. Excepción: si el admin dice "no tiene".
4. BORRADO: Si piden "borra la orden X", usa DELETE_ORDER.
5. FORMATO: Siempre responde con el JSON al final si vas a actuar.

ACCIONES (JSON):
- Para CREAR: [ACTION:{"type":"CREATE_ORDER","data":{"customer_name":"...","customer_phone":"...","vehicle_brand":"...","vehicle_model":"...","vehicle_year":"...","part_name":"...","part_number":"...","status":"...","cost_fob":0,"sale_price":0}}]
- Para ACTUALIZAR: [ACTION:{"type":"UPDATE_STATUS","data":{"order_id":"ORD-X","new_status":"...","note":"..."}}]
- Para BORRAR: [ACTION:{"type":"DELETE_ORDER","data":{"order_id":"ORD-X"}}]
- Para NOTA: [ACTION:{"type":"ADD_NOTE","data":{"order_id":"ORD-X","note":"..."}}]

ESTADOS: Solicitado, Cotizado, Comprado, Tránsito 1 (Prov→Log), Tránsito 2 (Log→EC), En Aduana, Entregado, Cancelado.
`.trim();

    const formattedHistory = conversationHistory.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    formattedHistory.push({ role: 'user', parts: [{ text: message }] });

    // Forzar el system prompt actualizado en cada envío para refrescar la memoria de órdenes
    formattedHistory.unshift({ role: 'user', parts: [{ text: SYSTEM_PROMPT }] });
    formattedHistory.splice(1, 0, { role: 'model', parts: [{ text: 'Entendido. Contexto actualizado. ¿Qué desea hacer?' }] });

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
            } catch (e) { console.error('JSON Error:', e); }
        }

        if (actionMatch && !displayText) {
            displayText = "De acuerdo, procedo con esa acción.";
        } else if (!displayText && !action) {
            displayText = "Lo siento, no pude procesar esa solicitud.";
        }

        return res.status(200).json({ response: displayText, action: action });


    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

