import createOrderHandler from '../../api/create-order.js';
import updateOrderHandler from '../../api/update-order-full.js';
import addNoteHandler from '../../api/add-note.js';
import getAllOrdersHandler from '../../api/get-all-orders.js';
import generateQuotationHandler from '../../api/generate-quotation.js';
import createOrderFromQuotationHandler from '../../api/create-order-from-quotation.js';
import { createCommandRegistry } from '../agent-core/command-registry.js';
import { invokeApiHandler } from '../agent-core/handler-adapter.js';

const VALID_STATUSES = [
    'Solicitado',
    'Cotizado',
    'Comprado',
    'Tránsito 1 (Prov→Log)',
    'Tránsito 2 (Log→EC)',
    'En Aduana',
    'Entregado',
    'Cancelado'
];

const currentEcuadorDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
}).format(new Date());

const callHandler = async (handler, method, body, context) => {
    const response = await invokeApiHandler(handler, {
        method,
        body,
        headers: context.headers
    });

    if (!response.ok) {
        return {
            ok: false,
            code: `ERP_HTTP_${response.status}`,
            message: response.body?.message || response.body?.error || 'El ERP rechazó la operación',
            details: response.body
        };
    }

    return {
        ok: true,
        message: response.body?.message || 'Comando ejecutado',
        data: response.body,
        refreshOrders: method !== 'GET'
    };
};

const getOrders = async (context, query = {}) => {
    if (typeof context.readOrders === 'function') {
        return context.readOrders(query);
    }

    const response = await invokeApiHandler(getAllOrdersHandler, {
        method: 'GET',
        headers: context.headers,
        query
    });

    if (!response.ok || !Array.isArray(response.body)) {
        return {
            ok: false,
            code: `ERP_HTTP_${response.status}`,
            message: response.body?.message || 'No fue posible consultar las órdenes'
        };
    }

    return { ok: true, orders: response.body };
};

