
export default async function handler(req, res) {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    
    // Default vetted models if things fail
    const defaultModels = [
        { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (Recomendado)' },
        { id: 'google/gemini-2.5-pro-preview-03-25', name: 'Gemini 2.5 Pro' },
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
        { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' },
        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' }
    ];

    if (!OPENROUTER_API_KEY) {
        return res.status(200).json(defaultModels);
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`
            }
        });

        if (!response.ok) {
            return res.status(200).json(defaultModels);
        }

        const data = await response.json();
        // Limit to high quality or free models to avoid cluttering and accidental costs
        const formatted = data.data
            .filter(m => m.id.includes('flash') || m.id.includes('mini') || m.id.includes('llama-3.3') || m.id.includes('deepseek'))
            .map(m => ({
                id: m.id,
                name: m.name || m.id
            }))
            .slice(0, 15);

        return res.status(200).json(formatted.length > 0 ? formatted : defaultModels);
    } catch (error) {
        console.error('Error fetching models:', error);
        return res.status(200).json(defaultModels);
    }
}
