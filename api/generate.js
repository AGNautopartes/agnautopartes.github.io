// api/generate.js - Soporte Gemini y OpenRouter

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Método no permitido' });
    }

    const { conversationHistory } = request.body;
    const USE_OPENROUTER = process.env.USE_OPENROUTER === 'true';
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    // Validar API keys según modo
    if (USE_OPENROUTER && !OPENROUTER_API_KEY) {
        return response.status(500).json({ error: { message: 'OPENROUTER_API_KEY no configurada.' } });
    }
    if (!USE_OPENROUTER && !GEMINI_API_KEY) {
        return response.status(500).json({ error: { message: 'La clave de API de Google no está configurada.' } });
    }

    try {
        let apiResponse;

        if (USE_OPENROUTER) {
            // === OPENROUTER (formato OpenAI) ===
            // Modelo puede venir del body o de .env
            const requestedModel = request.body.model || process.env.OPENROUTER_MODEL || 'mistralai/mixtral-8x7b-instruct';
            const openRouterMessages = conversationHistory.map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
            }));

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
                    messages: openRouterMessages,
                    temperature: 0.7
                })
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error?.message || 'Error en OpenRouter');
            }

            apiResponse = await resp.json();
            // Extraer texto de respuesta
            const aiResponseText = apiResponse.choices?.[0]?.message?.content || '';

        } else {
            // === GEMINI (original) ===
            const geminiFormattedHistory = conversationHistory.map(message => {
                let role = message.role;
                if (role === 'assistant') role = 'model';
                if (role === 'system') role = 'user';
                return { role, parts: [{ text: message.content }] };
            });

            const model = 'gemini-2.0-flash';
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

            const geminiRes = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: geminiFormattedHistory })
            });

            if (!geminiRes.ok) {
                const err = await geminiRes.json();
                throw new Error(err.error?.message || 'Error en Gemini');
            }

            const data = await geminiRes.json();
            const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }

        return response.status(200).json({
            candidates: [{ content: { parts: [{ text: aiResponseText }] } }]
        });

    } catch (error) {
        console.error('Error en generate:', error);
        return response.status(500).json({ error: { message: error.message || 'Error interno' } });
    }
}