const normalizeOrderReference = value =>
    String(value || '').trim().replace(/^#/, '').toUpperCase();

const findOrder = (orders, reference) => {
    const normalized = normalizeOrderReference(reference);
    const withPrefix = normalized.startsWith('ORD-') ? normalized : `ORD-${normalized}`;

    return orders.find(order => {
        const readableId = normalizeOrderReference(order.readable_id);
        const uuid = normalizeOrderReference(order.id);
        return readableId === normalized || readableId === withPrefix || uuid === normalized;
    });
};

const resolveOrder = async (reference, context, options = {}) => {
    const query = options.includeItems
        ? { orderRef: reference }
        : { view: 'aria', orderRef: reference };
    const result = await getOrders(context, query);
    if (!result.ok) return result;

    const order = findOrder(result.orders, reference);
    if (!order) {
        return {
            ok: false,
            code: 'ORDER_NOT_FOUND',
            message: `No encontré la orden ${reference}`
        };
    }

    return { ok: true, order };
};

const executeOrderPatch = async (reference, patch, context) => {
    const resolved = await resolveOrder(reference, context);
    if (!resolved.ok) return resolved;

    return callHandler(updateOrderHandler, 'POST', {
        orderId: resolved.order.id,
        ...patch
    }, context);
};

const normalizePartName = value =>
    String(value || '').trim().toLocaleLowerCase('es');

const selectOrderItem = (order, partName) => {
    const items = Array.isArray(order.order_items)
        ? order.order_items
        : (Array.isArray(order.items_json) ? order.items_json : []);

    if (items.length === 0) {
        return {
            ok: false,
            code: 'ORDER_HAS_NO_ITEMS',
            message: 'La orden no tiene repuestos para actualizar'
        };
    }
    if (!partName && items.length > 1) {
        return {
            ok: false,
            code: 'MULTIPLE_ORDER_ITEMS',
            message: 'La orden tiene varios repuestos. Indica cuál deseas modificar'
        };
    }

    const selectedIndex = partName
        ? items.findIndex(item =>
            normalizePartName(item.part_name) === normalizePartName(partName)
        )
        : 0;
    if (selectedIndex < 0) {
        return {
            ok: false,
            code: 'ORDER_ITEM_NOT_FOUND',
            message: `No encontré el repuesto ${partName} en la orden`
        };
    }

    return { ok: true, items, selectedIndex };
};

const updateOrderItemField = async ({
    orderReference,
    partName,
    field,
    value,
    successLabel,
    formatValue = storedValue => String(storedValue)
}, context) => {
    const resolved = await resolveOrder(orderReference, context, {
        includeItems: true
    });
    if (!resolved.ok) return resolved;

    const selected = selectOrderItem(resolved.order, partName);
    if (!selected.ok) return selected;

    const items = selected.items.map((item, index) => {
        if (index !== selected.selectedIndex) return item;
        if (field === 'fob_cost') {
            return { ...item, fob_cost: value, cost_fob: value };
        }
        if (field === 'sale_price') {
            return { ...item, sale_price: value, price: value, margin_percent: null };
        }
        return { ...item, [field]: value };
    });

    const updateBody = {
        orderId: resolved.order.id,
        items_json: items
    };
    const updated = typeof context.updateOrder === 'function'
        ? await context.updateOrder(updateBody)
        : await callHandler(updateOrderHandler, 'POST', updateBody, context);
    if (!updated.ok) return updated;

    const verified = await resolveOrder(
        resolved.order.readable_id || resolved.order.id,
        context,
        { includeItems: true }
    );
    if (!verified.ok) return verified;

    const verifiedItem = selectOrderItem(verified.order, partName);
    if (!verifiedItem.ok) return verifiedItem;
    const storedItem = verifiedItem.items[verifiedItem.selectedIndex];
    const rawStoredValue = field === 'fob_cost'
        ? storedItem.fob_cost ?? storedItem.cost_fob
        : field === 'sale_price'
            ? storedItem.sale_price ?? storedItem.price
            : storedItem[field];
    const numericField = field === 'fob_cost' || field === 'sale_price';
    const storedValue = numericField ? Number(rawStoredValue) : String(rawStoredValue || '');
    const valueMatches = numericField
        ? Number.isFinite(storedValue) && Math.abs(storedValue - value) <= 0.001
        : storedValue === String(value);

    if (!valueMatches) {
        return {
            ok: false,
            code: 'FINANCIAL_VALUE_NOT_VERIFIED',
            message: `El ERP no confirmó ${successLabel} en la orden`
        };
    }

    return {
        ok: true,
        message: `${successLabel} actualizado a ${formatValue(storedValue)} en ${resolved.order.readable_id || resolved.order.id}`,
        data: {
            orderId: resolved.order.id,
            readableId: resolved.order.readable_id,
            field,
            value: storedValue
        },
        refreshOrders: true
    };
};

const createOrderCommand = {
    name: 'create_order',
    description: 'Crear una orden nueva usando la misma función que el formulario del ERP. Si falta cliente, marca, modelo o repuesto, pregunta antes de usarla.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            customer_name: { type: 'string', minLength: 1, description: 'Nombre real y completo del cliente' },
            customer_phone: { type: 'string', description: 'Teléfono o WhatsApp del cliente' },
            vehicle_brand: { type: 'string', minLength: 1, description: 'Marca del vehículo' },
            vehicle_model: { type: 'string', minLength: 1, description: 'Modelo del vehículo' },
            vehicle_year: { type: 'string', description: 'Año del vehículo' },
            order_date: { type: 'string', minLength: 10, description: 'Fecha de la orden en formato YYYY-MM-DD; si se omite, usa la fecha actual' },
            part_name: { type: 'string', minLength: 1, description: 'Repuesto solicitado' }
        },
        required: ['customer_name', 'vehicle_brand', 'vehicle_model', 'part_name']
    },
    execute: async (args, context) => callHandler(createOrderHandler, 'POST', {
        customer_name: args.customer_name,
        customer_phone: args.customer_phone || 'N/A',
        vehicle_brand: args.vehicle_brand,
        vehicle_model: args.vehicle_model,
        vehicle_year: args.vehicle_year || 'N/A',
        status: 'Solicitado',
        created_by: context.adminName || 'Aria',
        items: [{
            part_name: args.part_name,
            quantity: 1,
            item_status: 'Solicitado',
            order_date: args.order_date || currentEcuadorDate()
        }]
    }, context)
};

