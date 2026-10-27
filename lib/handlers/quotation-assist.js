import { quotationLogoNames } from '../quotation-logo-catalog.js';
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

const HEADER_FIELDS = new Set(['customer_name', 'whatsapp_phone', 'vehicle_brand', 'vehicle_model', 'vehicle_year', 'delivery_time', 'notes']);
const ITEM_FIELDS = new Set(['part_name', 'part_number', 'part_brand', 'option_name', 'description', 'internal_reference', 'warranty', 'supplier_url', 'image_url', 'image_url_2', 'image_url_3', 'price_usd', 'shipping_usd', 'margin_pct']);

const pickFields = (fields, allowed) => Object.fromEntries(
    Object.entries(fields || {}).filter(([key, value]) => allowed.has(key) && ['string', 'number'].includes(typeof value))
);

export const sanitizeOperations = (operations, itemCount, strictNumbers = false) => {
    let count = itemCount;
    return (Array.isArray(operations) ? operations : []).slice(0, 24).flatMap(operation => {
        if (!operation || typeof operation !== 'object') return [];
        if (operation.type === 'update_header') {
            const fields = pickFields(operation.fields, HEADER_FIELDS);
            return Object.keys(fields).length ? [{ type: 'update_header', fields }] : [];
        }
        if (operation.type === 'update_item') {
            const fields = pickFields(operation.fields, ITEM_FIELDS);
            if (!Object.keys(fields).length) return [];
            if (Number.isInteger(operation.item_number) && operation.item_number > 0) return [{ type:'update_item', item_number:operation.item_number, fields }];
            if (!strictNumbers && Number.isInteger(operation.index) && operation.index >= 0 && operation.index < count) return [{ type:'update_item', index:operation.index, fields }];
            return [];
        }
        if (operation.type === 'add_item') {
            const fields = pickFields(operation.fields, ITEM_FIELDS);
            if (!Object.keys(fields).length) return [];
            count += 1;
            return [{ type: 'add_item', fields }];
        }
        if (operation.type === 'add_logo' && Number.isInteger(operation.item_number) && operation.item_number > 0 && typeof operation.brand === 'string') {
            const brand = quotationLogoNames.find(name => name.toLowerCase() === operation.brand.trim().toLowerCase());
            return brand ? [{type:'add_logo', item_number:operation.item_number, brand}] : [{type:'question',text:'No encontré ese logo en el catálogo.'}];
        }
        if (operation.type === 'question' && typeof operation.text === 'string') return [{ type: 'question', text: operation.text.slice(0, 500) }];
        return [];
    });
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });
    if (!await authenticate(req.headers['x-admin-password'])) return res.status(401).json({ message: 'No autorizado' });
    const { message, quotation, history = [], model } = req.body || {};
    if (!message?.trim() || !quotation) return res.status(400).json({ message: 'Mensaje y cotización requeridos' });
    if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ message: 'Aria no está configurada' });
    const quote = JSON.stringify(quotation).slice(0, 14000);
    const system = `Eres Aria y completas la cotización actual. Responde exclusivamente JSON con {"reply":"...","operations":[...]}. No afirmes haber aplicado cambios en reply; pregunta por datos ambiguos o faltantes. Usa SOLO estos nombres exactos en fields:
Cabecera: customer_name (cliente), whatsapp_phone (teléfono), vehicle_brand (marca del vehículo), vehicle_model (modelo), vehicle_year (año), delivery_time (tiempo de entrega), notes.
Ítem: part_name (repuesto), part_number (número de parte), part_brand (marca del repuesto), option_name (opción), description (descripción), internal_reference (referencia interna), warranty (garantía), supplier_url (enlace del producto), image_url, image_url_2 e image_url_3 (hasta tres enlaces directos de imágenes), price_usd (costo numérico), shipping_usd (flete numérico), margin_pct (margen porcentual numérico).
Catálogo de logos disponibles: ${quotationLogoNames.join(", ")}. Cuando el usuario pida un logo, usa {"type":"add_logo","item_number":1,"brand":"Toyota"}; brand debe coincidir exactamente con un nombre del catálogo. No uses image_url para logos del catálogo. Si hay ambigüedad o no se identifica el ítem, pregunta. No reemplaces fotos existentes.
Operaciones: {"type":"update_header","fields":{...}}, {"type":"update_item","item_number":1,"fields":{...}}, {"type":"add_item","fields":{...}} o {"type":"question","text":"..."}. Usa item_number para identificar el número fijo del ítem en quotation_items; nunca uses la posición ni index. Para el ítem vacío inicial usa su item_number; si falta, usa 1. Usa add_item para un repuesto adicional. Si actualizas un ítem recién añadido en esta respuesta, su número empieza en editor_state.next_item_number y aumenta por cada add_item. Conserva información existente no mencionada. No inventes datos, precios ni compatibilidad. Si un enlace es a una imagen, usa image_url; si es página de producto, usa supplier_url. Si dos valores o imágenes no se pueden asociar con seguridad a un ítem, pregunta. Nunca guardes, envíes, conviertas ni crees órdenes.`;
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
            body: JSON.stringify({ model: selectAgentModel(model), temperature: 0.1, max_tokens: 900,
                messages: [{ role: 'system', content: system }, ...history.slice(-6), { role: 'user', content: `Cotización actual:\n${quote}\n\nSolicitud: ${message}` }], response_format: { type: 'json_object' } })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || 'Proveedor no disponible');
        const parsed = JSON.parse(payload.choices?.[0]?.message?.content || '{}');
        const operations = sanitizeOperations(parsed.operations, quotation.quotation_items?.length || 0, true);
        const changes = operations.filter(operation => operation.type !== 'question');
        const questions = operations.filter(operation => operation.type === 'question').map(operation => operation.text).join(' ');
        const reply = changes.length ? String(parsed.reply || questions || 'Datos aplicados al borrador.') : `No pude aplicar cambios. ${questions || 'Indica qué campo o ítem deseas completar.'}`;
        return res.status(200).json({ data: { reply, operations } });
    } catch (error) { return res.status(502).json({ message: 'Aria no pudo completar la cotización' }); }
}
