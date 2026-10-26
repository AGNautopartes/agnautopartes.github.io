// api/quotations-crud.js
// Operaciones CRUD completas para cotizaciones + items

import supabase from '../supabase-client.js';

export async function getQuotationsList({ status, customer_name, customer_phone, date_from, date_to, limit = 30, cursor = null }) {
  let query = supabase
    .from('quotations')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  // Filtros
  if (status) query = query.eq('status', status);
  if (date_from) query = query.gte('created_at', date_from);
  if (date_to) query = query.lte('created_at', date_to);
  if (customer_name) {
    // Buscar por teléfono o nombre (approx)
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .or(`full_name.ilike.%${customer_name}%,phone.ilike.%${customer_name}%`)
      .limit(5);
    if (customers && customers.length > 0) {
      const ids = customers.map(c => c.id).join(',');
      query = query.in('customer_id', ids);
    }
  }
  if (customer_phone) {
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', customer_phone);
    if (customers && customers.length > 0) {
      const ids = customers.map(c => c.id).join(',');
      query = query.in('customer_id', ids);
    }
  }

  // Paginación cursor
  if (cursor) {
    const { data: cursorOrder } = await supabase
      .from('quotations')
      .select('created_at, id')
      .eq('id', cursor)
      .maybeSingle();
    if (cursorOrder) {
      query = query.lt('created_at', cursorOrder.created_at);
    }
  }

  const { data, error, count } = await query.limit(limit);

  if (error) throw error;

  return {
    data: data || [],
    total: count || 0,
    nextCursor: data && data.length === limit ? data[data.length - 1].id : null
  };
}

export async function getQuotationById(id) {
  if (!id) return null;

  const { data, error } = await supabase
    .from('quotations')
    .select(`
      *,
      quotation_items (*)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createQuotation({ customer_name, vehicle_brand, vehicle_model, vehicle_year, whatsapp_phone, notes, items }) {
  // 1. Generar readable_id
  const { data: idResult } = await supabase.rpc('generate_quotation_id');
  const readableId = idResult;

  // 2. Insertar cabecera
  const { data: quotation, error: qError } = await supabase
    .from('quotations')
    .insert({
      readable_id: readableId,
      customer_name: customer_name || 'Cliente',
      vehicle_brand: vehicle_brand || 'Marca',
      vehicle_model: vehicle_model || 'Modelo',
      vehicle_year: vehicle_year || '',
      status: 'borrador',
      whatsapp_phone: whatsapp_phone || '',
      notes: notes || '',
      created_by: 'admin'
    })
    .select()
    .single();

  if (qError) throw qError;

  // 3. Insertar ítems si vienen
  if (items && Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await supabase
        .from('quotation_items')
        .insert({
          quotation_id: quotation.id,
          part_name: item.part_name || 'Sin nombre',
          part_number: item.part_number || '',
          supplier_url: item.supplier_url || '',
          price_usd: item.price_usd || 0,
          weight_kg: item.weight_kg || 0,
          margin_pct: item.margin_pct !== undefined ? item.margin_pct : 30,
          landed_cost_usd: item.landed_cost_usd || 0,
          final_price_usd: item.final_price_usd || 0,
          final_price_vat_usd: item.final_price_vat_usd || 0,
          sort_order: i
        });
    }
  }

  return getQuotationById(quotation.id);
}

export async function updateQuotation(id, updates) {
  const { error } = await supabase
    .from('quotations')
    .update(updates)
    .eq('id', id);

  if (error) throw error;

  return getQuotationById(id);
}

export async function deleteQuotation(id) {
  // Soft delete: cambiar status a 'vencido' o borrar fisicamente
  const { error } = await supabase
    .from('quotations')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

export async function addQuotationItem({ quotation_id, part_name, part_number, supplier_url, price_usd, weight_kg, margin_pct, landed_cost_usd, final_price_usd, final_price_vat_usd }) {
  const { error } = await supabase
    .from('quotation_items')
    .insert({
      quotation_id: quotation_id,
      part_name: part_name || 'Sin nombre',
      part_number: part_number || '',
      supplier_url: supplier_url || '',
      price_usd: price_usd || 0,
      weight_kg: weight_kg || 0,
      margin_pct: margin_pct !== undefined ? margin_pct : 30,
      landed_cost_usd: landed_cost_usd || 0,
      final_price_usd: final_price_usd || 0,
      final_price_vat_usd: final_price_vat_usd || 0,
      sort_order: 999 // al final
    });

  if (error) throw error;

  return getQuotationById(quotation_id);
}

export async function updateQuotationItem({ item_id, updates }) {
  const { error } = await supabase
    .from('quotation_items')
    .update(updates)
    .eq('id', item_id);

  if (error) throw error;

  return getQuotationById(item_id); // retornar la cotización padre
}

// Exportar CSV helper
export function quotationsToCSV(quotations) {
  if (!quotations || quotations.length === 0) return '';

  const headers = [
    'readable_id', 'fecha', 'cliente', 'telefono', 'veh_marca', 'veh_modelo', 'veh_anio',
    'items_count', 'total_usd', 'total_vat_usd', 'estado', 'pdf_url', 'whatsapp_link'
  ];

  const rows = quotations.map(q => [
    q.readable_id,
    q.created_at ? new Date(q.created_at).toLocaleDateString('es-EC') : '',
    q.customer_name || '',
    q.whatsapp_phone || '',
    q.vehicle_brand || '',
    q.vehicle_model || '',
    q.vehicle_year || '',
    q.quotation_items ? q.quotation_items.length : 0,
    q.total_usd || 0,
    q.total_vat_usd || 0,
    q.status || '',
    q.pdf_url || '',
    q.whatsapp_link || ''
  ]);

  // CSV simple (sin comillas complejas para evitar errores)
  const csvRows = [headers.join(',')].concat(rows.map(r => r.map(v => `"${v}"`).join(',')));
  return csvRows.join('\n');
}

export function CSVToQuotationObjects(csvText) {
  if (!csvText) return [];

  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const quotations = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] || null;
    }
    quotations.push(obj);
  }

  return quotations;
}