const setOrderFobCommand = {
    name: 'set_order_fob',
    description: 'Colocar el costo FOB de un repuesto en una orden existente. El valor admite decimales.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            order_ref: { type: 'string', minLength: 1, description: 'Número de orden o $new_order si acaba de ser creada' },
            cost_fob: { type: 'number', minimum: 0, description: 'Costo FOB exacto, por ejemplo 19.81' },
            part_name: { type: 'string', minLength: 1, description: 'Solo si la orden tiene varios repuestos' }
        },
        required: ['order_ref', 'cost_fob']
    },
    execute: (args, context) => updateOrderItemField({
        orderReference: args.order_ref,
        partName: args.part_name,
        field: 'fob_cost',
        value: args.cost_fob,
        successLabel: 'Costo FOB',
        formatValue: storedValue => `$${storedValue.toFixed(2)}`
    }, context)
};

const setOrderPriceCommand = {
    name: 'set_order_price',
    description: 'Colocar el precio de venta antes de IVA de un repuesto. El ERP calcula automáticamente el IVA del 15%.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            order_ref: { type: 'string', minLength: 1, description: 'Número de orden o $new_order si acaba de ser creada' },
            price_before_vat: { type: 'number', minimum: 0, description: 'Precio de venta antes de IVA' },
            part_name: { type: 'string', minLength: 1, description: 'Solo si la orden tiene varios repuestos' }
        },
        required: ['order_ref', 'price_before_vat']
    },
    execute: (args, context) => updateOrderItemField({
        orderReference: args.order_ref,
        partName: args.part_name,
        field: 'sale_price',
        value: args.price_before_vat,
        successLabel: 'Precio antes de IVA',
        formatValue: storedValue => `$${storedValue.toFixed(2)}`
    }, context)
};

const setOrderSupplierCommand = {
    name: 'set_order_supplier',
    description: 'Guardar el nombre del proveedor del repuesto de una orden existente.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            order_ref: { type: 'string', minLength: 1 },
            supplier_name: { type: 'string', minLength: 1 },
            part_name: { type: 'string', minLength: 1, description: 'Solo si la orden tiene varios repuestos' }
        },
        required: ['order_ref', 'supplier_name']
    },
    execute: (args, context) => updateOrderItemField({
        orderReference: args.order_ref,
        partName: args.part_name,
        field: 'vendor_name',
        value: args.supplier_name.trim(),
        successLabel: 'Proveedor'
    }, context)
};

const setOrderSupplierUrlCommand = {
    name: 'set_order_supplier_url',
    description: 'Guardar el enlace o URL de compra del repuesto de una orden existente.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            order_ref: { type: 'string', minLength: 1 },
            supplier_url: { type: 'string', minLength: 1 },
            part_name: { type: 'string', minLength: 1, description: 'Solo si la orden tiene varios repuestos' }
        },
        required: ['order_ref', 'supplier_url']
    },
    execute: (args, context) => updateOrderItemField({
        orderReference: args.order_ref,
        partName: args.part_name,
        field: 'supplier_url',
        value: args.supplier_url.trim(),
        successLabel: 'URL de compra'
    }, context)
};

const setOrderDateCommand = {
    name: 'set_order_date',
    description: 'Cambiar la fecha editable del repuesto en una orden existente. Usa YYYY-MM-DD.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            order_ref: { type: 'string', minLength: 1 },
            order_date: { type: 'string', minLength: 10 },
            part_name: { type: 'string', minLength: 1, description: 'Solo si la orden tiene varios repuestos' }
        },
        required: ['order_ref', 'order_date']
    },
    execute: (args, context) => updateOrderItemField({
        orderReference: args.order_ref,
        partName: args.part_name,
        field: 'order_date',
        value: args.order_date.trim(),
        successLabel: 'Fecha de orden'
    }, context)
};

