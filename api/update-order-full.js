import supabase from '../supabase-client.js';

// Financial calculation utilities
const calculatePriceFromCostAndMargin = (cost, marginPercent) => {
  if (marginPercent >= 100) return 0; // Prevent division by zero or negative
  return cost / (1 - marginPercent / 100);
};

const calculateMarginFromCostAndPrice = (cost, price) => {
  if (cost <= 0) return 0; // Prevent division by zero
  return ((price - cost) / price) * 100;
};

const calculatePriceWithVAT = (price) => {
  // Hardcoded 15% VAT as per requirements
  return price * 1.15;
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });

    const adminPassword = req.headers['x-admin-password'];
    if (!adminPassword) {
        return res.status(401).json({ message: 'No autorizado (debe proporcionar contraseña)' });
    }

    // 1. Validar por env var (más directo)
    const passEnv = process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN;
    let isAuthed = (passEnv && adminPassword === passEnv);

    // 2. Si no hay password en env, aceptar cualquier password para desarrollo
    if (!passEnv && adminPassword) {
        isAuthed = true;
    }

    // 3. Si no pasó por env var, validar por DB
    if (!isAuthed) {
        try {
            const { data: user } = await supabase
                .from('admin_users')
                .select('username')
                .eq('password_hash', adminPassword)
                .eq('is_active', true)
                .maybeSingle();

            if (user) isAuthed = true;
        } catch (e) {
            console.error("Supabase admin auth error:", e);
        }
    }

    if (!isAuthed) {
        return res.status(401).json({ message: 'No autorizado' });
    }

