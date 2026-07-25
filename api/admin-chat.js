import supabase from '../supabase-client.js';
import { createAgnCommandRegistry } from '../lib/agn-erp/command-catalog.js';
import { requestAriaDecision } from '../lib/aria/aria-agent.js';

export const maxDuration = 60;

const authenticateAdmin = async adminPassword => {
    if (!adminPassword) return false;

    const configuredPassword =
        process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN;

    if (configuredPassword && adminPassword === configuredPassword) return true;

    const { data: user, error } = await supabase
        .from('admin_users')
        .select('username')
        .eq('password_hash', adminPassword)
        .eq('is_active', true)
        .maybeSingle();

    if (error) console.error('Aria auth error:', error.message);
    return Boolean(user);
};

const commandResponse = (result, metadata = {}) => {
    if (result.code === 'CONFIRMATION_REQUIRED') {
        return {
            status: 200,
            body: {
                response: result.message,
                confirmationRequired: result.pendingCommand,
                refreshOrders: false,
                meta: metadata
            }
        };
    }

    if (!result.ok) {
        return {
            status: result.code === 'INVALID_ARGUMENTS' ? 400 : 422,
            body: {
                error: result.message,
                code: result.code,
                refreshOrders: false,
                meta: metadata
            }
        };
    }

    return {
        status: 200,
        body: {
            response: result.message,
            refreshOrders: result.refreshOrders === true,
            result: result.data,
            meta: metadata
        }
    };
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const adminPassword = req.headers['x-admin-password'];
    if (!await authenticateAdmin(adminPassword)) {
        return res.status(401).json({ message: 'No autorizado' });
    }

    const {
        message,
        conversationHistory = [],
        adminName = 'Admin',
        model
    } = req.body || {};

    const registry = createAgnCommandRegistry();
    const commandContext = {
        adminName,
        headers: { 'x-admin-password': adminPassword }
    };

    try {
        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'El mensaje es requerido' });
        }
        if (message.length > 2000) {
            return res.status(400).json({
                error: 'El mensaje excede el límite de 2000 caracteres',
                code: 'MESSAGE_TOO_LONG'
            });
        }

        const decision = await requestAriaDecision({
            apiKey: process.env.OPENROUTER_API_KEY,
            requestedModel: model,
            message: message.trim(),
            conversationHistory,
            adminName,
            orders: [],
            tools: registry.toModelTools()
        });

        const metadata = {
            source: 'aria-2',
            requestedModel: model,
            model: decision.model,
            resolvedModel: decision.resolvedModel,
            promptVersion: decision.promptVersion
        };

        if (decision.type === 'message') {
            return res.status(200).json({
                response: decision.message,
                refreshOrders: false,
                meta: metadata
            });
        }

        const result = await registry.execute(
            decision.command.name,
            decision.command.args,
            commandContext
        );
        const response = commandResponse(result, {
            ...metadata,
            command: decision.command.name
        });

        return res.status(response.status).json(response.body);
    } catch (error) {
        console.error('Aria 2 error:', error.message);
        return res.status(502).json({
            error: error.message || 'Aria no pudo procesar la solicitud',
            code: 'ARIA_PROVIDER_ERROR'
        });
    }
}