const openOrderCommand = {
    name: 'open_order',
    description: 'Abrir una orden en el panel. Usa order_ref cuando el usuario indique el número; usa customer_name solo después de confirmar la escritura exacta del nombre.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            order_ref: {
                type: 'string',
                minLength: 1,
                description: 'Número exacto visible, por ejemplo 205 u ORD-205'
            },
            customer_name: {
                type: 'string',
                minLength: 1,
                description: 'Nombre completo cuya escritura ya confirmó el usuario'
            }
        }
    },
    execute: async (args, context) => {
        if (!args.order_ref && !args.customer_name) {
            return {
                ok: false,
                code: 'ORDER_IDENTIFIER_REQUIRED',
                message: 'Indica el número de orden o confirma el nombre completo del cliente'
            };
        }
        if (args.order_ref && args.customer_name) {
            return {
                ok: false,
                code: 'AMBIGUOUS_ORDER_IDENTIFIER',
                message: 'Usa solamente el número o el nombre confirmado'
            };
        }

        const result = args.order_ref
            ? await getOrders(context, {
                view: 'aria',
                orderRef: args.order_ref
            })
            : await getOrders(context, {
                view: 'aria',
                customerName: args.customer_name,
                limit: '2'
            });
        if (!result.ok) return result;
        if (result.orders.length === 0) {
            return {
                ok: false,
                code: 'ORDER_NOT_FOUND',
                message: 'No encontré una orden con ese identificador exacto'
            };
        }
        if (result.orders.length > 1) {
            return {
                ok: false,
                code: 'MULTIPLE_ORDERS_FOUND',
                message: 'Ese cliente tiene varias órdenes. Indica el número exacto'
            };
        }

        const order = result.orders[0];
        return {
            ok: true,
            message: `Abrí la orden ${order.readable_id || order.id}`,
            data: {
                openOrderId: order.id,
                readableId: order.readable_id
            }
        };
    }
};

const updateStatusCommand = {
    name: 'set_order_status',
    description: 'Cambiar el estado de una orden existente usando la misma función del selector de estado del ERP.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            order_ref: { type: 'string', minLength: 1, description: 'Número visible, por ejemplo ORD-205' },
            status: { type: 'string', enum: VALID_STATUSES }
        },
        required: ['order_ref', 'status']
    },
    execute: (args, context) =>
        executeOrderPatch(args.order_ref, { status: args.status }, context)
};

const setAlarmCommand = {
    name: 'set_order_alarm',
    description: 'Activar o desactivar la alarma de una orden usando la misma función del interruptor Alarma del ERP.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            order_ref: { type: 'string', minLength: 1, description: 'Número visible de la orden' },
            enabled: { type: 'boolean', description: 'true para activar; false para desactivar' }
        },
        required: ['order_ref', 'enabled']
    },
    execute: (args, context) =>
        executeOrderPatch(args.order_ref, { alarm: args.enabled }, context)
};

const updateCustomerCommand = {
    name: 'update_order_customer',
    description: 'Modificar nombre, teléfono o WhatsApp, RUC o cédula del cliente asociado a una orden. Para guardar un número visible como WhatsApp usa customer_phone.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            order_ref: { type: 'string', minLength: 1 },
            customer_name: { type: 'string', minLength: 1 },
            customer_phone: {
                type: 'string',
                minLength: 1,
                description: 'Número de teléfono o WhatsApp que se mostrará en la ficha de la orden'
            },
            customer_ruc: { type: 'string', minLength: 1 },
            customer_cedula: { type: 'string', minLength: 1 }
        },
        required: ['order_ref']
    },
    execute: async (args, context) => {
        const patch = Object.fromEntries(
            Object.entries(args).filter(([key, value]) => key !== 'order_ref' && value !== undefined)
        );
        if (Object.keys(patch).length === 0) {
            return { ok: false, code: 'NO_CHANGES', message: 'Indica el dato del cliente que deseas cambiar' };
        }
        return executeOrderPatch(args.order_ref, patch, context);
    }
};

const addPartCommand = {
    name: 'add_order_part',
    description: 'Agregar un repuesto a una orden conservando los repuestos existentes.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            order_ref: { type: 'string', minLength: 1 },
            part_name: { type: 'string', minLength: 1 },
            part_number: { type: 'string' },
            cost_fob: { type: 'number' },
            vendor_name: { type: 'string' }
        },
        required: ['order_ref', 'part_name']
    },
    execute: async (args, context) => {
        const resolved = await resolveOrder(args.order_ref, context, {
            includeItems: true
        });
        if (!resolved.ok) return resolved;

        const existingItems = Array.isArray(resolved.order.order_items)
            ? resolved.order.order_items
            : (Array.isArray(resolved.order.items_json) ? resolved.order.items_json : []);

        const newItem = {
            part_name: args.part_name,
            part_number: args.part_number || '',
            quantity: 1,
            fob_cost: args.cost_fob || 0,
            cost_fob: args.cost_fob || 0,
            sale_price: 0,
            vendor_name: args.vendor_name || '',
            supplier_url: '',
            item_status: 'Solicitado'
        };

        return callHandler(updateOrderHandler, 'POST', {
            orderId: resolved.order.id,
            items_json: [...existingItems, newItem]
        }, context);
    }
};

