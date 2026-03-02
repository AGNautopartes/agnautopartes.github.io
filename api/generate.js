// api/generate.js - Versión para GEMINI

export default async function handler(request, response) {
  // 1. Solo aceptar peticiones POST
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Método no permitido' });
  }

  // 2. Tomar el historial de chat que envió el frontend
  const { conversationHistory } = request.body;

  // 3. Obtener la clave API de Gemini de forma SEGURA desde las variables de entorno
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  if (!GOOGLE_API_KEY) {
    return response.status(500).json({ error: { message: 'La clave de API de Google no está configurada en el servidor.' } });
  }

  // 4. Transformar el historial al formato que espera Gemini
  // El frontend usa {role, content}, Gemini espera {role, parts:[{text}]}
  // También, el rol 'assistant' se llama 'model' en Gemini.
  const geminiFormattedHistory = conversationHistory.map(message => {
    let role = message.role;
    if (role === 'assistant') {
      role = 'model';
    }
    // El rol 'system' se trata como un mensaje de 'user' en este endpoint
    if (role === 'system') {
        role = 'user';
    }
    return {
      role: role,
      parts: [{ text: message.content }]
    };
  });
  
  const model = 'gemini-2.0-flash';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_API_KEY}`;

  try {
    // 5. Llamar a la API de Gemini desde el servidor
    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents: geminiFormattedHistory }),
    });

    if (!geminiResponse.ok) {
        const errorData = await geminiResponse.json();
        throw new Error(errorData.error.message || 'Error en la petición a Gemini');
    }

    const data = await geminiResponse.json();

    // 6. Devolver la respuesta de Gemini al frontend
    return response.status(200).json(data);

  } catch (error) {
    console.error('Error en la función serverless de Gemini:', error);
    return response.status(500).json({ error: { message: 'Error interno del servidor.' } });
  }
}