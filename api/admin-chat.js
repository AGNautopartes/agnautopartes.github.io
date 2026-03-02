// api/admin-chat.js
// Chat IA para el administrador. Procesa órdenes en lenguaje natural.

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

    const SYSTEM_PROMPT = `
Eres "Aria", la asistente IA interna de AGN Autopartes ERP, diseñada para ayudar al administrador ${adminName} a gestionar órdenes de repuestos automotrices importados.

CAPACIDADES:
- Crear nuevas órdenes con datos del cliente, vehículo, repuesto y costos
- Actualizar el estado de órdenes existentes
- Agregar notas internas a órdenes
- Registrar costos y precios de venta

REGLAS:
1. Responde SIEMPRE en español formal (usted).
2. Extrae TODOS los datos del mensaje del admin y construye el JSON de acción.
3. Si hay ambigüedad, pregunta UNA sola cosa específica.
4. Si el admin menciona un cliente que podría existir, indica que verificarás si ya existe.
5. Para fechas, convierte a formato YYYY-MM-DD.
6. Confirma siempre lo que entendiste antes de ejecutar.

CUANDO TENGAS SUFICIENTE INFO PARA ACTUAR, responde con este JSON exacto al final de tu mensaje (después de tu confirmación en texto):

Para CREAR orden:
[ACTION:{"type":"CREATE_ORDER","data":{"customer_name":"...","customer_phone":"...","vehicle_brand":"...","vehicle_model":"...","vehicle_year":"...","part_name":"...","part_number":"...","supplier_url":"...","status":"...","estimated_delivery_client":"YYYY-MM-DD","cost_fob":0,"shipping_cost":0,"customs_cost":0,"taxes":0,"sale_price":0,"notes":"..."}}]

Para ACTUALIZAR estado:
[ACTION:{"type":"UPDATE_STATUS","data":{"customer_name":"...","part_name":"...","new_status":"...","note":"..."}}]

Para AGREGAR nota:
[ACTION:{"type":"ADD_NOTE","data":{"customer_name":"...","part_name":"...","note":"..."}}]

ESTADOS VÁLIDOS: Solicitado, Cotizado, Comprado, Tránsito 1 (Prov→Log), Tránsito 2 (Log→EC), En Aduana, Entregado, Cancelado

Si NO tienes suficiente info, solo responde en texto y haz la pregunta necesaria. NO incluyas [ACTION:...] si no estás seguro.
    `.trim();

    const formattedHistory = conversationHistory.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    // Añadir el mensaje actual del admin
    formattedHistory.push({
        role: 'user',
        parts: [{ text: message }]
    });

    // Insertar el system prompt como mensaje inicial si no está
    if (formattedHistory.length === 1 || formattedHistory[0].role !== 'user' || !formattedHistory[0].parts[0].text.includes('Eres "Aria"')) {
        formattedHistory.unshift({
            role: 'user',
            parts: [{ text: SYSTEM_PROMPT }]
        });
        formattedHistory.splice(1, 0, {
            role: 'model',
            parts: [{ text: 'Entendido. Soy Aria, lista para gestionar las órdenes de AGN Autopartes. ¿En qué le ayudo?' }]
        });
    }

    try {
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: formattedHistory })
            }
        );

        if (!geminiRes.ok) {
            const errData = await geminiRes.json();
            throw new Error(errData.error?.message || 'Error en la API de Gemini');
        }

        const data = await geminiRes.json();
        const responseText = data.candidates[0].content.parts[0].text;

        // Extraer la acción JSON si existe
        const actionMatch = responseText.match(/\[ACTION:(.*?)\]/s);
        let action = null;
        let displayText = responseText;

        if (actionMatch) {
            try {
                action = JSON.parse(actionMatch[1]);
                displayText = responseText.replace(/\[ACTION:.*?\]/s, '').trim();
            } catch (e) {
                console.error('Error parseando ACTION JSON:', e);
            }
        }

        return res.status(200).json({
            response: displayText,
            action: action
        });

    } catch (error) {
        console.error('Error en admin-chat:', error);
        return res.status(500).json({ error: error.message });
    }
}