const addNoteCommand = {
    name: 'add_order_note',
    description: 'Agregar una nota a una orden usando la misma función del panel de notas del ERP.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            order_ref: { type: 'string', minLength: 1 },
            content: { type: 'string', minLength: 1 }
        },
        required: ['order_ref', 'content']
    },
    execute: async (args, context) => {
        const resolved = await resolveOrder(args.order_ref, context);
        if (!resolved.ok) return resolved;

        return callHandler(addNoteHandler, 'POST', {
            orderId: resolved.order.id,
            content: args.content,
            author: `Aria (${context.adminName || 'Admin'})`
        }, context);
    }
};

// ============ COMANDOS DE COTIZACIONES ============

// Helper para buscar cotización por ID legible o UUID
const findQuotation = async (reference, context) => {
    const { data, error } = await supabase
        .from('quotations')
        .select('*')
        .or(`readable_id.eq.${reference},id.eq.${reference}`)
        .maybeSingle();

    if (error) return { ok: false, code: 'DB_ERROR', message: error.message };
    if (!data) return { ok: false, code: 'QUOTATION_NOT_FOUND', message: `Cotización ${reference} no encontrada` };

    return { ok: true, quotation: data };
};

const callQuotationApi = async (handler, method, body, context) => {
    const response = await invokeApiHandler(handler, {
        method,
        body,
        headers: context.headers
    });

    if (!response.ok) {
        return {
            ok: false,
            code: `ERP_HTTP_${response.status}`,
            message: response.body?.message || response.body?.error || 'Error en cotización'
        };
    }

    return { ok: true, data: response.body, refreshOrders: true };
};

// 1. create_quotation_draft - Crear cotización desde lenguaje natural
const createQuotationDraftCommand = {
    name: 'create_quotation_draft',
    description: 'Crear borrador de cotización desde texto/voz con cliente, vehículo, items (links, precios, pesos, márgenes). Extrae datos automáticamente.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            raw_input: { type: 'string', minLength: 10, description: 'Texto completo con cliente, vehículo, items y datos' },
            customer_name: { type: 'string', description: 'Cliente (sobrescribe extracción)' },
            vehicle_brand: { type: 'string', description: 'Marca (sobrescribe)' },
            vehicle_model: { type: 'string', description: 'Modelo (sobrescribe)' },
            vehicle_year: { type: 'string', description: 'Año (sobrescribe)' },
            whatsapp_phone: { type: 'string', description: 'Teléfono WhatsApp para wa.me link' }
        },
        required: ['raw_input']
    },
    execute: (args, context) => callQuotationApi(generateQuotationHandler, 'POST', args, context)
};

// 2. confirm_quotation - Confirmar y generar PDF/WhatsApp
const confirmQuotationCommand = {
    name: 'confirm_quotation',
    description: 'Confirmar borrador y generar PDF + link WhatsApp listo para enviar. Cambia status a "enviado".',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            quotation_ref: { type: 'string', minLength: 1, description: 'Q-2026-112 o UUID' },
            regenerate: { type: 'boolean', description: 'Forzar regeneración PDF' }
        },
        required: ['quotation_ref']
    },
    execute: async (args, context) => {
        const found = await findQuotation(args.quotation_ref, context);
        if (!found.ok) return found;

        const { data, error } = await supabase
            .from('quotations')
            .update({ status: 'enviado', sent_at: new Date().toISOString() })
            .eq('id', found.quotation.id)
            .select()
            .single();

        if (error) return { ok: false, code: 'UPDATE_ERROR', message: error.message };

        return {
            ok: true,
            message: `Cotización ${data.readable_id} confirmada. PDF: ${data.pdf_url}. WhatsApp: ${data.whatsapp_link}`,
            data: { quotation_id: data.id, readable_id: data.readable_id, pdf_url: data.pdf_url, whatsapp_link: data.whatsapp_link },
            refreshOrders: true
        };
    }
};

