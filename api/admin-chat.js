import supabase from '../supabase-client.js';
import { normalizeConversationHistory, parseActionBlocks } from '../lib/aria-actions.js';
export const maxDuration = 60;
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }
    //  MODIF PARA PROBAR
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
    const model = req.body.model || 'minimax/minimax-m2.5:free';

    if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'El mensaje es requerido.' });
    }

    const historyWithoutDuplicate = normalizeConversationHistory(conversationHistory, message);

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
Eres Aria, asistente del ERP de AGN Autopartes. RESPONDE SIEMPRE EN ESPAÑOL.

Fecha hoy: ${today}

ÓRDENES ACTUALES:
${ordersContext}

REGLAS CRÍTICAS:
1. NUNCA uses palabras genéricas como "client", "cliente", "NOMBRE_COMPLETO", "marca", "modelo", "parte", "N/A" como valores. Siempre reemplaza con los datos REALES que el usuario proporcionó. Si el usuario NO dio un dato, PREGUNTA antes de actuar.
2. Si el usuario menciona marca Y modelo de vehículo, sepáralos claramente. Si solo da uno, PREGUNTA por el que falta.
3. Los separadores de acciones son PIPE | — NUNCA comas.
4. Solo usa statuses de la lista válida.
5. NUNCA escribas los nombres de variables en las acciones. Usa siempre datos reales.
6. **PARSING DE NOMBRES**: Cuando el usuario escriba mensajes con errores ortográficos o en lenguaje natural, DEBES EXTRAER los datos reales:
   - Si el usuario escribe "nombr edel cleinte david cordero" → extrae "David Cordero" como cliente
   - Si el usuario escribe "toyota, rav4 1998" → separa: marca="Toyota", modelo="Rav4", año="1998"
   - Si el usuario escribe "requiere una llanta" → extrae "Llanta" como pieza
   - Ignora palabras como "nombre", "del", "de", "el", "cliente", "cleinte", "requiere", "necesita"
7. **ORDEN DE DATOS**: El formato CREATE_ORDER siempre debe ser: cliente|marca|modelo|año|pieza

STATUSES VÁLIDOS: Solicitado, Cotizado, Comprado, Tránsito 1 (Prov→Log), Tránsito 2 (Log→EC), En Aduana, Entregado, Cancelado

ACCIONES — Copia el formato de estos ejemplos usando datos reales:

CREAR orden:
[CREATE_ORDER:María López|Toyota|Hilux|2020|Faro derecho]
[CREATE_ORDER:Carlos Mendoza|Ford|Explorer|2019|Bujía de encendido]
[CREATE_ORDER:Ana Rodríguez|Chevrolet|D-Max|2021|Filtro de aceite]
[CREATE_ORDER:David Cordero|Toyota|Rav4|1998|Llanta]

Cambiar status:
[UPDATE_STATUS:ORD-74|Cotizado]

Cambiar costo:
[UPDATE_COST:ORD-1|45.50]

Cambiar vehículo:
[UPDATE_VEHICLE:ORD-75|Nissan|Frontier|2022]

Editar cliente (campos: nombre, teléfono, ruc, cédula):
[UPDATE_CUSTOMER:ORD-1|teléfono|0991234567]

Agregar parte:
[ADD_PART:ORD-79|Rodillo trasero|25.00]

Agregar nota:
[ADD_NOTE:ORD-74|Cliente confirma recepción mañana]

