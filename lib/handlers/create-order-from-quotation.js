// api/create-order-from-quotation.js
// Convierte cotización → orden (hereda cliente, vehículo, items seleccionados)

import supabase from '../../supabase-client.js';

const authenticateAdmin = async password => {
  if (!password) return false;
  const configuredPassword = process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN;
  if (configuredPassword && password === configuredPassword) return true;
  const { data } = await supabase.from('admin_users').select('username')
    .eq('password_hash', password).eq('is_active', true).maybeSingle();
  return Boolean(data);
};

// VIN from the quotation's saved editor state; do not guess from unrelated text.
export const quotationVinForOrder = quotation => {
  const saved = quotation?.editor_state?.vehicle_vin;
  if (typeof saved === 'string' && saved.trim()) return saved.trim();
  const display = quotation?.editor_state?.vehicle_display;
  return typeof display === 'string' ? (display.match(/(?:VIN|FRAME)\s*[:#-]?\s*([A-HJ-NPR-Z0-9]{17})\b/i)?.[1] || '') : '';
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

    if (!await authenticateAdmin(req.headers['x-admin-password'])) {
      return res.status(401).json({ message: 'No autorizado' });
    }

  try {
    const { quotation_id, selected_items, status } = req.body || {};

    if (!quotation_id) {
      return res.status(400).json({ message: 'quotation_id requerido' });
    }

    // 1. Obtener cotización completa con items
    const { data: quotation, error: qError } = await supabase
      .from('quotations')
      .select(`
        *,
        quotation_items (*)
      `)
      .eq('id', quotation_id)
      .single();

    if (qError) throw qError;
    if (!quotation) return res.status(404).json({ message: 'Cotización no encontrada' });

    // 2. Filtrar items seleccionados (si no vienen, todos)
    let itemsToConvert = quotation.quotation_items || [];
    if (selected_items && Array.isArray(selected_items) && selected_items.length > 0) {
      itemsToConvert = itemsToConvert.filter((_, idx) => selected_items.includes(idx));
    }

    if (itemsToConvert.length === 0) {
      return res.status(400).json({ message: 'Ningún ítem seleccionado para convertir' });
    }

    // 3. Buscar/crear cliente
    let customerId = quotation.customer_id;
    if (!customerId && quotation.whatsapp_phone) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', quotation.whatsapp_phone)
        .maybeSingle();

      if (customer) {
        customerId = customer.id;
      } else {
        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({
            full_name: quotation.customer_name || 'Cliente',
            phone: quotation.whatsapp_phone,
            source: 'quotation'
          })
          .select()
          .single();
        customerId = newCustomer?.id;
      }
    }

    // 4. Preparar items para orden
    const orderItems = itemsToConvert.map((item, idx) => ({
      part_name: item.part_name,
      part_number: item.part_number || '',
      quantity: 1,
      cost_fob: item.price_usd ?? 0,
      fob_cost: item.price_usd ?? 0,
      supplier_freight: item.shipping_usd ?? 0,
      customs_nationalization: 0,
      sale_price: item.final_price_usd || item.price_usd || 0,
      price: item.final_price_usd || item.price_usd || 0,
      price_with_vat: item.final_price_vat_usd || (item.final_price_usd * 1.15) || 0,
      margin_percent: item.margin_pct ?? 30,
      item_status: 'Solicitado',
      vendor_name: item.supplier_url ? 'Proveedor' : '',
      supplier_url: item.supplier_url || '',
      order_date: new Date().toISOString().split('T')[0],
      estimated_arrival: null,
      tracking_number: '',
      image_data: item.image_url || ''
    }));

    // 5. Crear orden
    const orderData = {
      customer_id: customerId,
      part_name: orderItems[0]?.part_name || 'Desde cotización',
      vehicle_brand: quotation.vehicle_brand || 'Marca',
      vehicle_model: quotation.vehicle_model || 'Modelo',
      vehicle_year: quotation.vehicle_year || '',
      vin: quotationVinForOrder(quotation),
      status: status || 'Cotizado', // default: Cotizado
      tracking_number: '',
      estimated_delivery_client: null,
      notes: `Generada desde cotización ${quotation.readable_id || quotation.id}`,
      items_json: orderItems,
      quotation_id: quotation.id  // trazabilidad
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([orderData])
      .select()
      .single();

    if (orderError) throw orderError;

    // 6. Insertar items en order_items (relacional)
    const itemsToInsert = orderItems.map(item => ({
      order_id: order.id,
      part_name: item.part_name,
      part_number: item.part_number,
      quantity: item.quantity,
      fob_cost: item.fob_cost,
      cost_fob: item.cost_fob,
      supplier_freight: item.supplier_freight,
      customs_nationalization: item.customs_nationalization,
      sale_price: item.sale_price,
      price: item.price,
      price_with_vat: item.price_with_vat,
      margin_percent: item.margin_percent,
      item_status: item.item_status,
      vendor_name: item.vendor_name,
      supplier_url: item.supplier_url,
      tracking_number: item.tracking_number,
      order_date: item.order_date,
      estimated_arrival: item.estimated_arrival,
      image_data: item.image_data
    }));

    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(itemsToInsert);

    if (itemsErr) throw itemsErr;

    // 7. Actualizar cotización: status = 'convertido'
    await supabase
      .from('quotations')
      .update({ status: 'convertido' })
      .eq('id', quotation_id);

    return res.status(201).json({
      message: 'Orden creada desde cotización exitosamente',
      order: {
        id: order.id,
        readable_id: order.readable_id,
        status: order.status,
        items_count: orderItems.length,
        quotation_id: quotation_id,
        quotation_readable: quotation.readable_id
      }
    });

  } catch (error) {
    console.error('❌ Error create-order-from-quotation:', error);
    return res.status(500).json({ message: 'Error interno', error: error.message });
  }
}
