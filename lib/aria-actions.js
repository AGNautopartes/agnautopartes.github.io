export const normalizeConversationHistory = (conversationHistory, currentMessage) => {
    const safeHistory = Array.isArray(conversationHistory)
        ? conversationHistory.filter(item =>
            item &&
            ['user', 'assistant'].includes(item.role) &&
            typeof item.content === 'string'
        )
        : [];

    const lastMessage = safeHistory.at(-1);
    const hasDuplicateCurrentMessage = lastMessage?.role === 'user' &&
        lastMessage.content.trim() === currentMessage.trim();

    return hasDuplicateCurrentMessage ? safeHistory.slice(0, -1) : safeHistory;
};

export const parseActionBlocks = (responseText) =>
    [...responseText.matchAll(/\[([A-Z_]+):([^\]]+)\]/g)].map(match => ({
        type: match[1],
        data: match[2]
    }));
