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
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (!GOOGLE_API_KEY) {
        return res.status(500).json({ error: 'Clave de API de Google no configurada.' });
    }

    // Obtener contexto de órdenes reales para que Aria "recuerde"
    const { data: existingOrders } = await supabase
        .from('orders')
        .select('readable_id, part_name, status, vehicle_brand, vehicle_model, vehicle_year, items_json, costo_fob, customers(full_name)')
        .order('created_at', { ascending: false })
        .limit(25);

    const ordersContext = (existingOrders || []).map(o => {
        const vBrand = o.vehicle_brand || 'N/A';
        const vModel = o.vehicle_model || 'N/A';
        const vYear = o.vehicle_year || 'N/A';
        const itemsList = (o.items_json && Array.isArray(o.items_json) && o.items_json.length > 0)
            ? o.items_json.map(i => `${i.part_name} (#${i.part_number || 'S/N'})`).join('; ')
            : 'Ninguno';

        return `- [${o.readable_id}] | CLIENTE: ${o.customers?.full_name} | CARRO: ${vBrand} ${vModel} ${vYear} | PIEZA PRINCIPAL: ${o.part_name} | DESGLOSE DB: [${itemsList}] | STATUS: ${o.status}`;
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

        let action = null;
        let displayText = responseText;

        // Búsqueda determinista de bloque [ACTION:{...}]
        const startToken = '[ACTION:';
        const startIdx = responseText.indexOf(startToken);
        if (startIdx !== -1) {
            const endIdx = responseText.lastIndexOf(']');
            if (endIdx > startIdx) {
                const rawContent = responseText.substring(startIdx + startToken.length, endIdx).trim();
                try {
                    action = JSON.parse(rawContent);
                    // El texto para el chat es todo lo que NO sea la acción
                    displayText = (responseText.substring(0, startIdx) + responseText.substring(endIdx + 1)).trim();
                } catch (e) {
                    console.error('Error parseando bloque de acción:', e);
                }
            }
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
