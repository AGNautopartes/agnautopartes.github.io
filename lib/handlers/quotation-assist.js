import { selectAgentModel } from '../agent-core/model-policy.js';
import supabase from '../../supabase-client.js';

const authenticate = async password => {
    const configured = process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN;
    if (configured && password === configured) return true;
    if (!password) return false;
    const { data } = await supabase.from('admin_users').select('username')
        .eq('password_hash', password).eq('is_active', true).maybeSingle();
    return Boolean(data);
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });
    if (!await authenticate(req.headers['x-admin-password'])) return res.status(401).json({ message: 'No autorizado' });
    const { message, quotation, history = [], model } = req.body || {};
    if (!message?.trim() || !quotation) return res.status(400).json({ message: 'Mensaje y cotización requeridos' });
    if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ message: 'Aria no está configurada' });
    const quote = JSON.stringify(quotation).slice(0, 14000);
    const system = `Eres Aria, asistente de una cotización de repuestos. Solo trabajas sobre la cotización actual. No inventes precio, número de parte, compatibilidad, enlace ni descripción. Los ítems se identifican por su número visible (1 empieza en cero internamente). Devuelve JSON válido con {reply,operations}. operations contiene solo: update_header {fields}, update_item {index,fields}, add_item {fields}, o question {text}. Nunca guardes, envíes ni crees órdenes.`;
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
            body: JSON.stringify({ model: selectAgentModel(model), temperature: 0.1, max_tokens: 900,
                messages: [{ role: 'system', content: system }, ...history.slice(-6), { role: 'user', content: `Cotización actual:\n${quote}\n\nSolicitud: ${message}` }], response_format: { type: 'json_object' } })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || 'Proveedor no disponible');
        const parsed = JSON.parse(payload.choices?.[0]?.message?.content || '{}');
        return res.status(200).json({ data: { reply: parsed.reply || '', operations: Array.isArray(parsed.operations) ? parsed.operations : [] } });
    } catch (error) { return res.status(502).json({ message: 'Aria no pudo completar la cotización' }); }
}