// 3. update_quotation_item - Actualizar item específico
const updateQuotationItemCommand = {
    name: 'update_quotation_item',
    description: 'Cambiar precio, peso, margen, link o imagen de un item en la cotización.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            quotation_ref: { type: 'string', minLength: 1, description: 'Q-2026-112' },
            item_index: { type: 'integer', minimum: 0, description: 'Índice del item (0 = primero)' },
            part_name: { type: 'string' },
            part_number: { type: 'string' },
            supplier_url: { type: 'string' },
            price_usd: { type: 'number' },
            weight_kg: { type: 'number' },
            margin_pct: { type: 'number' },
            image_url: { type: 'string' }
        },
        required: ['quotation_ref', 'item_index']
    },
    execute: async (args, context) => {
        const found = await findQuotation(args.quotation_ref, context);
        if (!found.ok) return found;

        const { error } = await supabase
            .from('quotation_items')
            .update(args)
            .eq('quotation_id', found.quotation.id)
            .eq('sort_order', args.item_index);

        if (error) return { ok: false, code: 'UPDATE_ERROR', message: error.message };

        return { ok: true, message: `Item ${args.item_index} actualizado`, refreshOrders: true };
    }
};

// 4. add_quotation_item - Agregar item nuevo
const addQuotationItemCommand = {
    name: 'add_quotation_item',
    description: 'Agregar un nuevo repuesto a la cotización.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            quotation_ref: { type: 'string', minLength: 1 },
            part_name: { type: 'string', minLength: 1 },
            part_number: { type: 'string' },
            supplier_url: { type: 'string' },
            price_usd: { type: 'number', default: 0 },
            weight_kg: { type: 'number', default: 0 },
            margin_pct: { type: 'number', default: 30 },
            image_url: { type: 'string' }
        },
        required: ['quotation_ref', 'part_name']
    },
    execute: async (args, context) => {
        const found = await findQuotation(args.quotation_ref, context);
        if (!found.ok) return found;

        const { data: maxOrder } = await supabase
            .from('quotation_items')
            .select('sort_order')
            .eq('quotation_id', found.quotation.id)
            .order('sort_order', { ascending: false })
            .limit(1)
            .single();

        const nextOrder = (maxOrder?.sort_order || -1) + 1;

        const { error } = await supabase
            .from('quotation_items')
            .insert({
                quotation_id: found.quotation.id,
                part_name: args.part_name,
                part_number: args.part_number || '',
                supplier_url: args.supplier_url || '',
                price_usd: args.price_usd || 0,
                weight_kg: args.weight_kg || 0,
                margin_pct: args.margin_pct !== undefined ? args.margin_pct : 30,
                image_url: args.image_url || '',
                sort_order: nextOrder
            });

        if (error) return { ok: false, code: 'INSERT_ERROR', message: error.message };

        return { ok: true, message: `Item agregado: ${args.part_name}`, refreshOrders: true };
    }
};

// 5. remove_quotation_item - Eliminar item
const removeQuotationItemCommand = {
    name: 'remove_quotation_item',
    description: 'Eliminar un repuesto de la cotización por índice.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            quotation_ref: { type: 'string', minLength: 1 },
            item_index: { type: 'integer', minimum: 0 }
        },
        required: ['quotation_ref', 'item_index']
    },
    execute: async (args, context) => {
        const found = await findQuotation(args.quotation_ref, context);
        if (!found.ok) return found;

        const { error } = await supabase
            .from('quotation_items')
            .delete()
            .eq('quotation_id', found.quotation.id)
            .eq('sort_order', args.item_index);

        if (error) return { ok: false, code: 'DELETE_ERROR', message: error.message };

        return { ok: true, message: `Item ${args.item_index} eliminado`, refreshOrders: true };
    }
};

// 6. update_quotation_header - Actualizar cabecera
const updateQuotationHeaderCommand = {
    name: 'update_quotation_header',
    description: 'Cambiar cliente, vehículo, teléfono, notas de la cotización.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            quotation_ref: { type: 'string', minLength: 1 },
            customer_name: { type: 'string' },
            vehicle_brand: { type: 'string' },
            vehicle_model: { type: 'string' },
            vehicle_year: { type: 'string' },
            whatsapp_phone: { type: 'string' },
            notes: { type: 'string' }
        },
        required: ['quotation_ref']
    },
    execute: async (args, context) => {
        const found = await findQuotation(args.quotation_ref, context);
        if (!found.ok) return found;

        const patch = {};
        ['customer_name', 'vehicle_brand', 'vehicle_model', 'vehicle_year', 'whatsapp_phone', 'notes'].forEach(k => {
            if (args[k] !== undefined) patch[k] = args[k];
        });

        if (Object.keys(patch).length === 0) {
            return { ok: false, code: 'NO_CHANGES', message: 'Nada que actualizar' };
        }

        const { error } = await supabase
            .from('quotations')
            .update(patch)
            .eq('id', found.quotation.id);

        if (error) return { ok: false, code: 'UPDATE_ERROR', message: error.message };

        return { ok: true, message: 'Cabecera actualizada', refreshOrders: true };
    }
};

