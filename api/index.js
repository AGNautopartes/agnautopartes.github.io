// api/index.js - Router único para todas las funciones serverless
// Consolidación para evitar límite de 12 funciones en plan Hobby

import adminChat from './admin-chat.js';
import createOrder from './create-order.js';
import updateOrderFull from './update-order-full.js';
import getAllOrders from './get-all-orders.js';
import addNote from './add-note.js';
import deleteOrder from './delete-order.js';
import getModels from './get-models.js';
import authLogin from './auth-login.js';
import generate from './generate.js';
import getNotes from './get-notes.js';
import getOrderStatus from './get-order-status.js';
import saveQuotation from './save-quotation.js';
import generateQuotation from './generate-quotation.js';
import quotationsCrud from './quotations-crud.js';
import quotationsExport from './quotations-export.js';
import quotationsImport from './quotations-import.js';
import createOrderFromQuotation from './create-order-from-quotation.js';

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