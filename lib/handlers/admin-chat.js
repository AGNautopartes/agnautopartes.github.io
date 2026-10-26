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

const NEW_ORDER_REFERENCE = '$new_order';

export const executeCommandSequence = async (registry, commands, context, state = {}) => {
    const completed = [];
    let createdOrderReference = state.createdOrderReference || null;

    for (const command of commands) {
        const args = { ...(command.args || {}) };
        if (args.order_ref === NEW_ORDER_REFERENCE) {
            if (!createdOrderReference) {
                return {
                    ok: false,
                    code: 'NEW_ORDER_REFERENCE_UNAVAILABLE',
                    message: 'No existe una orden recién creada para continuar',
                    completed
                };
            }
            args.order_ref = createdOrderReference;
        }

        const result = await registry.execute(command.name, args, context);
        if (!result.ok) return { ...result, completed };

        completed.push({
            command: command.name,
            message: result.message,
            data: result.data
        });

        if (command.name === 'create_order') {
            createdOrderReference =
                result.data?.orderId ||
                result.data?.readableId ||
                null;
        }
    }

    return {
        ok: true,
        message: completed.map(item => item.message).filter(Boolean).join('. '),
        data: { completed, createdOrderReference },
        refreshOrders: completed.length > 0
    };
};

const MAX_AGENT_ROUNDS = 8;

export const runAriaCommandLoop = async ({
    decide,
    registry,
    context,
    decisionInput,
    maxRounds = MAX_AGENT_ROUNDS
}) => {
    const continuationMessages = [];
    const completed = [];
    const executedSignatures = new Set();
    let createdOrderReference = null;
    let lastDecision = null;

    for (let round = 0; round < maxRounds; round += 1) {
        const decision = await decide({
            ...decisionInput,
            continuationMessages
        });
        lastDecision = decision;

        if (decision.type === 'message') {
            if (completed.length === 0) return { type: 'message', decision };
            return {
                type: 'command',
                decision,
                result: {
                    ok: true,
                    message: completed.map(item => item.message).filter(Boolean).join('. '),
                    data: { completed, createdOrderReference },
                    refreshOrders: true
                }
            };
        }

        const commands = Array.isArray(decision.commands)
            ? decision.commands
            : [decision.command];
        for (const command of commands) {
            const signature = `${command.name}:${JSON.stringify(command.args || {})}`;
            if (executedSignatures.has(signature)) {
                return {
                    type: 'command',
                    decision,
                    result: {
                        ok: false,
                        code: 'ARIA_REPEATED_COMMAND',
                        message: `Aria intentó repetir ${command.name}; la secuencia fue detenida`,
                        completed
                    }
                };
            }
            executedSignatures.add(signature);
        }

        const result = await executeCommandSequence(
            registry,
            commands,
            context,
            { createdOrderReference }
        );
        if (!result.ok) return { type: 'command', decision, result };

        completed.push(...result.data.completed);
        createdOrderReference = result.data.createdOrderReference || createdOrderReference;
        continuationMessages.push(decision.assistantMessage);
        commands.forEach((command, index) => {
            const commandResult = result.data.completed[index];
            continuationMessages.push({
                role: 'tool',
                tool_call_id: command.callId,
                name: command.name,
                content: JSON.stringify({
                    ok: true,
                    message: commandResult?.message,
                    data: commandResult?.data
                })
            });
        });
    }

    return {
        type: 'command',
        decision: lastDecision,
        result: {
            ok: false,
            code: 'ARIA_MAX_ROUNDS',
            message: 'Aria alcanzó el límite seguro de pasos; la secuencia fue detenida',
            completed
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

        const decisionInput = {
            apiKey: process.env.OPENROUTER_API_KEY,
            requestedModel: model,
            message: message.trim(),
            conversationHistory,
            adminName,
            orders: [],
            tools: registry.toModelTools()
        };
        const loop = await runAriaCommandLoop({
            decide: requestAriaDecision,
            registry,
            context: commandContext,
            decisionInput
        });
        const decision = loop.decision;

        const metadata = {
            source: 'aria-2',
            requestedModel: model,
            model: decision.model,
            resolvedModel: decision.resolvedModel,
            promptVersion: decision.promptVersion
        };

        if (loop.type === 'message') {
            return res.status(200).json({
                response: decision.message,
                refreshOrders: false,
                meta: metadata
            });
        }

        const result = loop.result;
        const response = commandResponse(result, {
            ...metadata,
            commands: result.data?.completed?.map(item => item.command) || []
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
