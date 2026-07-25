import {
    DEFAULT_ARIA_MODEL,
    isUnsafeAgentModel,
    modelSupportsAgentUse
} from '../lib/agent-core/model-policy.js';

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

        const catalogModels = (payload?.data || [])
            .filter(model => !isUnsafeAgentModel(model))
            .filter(modelSupportsAgentUse)
            .map(model => ({
                id: model.id,
                name: model.name || model.id,
                provider: model.id.split('/')[0],
                isDefault: model.id === DEFAULT_ARIA_MODEL
            }));
        const freeRouter = {
            id: 'openrouter/free',
            name: 'OpenRouter: Free Models Router',
            provider: 'openrouter',
            isDefault: DEFAULT_ARIA_MODEL === 'openrouter/free'
        };
        const models = [
            freeRouter,
            ...catalogModels.filter(model => model.id !== freeRouter.id)
        ]
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
