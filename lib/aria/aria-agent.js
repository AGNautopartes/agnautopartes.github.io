import { buildAriaSystemPrompt, ARIA_PROMPT_VERSION } from './aria-prompt.js';
import { selectAgentModel } from '../agent-core/model-policy.js';

const normalizeHistory = history => {
    if (!Array.isArray(history)) return [];

    return history
        .filter(item =>
            item &&
            ['user', 'assistant'].includes(item.role) &&
            typeof item.content === 'string' &&
            item.content.trim()
        )
        .slice(-10)
        .map(item => ({
            role: item.role,
            content: item.content.trim().slice(0, 2000)
        }));
};

const parseToolArguments = toolCall => {
    const rawArguments = toolCall?.function?.arguments;
    if (rawArguments && typeof rawArguments === 'object') return rawArguments;
    if (typeof rawArguments !== 'string') return {};

    try {
        return JSON.parse(rawArguments);
    } catch {
        throw new Error(`El modelo devolvió argumentos inválidos para ${toolCall?.function?.name || 'el comando'}`);
    }
};

export const requestAriaDecision = async ({
    apiKey,
    requestedModel,
    message,
    conversationHistory,
    adminName,
    orders,
    tools
}) => {
    if (!apiKey) throw new Error('OPENROUTER_API_KEY no está configurada');

    const model = selectAgentModel(requestedModel);
    const history = normalizeHistory(conversationHistory);
    const lastHistoryMessage = history.at(-1);
    const historyWithoutDuplicate =
        lastHistoryMessage?.role === 'user' &&
        lastHistoryMessage.content.trim() === message.trim()
            ? history.slice(0, -1)
            : history;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://agnautopartes.vercel.app',
            'X-OpenRouter-Title': 'AGN Autopartes Aria'
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: 'system',
                    content: buildAriaSystemPrompt({ adminName, orders })
                },
                ...historyWithoutDuplicate,
                { role: 'user', content: message }
            ],
            tools,
            temperature: 0.1,
            top_p: 0.1,
            max_tokens: 500
        })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(
            payload?.error?.message ||
            `OpenRouter respondió con estado ${response.status}`
        );
    }

    const modelMessage = payload?.choices?.[0]?.message;
    if (!modelMessage) throw new Error('El proveedor no devolvió una respuesta válida');

    const toolCall = modelMessage.tool_calls?.[0];
    if (toolCall?.function?.name) {
        return {
            type: 'command',
            model,
            resolvedModel: payload.model || model,
            promptVersion: ARIA_PROMPT_VERSION,
            command: {
                name: toolCall.function.name,
                args: parseToolArguments(toolCall)
            }
        };
    }

    return {
        type: 'message',
        model,
        resolvedModel: payload.model || model,
        promptVersion: ARIA_PROMPT_VERSION,
        message: modelMessage.content?.trim() || 'Necesito más información para ayudarte.'
    };
};
