import supabase from '../supabase-client.js';
export const maxDuration = 60;
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
Eres Aria. Ayudas con ordenes de AGN Autopartes.

IMPORTANTE: Cuando el usuario mencione marca Y modelo del vehiculo, debes SEPARARLOS claramente.

Si el usuario dice:
- "Ford Explorer" → marca=Ford, modelo=Explorer
- "Toyota Rav4" → marca=Toyota, modelo=Rav4
- "Kia Sportage" → marca=Kia, modelo=Sportage
- "Mazda CX3" → marca=Mazda, modelo=CX3

Si el usuario Solo dice la marca o solo el modelo, PREGUNTA cual falta.

Formatos exactos:
- CREAR orden: [CREATE_ORDER:cliente|marca|modelo|año|parte]
- ACTUALIZAR estado: [UPDATE_STATUS:id|estado]
- ACTUALIZAR costo: [UPDATE_COST:id|costo]
- ACTUALIZAR vehiculo: [UPDATE_VEHICLE:id|marca|modelo|año]
- EDITAR cliente: [UPDATE_CUSTOMER:id|tipo_dato|valor]
- AÑADIR parte: [ADD_PART:id|parte|costo]
- AÑADIR nota: [ADD_NOTE:id|nota]
- ELIMINAR orden: [DELETE_ORDER:id]

Si falta marca O modelo, pregunta en español.
NUNCA inventes o asumas la marca si no te la dan.
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

        // Detectar si la respuesta contiene una accion ejecutable
        const actionMatch = responseText.match(/\[([A-Z_]+):([^\]]+)\]/);
        
        let displayText = responseText;
        let actionDetected = false;
        let actionType = null;
        let actionData = null;
        let actionResult = null;

        if (actionMatch) {
            actionDetected = true;
            actionType = actionMatch[1];
            actionData = actionMatch[2];
            console.log('=== ARIA ACTION DETECTED ===');
            console.log('Action:', actionType);
            console.log('Data:', actionData);
            
            // Ejecutar la accion
            if (actionType === 'CREATE_ORDER') {
                actionResult = await executeCreateOrder(actionData, req);
            } else if (actionType === 'UPDATE_VEHICLE') {
                actionResult = await executeUpdateVehicle(actionData, req);
            } else if (actionType === 'UPDATE_STATUS') {
                actionResult = await executeUpdateStatus(actionData, req);
            } else if (actionType === 'UPDATE_COST') {
                actionResult = await executeUpdateCost(actionData, req);
            } else if (actionType === 'ADD_PART') {
                actionResult = await executeAddPart(actionData, req);
            } else if (actionType === 'ADD_NOTE') {
                actionResult = await executeAddNote(actionData, req);
            } else if (actionType === 'DELETE_ORDER') {
                actionResult = await executeDeleteOrder(actionData, req);
            }
        }

        // Si se ejecuto una accion, usar su resultado
        if (actionResult) {
            displayText = actionResult.message || "Accion ejecutada exitosamente";
            const needsRefresh = actionResult.refreshRequired === true;
            return res.status(200).json({ 
                response: displayText,
                refreshOrders: needsRefresh,
                _debug: { 
                    model, 
                    useOpenRouter, 
                    useGeminiNative, 
                    ordersCount: existingOrders?.length || 0,
                    actionDetected,
                    actionType,
                    actionData,
                    actionExecuted: true,
                    actionResult
                } 
            });
        }

        if (!displayText) {
            displayText = "Lo siento, no pude procesar esa solicitud.";
        }

        return res.status(200).json({ 
            response: displayText, 
            _debug: { 
                model, 
                useOpenRouter, 
                useGeminiNative, 
                ordersCount: existingOrders?.length || 0,
                actionDetected,
                actionType,
                actionData
            } 
        });

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

