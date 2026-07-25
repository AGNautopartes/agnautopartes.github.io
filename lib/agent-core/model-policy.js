const BLOCKED_MODEL_PATTERNS = [
    /content[-_ ]?safety/i,
    /moderation/i,
    /embedding/i,
    /rerank/i
];

const SAFE_FALLBACK_MODEL = 'openrouter/free';

export const isAllowedAgentModel = model => {
    if (typeof model !== 'string' || !model.trim()) return false;
    return !BLOCKED_MODEL_PATTERNS.some(pattern => pattern.test(model.trim()));
};

export const DEFAULT_ARIA_MODEL = isAllowedAgentModel(process.env.ARIA_MODEL)
    ? process.env.ARIA_MODEL.trim()
    : SAFE_FALLBACK_MODEL;

export const selectAgentModel = requestedModel =>
    isAllowedAgentModel(requestedModel) ? requestedModel.trim() : DEFAULT_ARIA_MODEL;

export const modelSupportsAgentUse = model => {
    const supported = new Set(model?.supported_parameters || []);
    return supported.has('tools') || supported.has('tool_choice');
};

export const isUnsafeAgentModel = model =>
    !model?.id || !isAllowedAgentModel(model.id);