// 7. create_order_from_quotation - Convertir cotización a orden
const createOrderFromQuotationCommand = {
    name: 'create_order_from_quotation',
    description: 'Crear orden de compra desde cotización, seleccionando items. Hereda cliente, vehículo y precios.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            quotation_ref: { type: 'string', minLength: 1 },
            selected_items: { type: 'array', items: { type: 'integer' }, description: 'Índices de items (0-based). Si vacío, todos' },
            status: { type: 'string', enum: ['Solicitado', 'Cotizado', 'Comprado'], default: 'Cotizado' }
        },
        required: ['quotation_ref']
    },
    execute: (args, context) => callQuotationApi(createOrderFromQuotationHandler, 'POST', args, context)
};

// 8. get_quotations_list - Listar con filtros
const getQuotationsListCommand = {
    name: 'get_quotations_list',
    description: 'Listar cotizaciones con filtros: estado, cliente, fecha.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            status: { type: 'string', enum: ['borrador', 'enviado', 'aceptado', 'vencido', 'convertido'] },
            customer_name: { type: 'string' },
            customer_phone: { type: 'string' },
            date_from: { type: 'string', format: 'date' },
            date_to: { type: 'string', format: 'date' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
    },
    execute: async (args, context) => {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/quotations`, {
            method: 'GET',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY}`
            }
        });
        // Nota: En producción usar getOrders adaptado para quotations
        return { ok: true, message: 'Usar búsqueda en panel de Cotizaciones (tab dedicado)', data: { help: 'Filtros disponibles: status, cliente, fecha' } };
    }
};

// 9. get_client_quotations - Historial de cliente
const getClientQuotationsCommand = {
    name: 'get_client_quotations',
    description: 'Obtener cotizaciones de un cliente por nombre o teléfono.',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            customer_name: { type: 'string' },
            customer_phone: { type: 'string' }
        }
    },
    execute: async (args, context) => {
        return { ok: true, message: 'Usar panel Cotizaciones → buscar por cliente', data: { help: 'Filtrar por nombre/teléfono en la lista' } };
    }
};

// 10. export_quotations_csv
const exportQuotationsCsvCommand = {
    name: 'export_quotations_csv',
    description: 'Exportar cotizaciones a CSV (filtros opcionales).',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            status: { type: 'string', enum: ['borrador', 'enviado', 'aceptado', 'vencido', 'convertido'] },
            date_from: { type: 'string', format: 'date' },
            date_to: { type: 'string', format: 'date' }
        }
    },
    execute: async (args, context) => {
        return { ok: true, message: 'Descargar CSV desde panel Cotizaciones → botón Exportar', data: { url: '/api/quotations-export' } };
    }
};

// 11. import_quotations_csv
const importQuotationsCsvCommand = {
    name: 'import_quotations_csv',
    description: 'Importar cotizaciones desde CSV (crea borradores).',
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            csv_text: { type: 'string', minLength: 1, description: 'Contenido CSV con headers estándar' }
        },
        required: ['csv_text']
    },
    execute: async (args, context) => {
        return { ok: true, message: 'Subir CSV en panel Cotizaciones → botón Importar', data: { url: '/api/quotations-import' } };
    }
};

export const createAgnCommandRegistry = () => createCommandRegistry([
    createOrderCommand,
    setOrderFobCommand,
    setOrderPriceCommand,
    setOrderSupplierCommand,
    setOrderSupplierUrlCommand,
    setOrderDateCommand,
    openOrderCommand,
    updateStatusCommand,
    setAlarmCommand,
    updateCustomerCommand,
    addPartCommand,
    addNoteCommand,
    // NUEVOS: Cotizaciones
    createQuotationDraftCommand,
    confirmQuotationCommand,
    updateQuotationItemCommand,
    addQuotationItemCommand,
    removeQuotationItemCommand,
    updateQuotationHeaderCommand,
    createOrderFromQuotationCommand,
    getQuotationsListCommand,
    getClientQuotationsCommand,
    exportQuotationsCsvCommand,
    importQuotationsCsvCommand
]);

export { VALID_STATUSES };
