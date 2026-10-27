import supabase from '../../supabase-client.js';

const authenticateAdmin = async password => {
    if (!password) return false;
    const configured = process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN;
    if (configured && password === configured) return true;
    const { data } = await supabase.from('admin_users')
        .select('username').eq('password_hash', password).eq('is_active', true).maybeSingle();
    return Boolean(data);
};

const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = value => Math.round(value * 100) / 100;

export const calculateItem = item => {
    const priceUsd = Math.max(0, numeric(item?.price_usd));
    const shippingUsd = Math.max(0, numeric(item?.shipping_usd));
    const marginPct = Math.max(0, numeric(item?.margin_pct));
    // El cotizador original presenta este resultado como precio con IVA.
    const finalPriceVatUsd = marginPct < 100 ? money((priceUsd + shippingUsd) / (1 - marginPct / 100)) : 0;
    return {
        price_usd: priceUsd,
        margin_pct: marginPct,
        shipping_usd: shippingUsd,
        final_price_usd: money(finalPriceVatUsd / 1.15),
        final_price_vat_usd: finalPriceVatUsd
    };
};

const normalizeItem = (item, index) => ({
    part_name: String(item?.part_name || '').trim(),
    part_number: String(item?.part_number || '').trim(),
    description: String(item?.description || '').trim(),
    part_brand: String(item?.part_brand || '').trim(),
    option_name: String(item?.option_name || '').trim(),
    internal_reference: String(item?.internal_reference || '').trim(),
    warranty: String(item?.warranty || '').trim(),
    supplier_url: String(item?.supplier_url || '').trim(),
    image_url: String(item?.image_url || '').trim(),
    ...calculateItem(item),
    sort_order: index
});

const quotationSelect = `
    id, readable_id, customer_name, vehicle_brand, vehicle_model, vehicle_year,
    whatsapp_phone, delivery_time, editor_state, notes, status, total_usd, total_vat_usd, created_at, updated_at,
    quotation_items (id, part_name, part_number, part_brand, option_name, description, internal_reference, warranty, supplier_url, image_url,
        price_usd, shipping_usd, margin_pct, final_price_usd, final_price_vat_usd, sort_order)
`;

const getQuotation = async id => {
    const { data, error } = await supabase.from('quotations').select(quotationSelect)
        .eq('id', id).single();
    if (error) throw error;
    data.quotation_items?.sort((left, right) => left.sort_order - right.sort_order);
    data.quotation_items = (data.quotation_items || []).map((item, index) => ({ ...item, ...(data.editor_state?.item_details?.[index] || {}) }));
    return data;
};

export default async function handler(req, res) {
    const password = req.headers['x-admin-password'];
    if (!await authenticateAdmin(password)) return res.status(401).json({ message: 'No autorizado' });

    try {
        if (req.method === 'GET') {
            const { id, status } = req.query || {};
            if (id) return res.status(200).json({ data: await getQuotation(id) });
            let query = supabase.from('quotations').select(quotationSelect)
                .order('updated_at', { ascending: false }).limit(100);
            if (status) query = query.eq('status', status);
            const { data, error } = await query;
            if (error) throw error;
            return res.status(200).json({ data: (data || []).map(quote => ({ ...quote, quotation_items:(quote.quotation_items || []).sort((a,b) => a.sort_order - b.sort_order).map((item,index) => ({ ...item, ...(quote.editor_state?.item_details?.[index] || {}) })) })) });
        }

        if (req.method === 'DELETE') {
            const { id } = req.body || {};
            if (!id) return res.status(400).json({ message: 'id requerido' });
            const { error } = await supabase.from('quotations').delete().eq('id', id);
            if (error) throw error;
            return res.status(204).end();
        }

        if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });
        const { quotation = {}, items = [] } = req.body || {};
        const normalizedItems = Array.isArray(items) ? items.map(normalizeItem) : [];
        if (!normalizedItems.length) return res.status(400).json({ message: 'Agrega al menos un ítem' });
        if (normalizedItems.some(item => !item.part_name)) {
            return res.status(400).json({ message: 'Cada ítem requiere un repuesto' });
        }
        if (normalizedItems.some(item => item.margin_pct >= 100)) {
            return res.status(400).json({ message: 'El margen debe ser menor al 100%' });
        }
        const discount = quotation.editor_state?.discount_enabled ? Math.min(100, Math.max(0, numeric(quotation.editor_state.discount_percent))) : 0;

        const { data: id, error } = await supabase.rpc('save_quotation_draft', {
            p_quotation: {
                id: quotation.id || null,
                customer_name: quotation.customer_name || '',
                vehicle_brand: quotation.vehicle_brand || '',
                vehicle_model: quotation.vehicle_model || '',
                vehicle_year: quotation.vehicle_year || '',
                whatsapp_phone: quotation.whatsapp_phone || '',
                delivery_time: quotation.delivery_time || '',
                editor_state: quotation.editor_state || {},
                notes: quotation.notes || '',
                status: quotation.status || 'borrador',
                total_usd: money(normalizedItems.reduce((sum, item) => sum + item.final_price_usd, 0) * (1 - discount / 100)),
                total_vat_usd: money(normalizedItems.reduce((sum, item) => sum + item.final_price_vat_usd, 0) * (1 - discount / 100))
            },
            p_items: normalizedItems
        });
        if (error) throw error;
        return res.status(quotation.id ? 200 : 201).json({ data: await getQuotation(id) });
    } catch (error) {
        console.error('Quotation workflow error:', error.message);
        return res.status(500).json({ message: 'No fue posible procesar la cotización' });
    }
}
