import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.ADMIN_PASSWORD = 'test-password';
process.env.OPENROUTER_API_KEY = 'test-key';

const { calculateItem } = await import('../lib/handlers/quotations.js');
const { default: quotationAssist, sanitizeOperations } = await import('../lib/handlers/quotation-assist.js');

test('precio con IVA coincide con la fórmula del cotizador original', () => {
    const result = calculateItem({ price_usd: 145, shipping_usd: 50, margin_pct: 30 });
    assert.equal(result.shipping_usd, 50);
    assert.equal(result.final_price_vat_usd, 278.57);
    assert.equal(result.final_price_usd, 242.23);
});

test('conserva flete, cliente y operaciones posteriores a añadir un ítem', () => {
    const operations = sanitizeOperations([
        { type: 'update_header', fields: { customer_name: 'Pedro Cordero' } },
        { type: 'update_item', index: 0, fields: { part_name: 'Manifold', price_usd: 145, shipping_usd: 50, margin_pct: 30 } },
        { type: 'add_item', fields: { part_name: 'Otra pieza' } },
        { type: 'update_item', index: 1, fields: { warranty: '3 meses' } },
        { type: 'create_order', fields: { part_name: 'No permitido' } }
    ], 1);
    assert.equal(operations.length, 4);
    assert.equal(operations[1].fields.shipping_usd, 50);
    assert.equal(operations[3].index, 1);
});

test('no afirma éxito cuando la respuesta no contiene cambios aplicables', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply:'Cotización actualizada', operations:[{ type:'update_header', fields:{ cliente:'Pedro' } }] }) } }] }) });
    try {
        let status, body;
        const response = { status(code) { status = code; return this; }, json(data) { body = data; return this; } };
        await quotationAssist({ method:'POST', headers:{ 'x-admin-password':'test-password' }, body:{ message:'Cotiza para Pedro', quotation:{ quotation_items:[{}] } } }, response);
        assert.equal(status, 200);
        assert.equal(body.data.operations.length, 0);
        assert.match(body.data.reply, /No pude aplicar cambios/);
    } finally { globalThis.fetch = originalFetch; }
});

test('las operaciones de Aria llenan el borrador y recalculan como el cotizador', () => {
    const html = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
    const calculation = html.slice(html.indexOf('const quotationMoney ='), html.indexOf('async function stageQuotationImage'));
    const application = html.slice(html.indexOf('function applyQuotationOperation('), html.indexOf('function renderQuotationEditor('));
    const context = vm.createContext({ document:{ getElementById:()=>null } });
    vm.runInContext(`${calculation}\n${application}\nglobalThis.apply = applyQuotationOperation; globalThis.recalculate = recalculateQuotation;`, context);
    const quote = { quotation_items:[{ part_name:'', price_usd:0, shipping_usd:0, margin_pct:30 }] };
    const ops = sanitizeOperations([
        { type:'update_header', fields:{ customer_name:'Cliente de prueba', vehicle_brand:'Toyota', vehicle_model:'RAV4', vehicle_year:'1998' } },
        { type:'update_item', index:0, fields:{ part_name:'Manifold salida', price_usd:150, shipping_usd:56, margin_pct:33 } },
        { type:'add_item', fields:{ part_name:'Manifold admisión', price_usd:145, shipping_usd:50, margin_pct:30 } }
    ], 1);
    ops.forEach(operation => context.apply(quote, operation));
    context.recalculate(quote);
    assert.equal(quote.customer_name, 'Cliente de prueba');
    assert.equal(quote.quotation_items.length, 2);
    assert.equal(quote.quotation_items[0].shipping_usd, 56);
    assert.equal(quote.quotation_items[0].final_price_vat_usd, 307.46);
    assert.equal(quote.quotation_items[1].final_price_vat_usd, 278.57);
    assert.equal(quote.total_vat_usd, 586.03);
});

test('el adaptador conserva tres fotos, datos y opciones al reabrir la cotización original', () => {
    const values = Object.fromEntries(['inClient','inWhatsApp','inCar','inAdvisor','inAddress','inDeliveryTime','inObservations','inDiscountPct','inTitle','chkShowTotal','chkDiscount','chkAGN'].map(id => [id,{value:'',checked:false}]));
    values.inClient.parentElement = { parentElement:{ after() {} } };
    const document = { getElementById:id => values[id], createElement:()=>({className:'',innerHTML:''}) };
    const context = vm.createContext({ document, window:{} });
    vm.runInContext("let items=[],editIdx=-1,showTotal=false,discountEnabled=false,discountPercent=0,quoteNumber='',quoteCreatedAt=''; function resetForm(){} function updateAll(){} function render(){} function getData(){return {}}",context);
    vm.runInContext(fs.readFileSync(new URL('../agn-cotizador-erp-bridge.js', import.meta.url),'utf8'),context);
    const quote={customer_name:'Cliente de prueba',vehicle_brand:'Toyota',vehicle_model:'RAV4',vehicle_year:'1998',delivery_time:'9-12 días',editor_state:{advisor:'Pedro',show_total:true,discount_enabled:true,discount_percent:5},quotation_items:[{part_name:'Manifold',price_usd:145,shipping_usd:50,margin_pct:30,photos:['https://example.test/1.jpg','https://example.test/2.jpg','https://example.test/3.jpg'],photo_scale:125}]};
    context.window.agnErpBridge.setQuote(quote);
    const result=context.window.agnErpBridge.getQuote(quote);
    assert.equal(result.customer_name,'Cliente de prueba');
    assert.equal(result.quotation_items[0].shipping_usd,50);
    assert.deepEqual(Array.from(result.quotation_items[0].photos),quote.quotation_items[0].photos);
    assert.equal(result.quotation_items[0].photo_scale,125);
    assert.equal(result.editor_state.discount_percent,5);
    assert.equal(result.editor_state.show_total,true);
});