Eliminar orden:
[DELETE_ORDER:ORD-10]
`.trim();

    try {
        let responseText;

        if (useOpenRouter) {
            // === OPENROUTER CALL ===
            const messagesForAPI = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...historyWithoutDuplicate.map(m => ({
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
                ...historyWithoutDuplicate.map(m => ({
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
        const actions = parseActionBlocks(responseText);

        let displayText = responseText;
        const actionResults = [];
        const executors = {
            CREATE_ORDER: executeCreateOrder,
            UPDATE_VEHICLE: executeUpdateVehicle,
            UPDATE_STATUS: executeUpdateStatus,
            UPDATE_COST: executeUpdateCost,
            UPDATE_CUSTOMER: executeUpdateCustomer,
            ADD_PART: executeAddPart,
            ADD_NOTE: executeAddNote,
            DELETE_ORDER: executeDeleteOrder
        };

        for (const action of actions) {
            const actionType = action.type;
            const actionData = action.data;
            const executor = executors[actionType];

            console.log('ARIA ACTION:', actionType);
            if (!executor) {
                actionResults.push({
                    type: actionType,
                    message: `Acción no soportada: ${actionType}`,
                    error: true
                });
                continue;
            }

            const result = await executor(actionData, req);
            actionResults.push({ type: actionType, ...result });
        }

        if (actionResults.length > 0) {
            displayText = actionResults
                .map(result => result.message || `${result.type} ejecutada`)
                .join('\n');
            const needsRefresh = actionResults.some(result => result.refreshRequired === true);
            return res.status(200).json({ 
                response: displayText,
                refreshOrders: needsRefresh,
                _debug: { 
                    model, 
                    useOpenRouter, 
                    useGeminiNative, 
                    ordersCount: existingOrders?.length || 0,
                    actionCount: actionResults.length,
                    actionResults
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
                actionCount: 0
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
    // Try to parse as pipe-separated values first
    let parts = actionData.split('|').map(s => s.trim());
    
    // If we don't have 5 parts, try comma-separated as fallback
    if (parts.length < 5) {
        parts = actionData.split(',').map(s => s.trim());
    }
    
    // If still not enough parts, we'll work with what we have and use empty strings for missing
    const customerName = parts[0] || '';
    const vehicleBrand = parts[1] || '';
    const vehicleModel = parts[2] || '';
    const vehicleYear = parts[3] || '';
    const partName = parts[4] || '';
    
    console.log('=== EJECUTANDO CREATE_ORDER ===');
    console.log('Input data:', actionData);
    console.log('Parsed parts:', parts);
    console.log('customerName:', customerName);
    console.log('vehicleBrand:', vehicleBrand);
    console.log('vehicleModel:', vehicleModel);
    console.log('vehicleYear:', vehicleYear);
    console.log('partName:', partName);
    
    // Validate required fields
    if (!customerName || !partName) {
        return { 
            message: "Datos incompletos. Necesito: cliente|marca|modelo|año|parte",
            error: true 
        };
    }
    
    // Prevent generic placeholder names
    const lowerName = customerName.toLowerCase().trim();
    if (lowerName === 'client' || lowerName === 'cliente' || lowerName === 'nombre' || lowerName === 'unnamed') {
        return { 
            message: "Por favor proporciona un nombre de cliente específico en lugar de un término genérico como 'client'.",
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
                customer_name: customerName,
                vehicle_brand: vehicleBrand,
                vehicle_model: vehicleModel || vehicleBrand,
                vehicle_year: vehicleYear,
                part_name: partName,
                part_number: '',
                vendor_name: '',
                supplier_url: '',
                cost_fob: 0,
                sale_price: 0
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

async function executeUpdateCustomer(actionData, req) {
    const [orderIdInput, rawField, ...valueParts] = actionData.split('|').map(s => s.trim());
    const value = valueParts.join('|').trim();
    const normalizedField = (rawField || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const fieldMap = {
        nombre: 'customer_name',
        name: 'customer_name',
        telefono: 'customer_phone',
        phone: 'customer_phone',
        ruc: 'customer_ruc',
        cedula: 'customer_cedula'
    };
    const targetField = fieldMap[normalizedField];

    if (!orderIdInput || !targetField || !value) {
        return {
            message: 'Datos incompletos. Formato: id|nombre/teléfono/ruc/cédula|valor',
            error: true
        };
    }

    try {
        const adminPassword = req.headers['x-admin-password'];
        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000';
        const getRes = await fetch(`${baseUrl}/api/get-all-orders`, {
            headers: { 'x-admin-password': adminPassword }
        });

        if (!getRes.ok) {
            return { message: 'Error al consultar la orden', error: true };
        }

        const orders = await getRes.json();
        const order = orders.find(o =>
            o.readable_id === orderIdInput ||
            o.readable_id?.toLowerCase() === orderIdInput.toLowerCase() ||
            o.readable_id === `ORD-${orderIdInput}` ||
            o.id === orderIdInput
        );

        if (!order) {
            return { message: `Orden ${orderIdInput} no encontrada`, error: true };
        }

        const updateRes = await fetch(`${baseUrl}/api/update-order-full`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': adminPassword
            },
            body: JSON.stringify({ orderId: order.id, [targetField]: value })
        });

        if (!updateRes.ok) {
            const errorResult = await updateRes.json().catch(() => ({}));
            return {
                message: `Error: ${errorResult.message || 'No se pudo actualizar el cliente'}`,
                error: true
            };
        }

        return {
            message: `${rawField} actualizado en ${order.readable_id}`,
            orderId: order.readable_id,
            refreshRequired: true
        };
    } catch (error) {
        return { message: `Error: ${error.message}`, error: true };
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
        
        // First, get current order details to preserve margin
        const orderDetailsRes = await fetch(process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/get-all-orders` 
            : 'http://localhost:3000/api/get-all-orders', {
            headers: { 'x-admin-password': adminPassword }
        });
        
        const allOrders = await orderDetailsRes.json();
        const currentOrder = allOrders.find(o => o.id === order.id);
        
        // Prepare update data with cost (fob_cost) and preserve existing margin if possible
