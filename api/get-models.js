import {
    DEFAULT_ARIA_MODEL,
    isUnsafeAgentModel,
    modelSupportsAgentUse
} from '../lib/agent-core/model-policy.js';

const configuredAllowlist = () =>
    new Set(
        (process.env.ARIA_ALLOWED_MODELS || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)
    );

const isFreeModel = model => {
    const promptPrice = Number.parseFloat(model.pricing?.prompt || '1');
    return promptPrice === 0 || model.id.endsWith(':free');
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.status(500).json({
            error: 'OPENROUTER_API_KEY no está configurada para Aria'
        });
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` }
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
            return res.status(response.status).json({
                error: payload?.error?.message || 'No fue posible consultar los modelos'
            });
        }

        const allowlist = configuredAllowlist();
        const models = (payload?.data || [])
            .filter(model => !isUnsafeAgentModel(model))
            .filter(modelSupportsAgentUse)
            .filter(model => allowlist.size > 0
                ? allowlist.has(model.id)
                : isFreeModel(model)
            )
            .map(model => ({
                id: model.id,
                name: model.name || model.id,
                provider: model.id.split('/')[0],
                isDefault: model.id === DEFAULT_ARIA_MODEL
            }))
            .sort((left, right) => {
                if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
                return left.name.localeCompare(right.name);
            });

        if (models.length === 0) {
            return res.status(503).json({
                error: 'No hay modelos aprobados con soporte de herramientas para Aria'
            });
        }

        return res.status(200).json(models);
    } catch (error) {
        console.error('Aria model catalog error:', error.message);
        return res.status(502).json({
            error: 'No fue posible consultar el catálogo de modelos'
        });
    }
}
