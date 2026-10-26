// api/index.js - Router único para todas las funciones serverless
// Consolidación para evitar límite de 12 funciones en plan Hobby

import adminChat from '../lib/handlers/admin-chat.js';
import createOrder from '../lib/handlers/create-order.js';
import updateOrderFull from '../lib/handlers/update-order-full.js';
import getAllOrders from '../lib/handlers/get-all-orders.js';
import addNote from '../lib/handlers/add-note.js';
import deleteOrder from '../lib/handlers/delete-order.js';
import getModels from '../lib/handlers/get-models.js';
import authLogin from '../lib/handlers/auth-login.js';
import generate from '../lib/handlers/generate.js';
import getNotes from '../lib/handlers/get-notes.js';
import getOrderStatus from '../lib/handlers/get-order-status.js';
import saveQuotation from '../lib/handlers/save-quotation.js';
import generateQuotation from '../lib/handlers/generate-quotation.js';
import quotationsCrud from '../lib/handlers/quotations-crud.js';
import quotationsExport from '../lib/handlers/quotations-export.js';
import quotationsImport from '../lib/handlers/quotations-import.js';
import createOrderFromQuotation from '../lib/handlers/create-order-from-quotation.js';

const routes = {
    'admin-chat': adminChat,
    'create-order': createOrder,
    'update-order-full': updateOrderFull,
    'get-all-orders': getAllOrders,
    'add-note': addNote,
    'delete-order': deleteOrder,
    'get-models': getModels,
    'auth-login': authLogin,
    'generate': generate,
    'get-notes': getNotes,
    'get-order-status': getOrderStatus,
    'save-quotation': saveQuotation,
    'generate-quotation': generateQuotation,
    'quotations-crud': quotationsCrud,
    'quotations-export': quotationsExport,
    'quotations-import': quotationsImport,
    'create-order-from-quotation': createOrderFromQuotation,
};

export default async function handler(req, res) {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    const route = pathname.replace('/api/', '').split('?')[0];

    const handler = routes[route];
    if (!handler) {
        return res.status(404).json({ error: 'Endpoint no encontrado', route });
    }

    try {
        return await handler(req, res);
    } catch (error) {
        console.error(`Error en ${route}:`, error);
        return res.status(500).json({ error: 'Error interno del servidor', route });
    }
}