const {
  orderId,
  part_name, supplier_url,
  vin, vehicle_brand, vehicle_model, vehicle_year,
  tracking_number, status,
  alarm,
  costo_fob, margen_markdown, precio_venta,
  comision_vendedor,
  customer_name, customer_phone, customer_ruc, customer_cedula,
  items_json
} = req.body;

    if (!orderId) return res.status(400).json({ message: 'orderId requerido' });

    console.log('Update order request:', { orderId, hasItemsJson: !!items_json });

    try {
        const updateData = {};
        if (part_name !== undefined) updateData.part_name = part_name;
        if (supplier_url !== undefined) updateData.supplier_url = supplier_url;
        if (vin !== undefined) updateData.vin = vin;
        if (vehicle_brand !== undefined) updateData.vehicle_brand = vehicle_brand;
        if (vehicle_model !== undefined) updateData.vehicle_model = vehicle_model;
        if (vehicle_year !== undefined) updateData.vehicle_year = vehicle_year;
        if (tracking_number !== undefined) updateData.tracking_number = tracking_number;
if (status !== undefined) updateData.status = status;
if (alarm !== undefined) updateData.alarm = Boolean(alarm);

if (costo_fob !== undefined) updateData.costo_fob = parseFloat(costo_fob) || 0;
if (margen_markdown !== undefined) updateData.margen_markdown = parseFloat(margen_markdown) || 0;
if (precio_venta !== undefined) updateData.precio_venta = parseFloat(precio_venta) || 0;
if (comision_vendedor !== undefined) updateData.comision_vendedor = parseFloat(comision_vendedor) || 0;

if (items_json !== undefined) updateData.items_json = items_json;

        updateData.updated_at = new Date().toISOString();

        const { error: orderErr } = await supabase
            .from('orders')
            .update(updateData)
            .eq('id', orderId);

        if (orderErr) throw orderErr;

// Update customer data if provided
if (customer_name || customer_phone || customer_ruc || customer_cedula) {
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('customer_id')
      .eq('id', orderId)
      .single();

    if (order && order.customer_id) {
      const customerUpdate = {};
      if (customer_name) customerUpdate.full_name = customer_name;
      if (customer_phone) customerUpdate.phone = customer_phone;
      if (customer_ruc) customerUpdate.ruc = customer_ruc;
      if (customer_cedula) customerUpdate.cedula = customer_cedula;

      if (Object.keys(customerUpdate).length > 0) {
        const { error: custErr } = await supabase
          .from('customers')
          .update(customerUpdate)
          .eq('id', order.customer_id);
        if (custErr) console.error('Error updating customer:', custErr);
      }
    }
  } catch (custError) {
    console.error('Customer update skipped:', custError.message);
  }
}

        // 🟢 Misión: Sincronización Atómica (Fase 5)
        // Guardar cada ítem como una fila real en order_items para reportes y visión de Aria
        if (items_json && Array.isArray(items_json)) {
            try {
	// PostgreSQL reemplaza la lista dentro de una sola transacción mediante RPC.
	const rowsToInsert = items_json.map(it => {
	const parsedFobCost = parseFloat(it.fob_cost) || parseFloat(it.cost_fob) || 0;
	const parsedSupplierFreight = parseFloat(it.supplier_freight) || 0;
	const parsedCustoms = parseFloat(it.customs_nationalization) || 0;
	const parsedLandedCost = parsedFobCost + parsedSupplierFreight + parsedCustoms;
	const parsedSalePrice = parseFloat(it.sale_price) || 0;
	const parsedMargin = it.margin_percent !== undefined && it.margin_percent !== null ? parseFloat(it.margin_percent) : null;

	let finalCostFob = parsedFobCost;
	let finalSalePrice = parsedSalePrice;
	let finalMargin = parsedMargin;

	if (parsedLandedCost > 0 && (parsedSalePrice === 0 || parsedSalePrice === undefined) && parsedMargin === null) {
	finalMargin = 20;
	finalSalePrice = calculatePriceFromCostAndMargin(parsedLandedCost, finalMargin);
	} else if (parsedLandedCost > 0 && parsedSalePrice > 0 && parsedMargin === null) {
	finalMargin = calculateMarginFromCostAndPrice(parsedLandedCost, parsedSalePrice);
	} else if (parsedLandedCost === 0 && parsedSalePrice > 0 && parsedMargin !== null && parsedMargin < 100) {
	finalCostFob = parsedSalePrice * (1 - parsedMargin / 100);
	} else {
	if (finalSalePrice === 0 && parsedLandedCost > 0) {
	finalSalePrice = calculatePriceFromCostAndMargin(parsedLandedCost, finalMargin || 20);
	}
	}

	const priceWithVAT = calculatePriceWithVAT(finalSalePrice);

	return {
	order_id: orderId,
	part_name: it.part_name || 'Sin nombre',
	part_number: it.part_number || '',
	quantity: parseInt(it.quantity) || 1,
	cost_fob: finalCostFob,
	fob_cost: parsedFobCost,
	supplier_freight: parsedSupplierFreight,
	customs_nationalization: parsedCustoms,
	sale_price: finalSalePrice,
	price: finalSalePrice,
	price_with_vat: priceWithVAT,
	margin_percent: finalMargin,
	item_status: it.item_status || 'Solicitado',
	vendor_name: it.vendor_name || '',
	supplier_url: it.supplier_url || '',
	tracking_number: it.tracking_number || '',
	order_date: it.order_date || null,
	estimated_arrival: it.estimated_arrival || null,
	updated_at: new Date().toISOString()
	};
	});

                const { error: itemsErr } = await supabase.rpc('replace_order_items', {
                    p_order_id: orderId,
                    p_items: rowsToInsert
                });
                if (itemsErr) throw itemsErr;
            } catch (itemsError) {
                console.error('Error sincronizando order_items:', itemsError.message);
                return res.status(500).json({
                    message: 'La orden no pudo sincronizar sus ítems',
                    error: itemsError.message
                });
            }
        }

        return res.status(200).json({ message: 'Orden actualizada (Sincronía Atómica OK)' });
    } catch (error) {
        console.error('Error updating order:', error);
        return res.status(500).json({ message: 'Error al actualizar', error: error.message });
    }
}