const updateData = {
orderId: order.id,
costo_fob: parseFloat(newCost) || 0
};
        
        // If we have financial summary with margin, preserve it
        // We'll let the backend handle the bidirectional calculation
        // by not specifying price or margin_percent
        // The backend will calculate the appropriate price to maintain margin
        
        const apiUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/update-order-full` 
            : 'http://localhost:3000/api/update-order-full';
        
        const updateRes = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': adminPassword
            },
            body: JSON.stringify(updateData)
        });
        
        if (!updateRes.ok) {
            const err = await updateRes.json().catch(() => ({ message: 'Error sin respuesta' }));
            return { message: `Error: ${err.message || 'Error desconocido'}`, error: true };
        }
        
        return { message: `Costo FOB actualizado a ${newCost} en ${orderIdInput}`, orderId: orderIdInput, refreshRequired: true };
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
        const newItem = { part_name: partName, part_number: '', cost_fob: parseFloat(partCost) || 0, quantity: 1, vendor_name: '', supplier_url: '', tracking_number: '', item_status: 'Solicitado', margin_percent: null, sale_price: 0, supplier_freight: 0, customs_nationalization: 0 };
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
    const orderIdInput = actionData.trim().replace(/^#/, ''); // Quitar # si lo tiene
    
    console.log('=== EJECUTANDO DELETE_ORDER ===');
    console.log('orderIdInput:', orderIdInput);
    
    if (!orderIdInput) {
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
        
        if (!getRes.ok) {
            const err = await getRes.json().catch(() => ({}));
            console.error('GET_ORDERS_ERROR:', err);
            return { message: "Error al obtener órdenes: " + (err.message || 'Error desconocido'), error: true };
        }
        
        const orders = await getRes.json();
        
        // Buscar por readable_id, id, o número parcial
        const order = orders.find(o => 
            o.readable_id === orderIdInput || 
            o.readable_id?.toLowerCase() === orderIdInput.toLowerCase() ||
            o.readable_id === 'ORD-' + orderIdInput ||
            o.id === orderIdInput
        );
        
        if (!order) {
            console.log('Orders disponibles:', orders.map(o => o.readable_id));
            return { message: `Orden "${orderIdInput}" no encontrada`, error: true };
        }
        
        console.log('Orden encontrada:', order.readable_id, order.id);
        
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

        return { message: `Orden ${order.readable_id} eliminada`, orderId: order.readable_id, refreshRequired: true };
    } catch (error) {
        console.error('Error DELETE_ORDER:', error);
        return { message: `Error: ${error.message}`, error: true };
    }
}
