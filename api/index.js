// Router único: cada endpoint se importa únicamente cuando se solicita.
// Así un módulo opcional no puede impedir el inicio de login o pedidos.
const routes = {
    'admin-chat': () => import('../lib/handlers/admin-chat.js'),
    'create-order': () => import('../lib/handlers/create-order.js'),
    'update-order-full': () => import('../lib/handlers/update-order-full.js'),
    'get-all-orders': () => import('../lib/handlers/get-all-orders.js'),
    'add-note': () => import('../lib/handlers/add-note.js'),
    'delete-order': () => import('../lib/handlers/delete-order.js'),
    'get-models': () => import('../lib/handlers/get-models.js'),
    'auth-login': () => import('../lib/handlers/auth-login.js'),
    'generate': () => import('../lib/handlers/generate.js'),
    'get-notes': () => import('../lib/handlers/get-notes.js'),
    'get-order-status': () => import('../lib/handlers/get-order-status.js'),
    'quotations': () => import('../lib/handlers/quotations.js'),
    'quotation-assist': () => import('../lib/handlers/quotation-assist.js'),
    'quotation-pdf': () => import('../lib/handlers/quotation-pdf.js'),
    'create-order-from-quotation': () => import('../lib/handlers/create-order-from-quotation.js')
};

export default async function handler(req, res) {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    const route = pathname.replace('/api/', '').split('?')[0];

    const loadHandler = routes[route];
    if (!loadHandler) {
        return res.status(404).json({ error: 'Endpoint no encontrado', route });
    }

    try {
        const { default: handler } = await loadHandler();
        if (typeof handler !== 'function') {
            throw new TypeError(`El endpoint ${route} no exporta un handler`);
        }
        return await handler(req, res);
    } catch (error) {
        console.error(`Error en ${route}:`, error);
        return res.status(500).json({ error: 'Error interno del servidor', route });
    }
}