// Funcion para ejecutar CREATE_ORDER
async function executeCreateOrder(actionData, req) {
    const parts = actionData.split('|').map(s => s.trim());
    const customerName = parts[0];
    const vehicleBrand = parts[1] || '';
    const vehicleModel = parts[2] || '';
    const vehicleYear = parts[3] || '';
    const partName = parts[4] || '';
    
    console.log('=== EJECUTANDO CREATE_ORDER ===');
    console.log('Input data:', actionData);
    console.log('customerName:', customerName);
    console.log('vehicleBrand:', vehicleBrand);
    console.log('vehicleModel:', vehicleModel);
    console.log('vehicleYear:', vehicleYear);
    console.log('partName:', partName);
    
    if (!customerName || !partName) {
        return { 
            message: "Datos incompletos. Formato: cliente|marca|modelo|año|parte",
            error: true 
        };
    }

    try {
        const adminPassword = req.headers['x-admin-password'];
        const apiUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/create-order` 
            : 'http://localhost:3000/api/create-order';
        
        console.log('Calling create-order API:', apiUrl);
        
        const createOrderRes = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': adminPassword
            },
            body: JSON.stringify({
                cliente: customerName,
                marca: vehicleBrand,
                modelo: vehicleModel || vehicleBrand,
                ano: vehicleYear,
                pieza: partName
            })
        });

        // Check if response is OK and has content
        if (!createOrderRes.ok) {
            const errorResult = await createOrderRes.json().catch(() => ({ message: 'Error sin respuesta' }));
            console.error('CREATE_ORDER ERROR:', errorResult);
            return { 
                message: `Error: ${errorResult.message || 'Error desconocido'}`,
                error: true 
            };
        }

        const resultText = await createOrderRes.text();
        console.log('create-order raw response:', resultText);
        
        if (!resultText || resultText.trim() === '') {
            return { 
                message: 'Error: Respuesta vacía del servidor',
                error: true 
            };
        }
        
        const result = JSON.parse(resultText);
        console.log('create-order result:', result);

        return { 
            message: `Orden creada: ${customerName} - ${vehicleBrand} ${vehicleModel} ${vehicleYear} - ${partName}. ID: ${result.orderId}`,
            orderId: result.orderId,
            customerId: result.customerId,
            refreshRequired: true
        };
    } catch (error) {
        console.error('Error ejecutando CREATE_ORDER:', error);
        return { 
            message: `Error: ${error.message}`,
            error: true 
        };
    }
}

// Funcion para ejecutar UPDATE_VEHICLE
async function executeUpdateVehicle(actionData, req) {
    const parts = actionData.split('|').map(s => s.trim());
    const orderIdInput = parts[0];
    const vehicleBrand = parts[1] || '';
    const vehicleModel = parts[2] || '';
    const vehicleYear = parts[3] || '';
    
    console.log('=== EJECUTANDO UPDATE_VEHICLE ===');
    console.log('orderIdInput:', orderIdInput);
    console.log('vehicleBrand:', vehicleBrand);
    console.log('vehicleModel:', vehicleModel);
    console.log('vehicleYear:', vehicleYear);
    
    if (!orderIdInput) {
        return { message: "Datos incompletos. Formato: id|marca|modelo|año", error: true };
    }

    try {
        const adminPassword = req.headers['x-admin-password'];
        
        // Get order UUID from readable_id
        const getRes = await fetch(process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/get-all-orders` 
            : 'http://localhost:3000/api/get-all-orders', {
            headers: { 'x-admin-password': adminPassword }
        });
        
        const orders = await getRes.json();
        const order = orders.find(o => o.readable_id === orderIdInput || o.id === orderIdInput);
        
        if (!order) {
            return { message: `Orden ${orderIdInput} no encontrada`, error: true };
        }
        
        const apiUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/update-order-full` 
            : 'http://localhost:3000/api/update-order-full';
        
        console.log('Calling update-order-full API:', apiUrl);
        
        const updateRes = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': adminPassword
            },
            body: JSON.stringify({
                orderId: order.id,
                vehicle_brand: vehicleBrand,
                vehicle_model: vehicleModel || vehicleBrand,
                vehicle_year: vehicleYear
            })
        });

        if (!updateRes.ok) {
            const errorResult = await updateRes.json().catch(() => ({ message: 'Error sin respuesta' }));
            console.error('UPDATE_VEHICLE ERROR:', errorResult);
            return { 
                message: `Error: ${errorResult.message || 'Error desconocido'}`,
                error: true 
            };
        }

        const resultText = await updateRes.text();
        console.log('update-order-full raw response:', resultText);
        
        if (!resultText || resultText.trim() === '') {
            return { 
                message: 'Error: Respuesta vacía del servidor',
                error: true 
            };
        }
        
        const result = JSON.parse(resultText);
        console.log('update-order-full result:', result);

        return { 
            message: `Vehiculo actualizado: ${vehicleBrand} ${vehicleModel} ${vehicleYear}. ID: ${orderIdInput}`,
            orderId: orderIdInput,
            refreshRequired: true
        };
    } catch (error) {
        console.error('Error ejecutando UPDATE_VEHICLE:', error);
        return { 
            message: `Error: ${error.message}`,
            error: true 
        };
    }
}

// Funcion para ejecutar UPDATE_STATUS
async function executeUpdateStatus(actionData, req) {
    const parts = actionData.split('|').map(s => s.trim());
    const orderIdInput = parts[0];
    const newStatus = parts[1] || '';
    
    console.log('=== EJECUTANDO UPDATE_STATUS ===');
    console.log('orderIdInput:', orderIdInput);
    console.log('newStatus:', newStatus);
    
    if (!orderIdInput || !newStatus) {
        return { message: "Datos incompletos. Formato: id|estado", error: true };
    }

    try {
        const adminPassword = req.headers['x-admin-password'];
        
        // Get order UUID from readable_id
        const getRes = await fetch(process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/get-all-orders` 
            : 'http://localhost:3000/api/get-all-orders', {
            headers: { 'x-admin-password': adminPassword }
        });
        
        const orders = await getRes.json();
        const order = orders.find(o => o.readable_id === orderIdInput || o.id === orderIdInput);
        
        if (!order) {
            return { message: `Orden ${orderIdInput} no encontrada`, error: true };
        }
        
        const apiUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/update-order-full` 
            : 'http://localhost:3000/api/update-order-full';
        
        const updateRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
            body: JSON.stringify({ orderId: order.id, status: newStatus })
        });

        if (!updateRes.ok) {
            const err = await updateRes.json().catch(() => ({ message: 'Error sin respuesta' }));
            return { message: `Error: ${err.message || 'Error desconocido'}`, error: true };
        }

        return { message: `Estado actualizado a ${newStatus} en ${orderIdInput}`, orderId: orderIdInput, refreshRequired: true };
    } catch (error) {
        console.error('Error UPDATE_STATUS:', error);
        return { message: `Error: ${error.message}`, error: true };
    }
}

// Funcion para ejecutar UPDATE_COST
async function executeUpdateCost(actionData, req) {
    const parts = actionData.split('|').map(s => s.trim());
    const orderIdInput = parts[0];
    const newCost = parts[1] || '';
    
    console.log('=== EJECUTANDO UPDATE_COST ===');
    console.log('orderIdInput:', orderIdInput);
    console.log('newCost:', newCost);
    
    if (!orderIdInput || !newCost) {
        return { message: "Datos incompletos. Formato: id|costo", error: true };
    }

    try {
        const adminPassword = req.headers['x-admin-password'];
        
        // Get order UUID from readable_id
        const getRes = await fetch(process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/get-all-orders` 
            : 'http://localhost:3000/api/get-all-orders', {
            headers: { 'x-admin-password': adminPassword }
        });
        
        const orders = await getRes.json();
        const order = orders.find(o => o.readable_id === orderIdInput || o.id === orderIdInput);
        
        if (!order) {
            return { message: `Orden ${orderIdInput} no encontrada`, error: true };
        }
        
        const apiUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/update-order-full` 
            : 'http://localhost:3000/api/update-order-full';
        
        const updateRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
            body: JSON.stringify({ orderId: order.id, costo_fob: newCost })
        });

        if (!updateRes.ok) {
            const err = await updateRes.json().catch(() => ({ message: 'Error sin respuesta' }));
            return { message: `Error: ${err.message || 'Error desconocido'}`, error: true };
        }

        return { message: `Costo actualizado a ${newCost} en ${orderIdInput}`, orderId: orderIdInput, refreshRequired: true };
    } catch (error) {
        console.error('Error UPDATE_COST:', error);
        return { message: `Error: ${error.message}`, error: true };
    }
}

// Funcion para ejecutar ADD_PART
async function executeAddPart(actionData, req) {
    const parts = actionData.split('|').map(s => s.trim());
    const orderId = parts[0];
    const partName = parts[1] || '';
    const partCost = parts[2] || '0';
    
    console.log('=== EJECUTANDO ADD_PART ===');
    console.log('orderId:', orderId);
    console.log('partName:', partName);
    console.log('partCost:', partCost);
    
    if (!orderId || !partName) {
        return { message: "Datos incompletos. Formato: id|parte|costo", error: true };
    }

    try {
        const adminPassword = req.headers['x-admin-password'];
        
        // Get current items first
        const getRes = await fetch(process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/get-all-orders` 
            : 'http://localhost:3000/api/get-all-orders', {
            headers: { 'x-admin-password': adminPassword }
        });
        
        const orders = await getRes.json();
        const order = orders.find(o => o.id === orderId || o.readable_id === orderId);
        
        if (!order) {
            return { message: "Orden no encontrada", error: true };
        }
        
        const currentItems = order.items_json || [];
        const newItem = { part_name: partName, cost_fob: parseFloat(partCost) || 0, quantity: 1 };
        const updatedItems = [...currentItems, newItem];
        
        const apiUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/update-order-full` 
            : 'http://localhost:3000/api/update-order-full';
        
        const updateRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
            body: JSON.stringify({ orderId: order.id, items_json: updatedItems })
        });

        if (!updateRes.ok) {
            const err = await updateRes.json().catch(() => ({ message: 'Error sin respuesta' }));
            return { message: `Error: ${err.message || 'Error desconocido'}`, error: true };
        }

        return { message: `Parte "${partName}" agregada a orden ${orderId}`, orderId: orderId, refreshRequired: true };
    } catch (error) {
        console.error('Error ADD_PART:', error);
        return { message: `Error: ${error.message}`, error: true };
    }
}

// Funcion para ejecutar ADD_NOTE
async function executeAddNote(actionData, req) {
    const parts = actionData.split('|').map(s => s.trim());
    const orderIdInput = parts[0];
    const noteContent = parts.slice(1).join('|');
    
    console.log('=== EJECUTANDO ADD_NOTE ===');
    console.log('orderIdInput:', orderIdInput);
    console.log('noteContent:', noteContent);
    
    if (!orderIdInput || !noteContent) {
        return { message: "Datos incompletos. Formato: id|nota", error: true };
    }

    try {
        const adminPassword = req.headers['x-admin-password'];
        
        // Get order UUID from readable_id (e.g., "ORD-73" -> UUID)
        const getRes = await fetch(process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/get-all-orders` 
            : 'http://localhost:3000/api/get-all-orders', {
            headers: { 'x-admin-password': adminPassword }
        });
        
        const orders = await getRes.json();
        const order = orders.find(o => o.readable_id === orderIdInput || o.id === orderIdInput);
        
        if (!order) {
            return { message: `Orden ${orderIdInput} no encontrada`, error: true };
        }
        
        const orderUUID = order.id;
        
        const apiUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/add-note` 
            : 'http://localhost:3000/api/add-note';
        
        const noteRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
            body: JSON.stringify({ orderId: orderUUID, content: noteContent })
        });

        if (!noteRes.ok) {
            const err = await noteRes.json().catch(() => ({ message: 'Error sin respuesta' }));
            return { message: `Error: ${err.message || 'Error desconocido'}`, error: true };
        }

        return { message: `Nota agregada a ${orderIdInput}`, orderId: orderIdInput, refreshRequired: true };
    } catch (error) {
        console.error('Error ADD_NOTE:', error);
        return { message: `Error: ${error.message}`, error: true };
    }
}

// Funcion para ejecutar DELETE_ORDER
async function executeDeleteOrder(actionData, req) {
    const orderId = actionData.trim();
    
    console.log('=== EJECUTANDO DELETE_ORDER ===');
    console.log('orderId:', orderId);
    
    if (!orderId) {
        return { message: "Datos incompletos. Formato: id", error: true };
    }

    try {
        const adminPassword = req.headers['x-admin-password'];
        
        // Get order ID from readable_id if needed
        const getRes = await fetch(process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/get-all-orders` 
            : 'http://localhost:3000/api/get-all-orders', {
            headers: { 'x-admin-password': adminPassword }
        });
        
        const orders = await getRes.json();
        const order = orders.find(o => o.id === orderId || o.readable_id === orderId);
        
        if (!order) {
            return { message: "Orden no encontrada", error: true };
        }
        
        const apiUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/delete-order` 
            : 'http://localhost:3000/api/delete-order';
        
        const deleteRes = await fetch(apiUrl, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
            body: JSON.stringify({ orderId: order.id })
        });

        if (!deleteRes.ok) {
            const err = await deleteRes.json().catch(() => ({ message: 'Error sin respuesta' }));
            return { message: `Error: ${err.message || 'Error desconocido'}`, error: true };
        }

        return { message: `Orden ${orderId} eliminada`, orderId: orderId, refreshRequired: true };
    } catch (error) {
        console.error('Error DELETE_ORDER:', error);
        return { message: `Error: ${error.message}`, error: true };
    }
}
