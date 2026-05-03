export default async function handler(req, res) {
	const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
	const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

	if (!GEMINI_API_KEY && !OPENROUTER_API_KEY) {
		return res.status(500).json({ error: 'No hay API keys configuradas (GEMINI_API_KEY u OPENROUTER_API_KEY).' });
	}

	const models = [];

	// === GEMINI MODELS (all free via Google API key) ===
	if (GEMINI_API_KEY) {
		try {
			const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
			if (r.ok) {
				const data = await r.json();
				const geminiModels = (data.models || [])
					.filter(m => m.supportedGenerationMethods?.includes('generateContent'))
					.map(m => ({
						id: `google/${m.name.replace('models/', '')}`,
						name: m.displayName || m.name
					}));
				models.push(...geminiModels);
			}
		} catch (e) {
			console.error('Error fetching Gemini models:', e);
		}
	}

	// === OPENROUTER MODELS (free only: pricing.prompt === "0") ===
	if (OPENROUTER_API_KEY) {
		try {
			const r = await fetch('https://openrouter.ai/api/v1/models', {
				headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` }
			});
			if (r.ok) {
				const data = await r.json();
				const orModels = (data.data || [])
					.filter(m => !m.id.startsWith('google/'))
					.filter(m => {
						const pPrompt = parseFloat(m.pricing?.prompt || '1');
						return pPrompt === 0 || m.id.endsWith(':free');
					})
					.map(m => ({ id: m.id, name: m.name || m.id }));
				models.push(...orModels);
			}
		} catch (e) {
			console.error('Error fetching OpenRouter models:', e);
		}
	}

	if (models.length === 0) {
		return res.status(500).json({ error: 'No se pudieron obtener modelos de ninguna API.' });
	}

	return res.status(200).json(models);
}
