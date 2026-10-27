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
const { default: quotationImage, isPublicIPv4, fetchPublicImage } = await import('../lib/handlers/quotation-image.js');
const { createQuotationImageUploadHandler } = await import('../lib/handlers/quotation-image-upload.js');

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
    vm.runInContext("let items=[],editIdx=-1,nextItemNumber=1,showTotal=false,discountEnabled=false,discountPercent=0,quoteNumber='',quoteCreatedAt=''; function resetForm(){} function updateAll(){} function render(){} function getData(){return {}}",context);
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

test('el lector de imágenes rechaza redes internas y requiere autenticación', async () => {
    for (const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.1.1','192.168.1.1','100.64.0.1','224.0.0.1','::1']) {
        assert.equal(isPublicIPv4(ip), false, ip);
    }
    assert.equal(isPublicIPv4('8.8.8.8'), true);
    await assert.rejects(fetchPublicImage('http://127.0.0.1/image.jpg'), /Destino no permitido/);
    await assert.rejects(fetchPublicImage('http://user:pass@example.com/image.jpg'), /Enlace no permitido/);
    let status;
    const response = { status(code) { status=code;return this; }, json() { return this; } };
    await quotationImage({method:'POST',headers:{},body:{url:'https://example.com/image.jpg'}},response);
    assert.equal(status,401);
});

test('no descarga la tabla si no se puede incorporar una foto', async () => {
    const values = {inClient:{parentElement:{parentElement:{after(){}}}}};
    const photo = {src:'https://example.test/photo.png',currentSrc:'https://example.test/photo.png',getAttribute(){return this.src;}};
    const document = {getElementById:id=>values[id],createElement:()=>({}),querySelectorAll:()=>[photo]};
    let exported = false, warning = '';
    const window = {parent:{fetchQuotationPhotoBlob:async()=>{throw new Error('Foto no disponible');}},downloadSheet:async()=>{exported=true;},downloadCard:async()=>{}};
    const context = vm.createContext({document,window,alert:text=>{warning=text;}});
    vm.runInContext(fs.readFileSync(new URL('../agn-cotizador-erp-bridge.js',import.meta.url),'utf8'),context);
    await context.window.downloadSheet();
    assert.equal(exported,false);
    assert.match(warning,/Foto no disponible/);
    assert.equal(photo.src,'https://example.test/photo.png');
});

test('la tabla incorpora la foto remota antes de generar el PNG y luego restaura la vista', async () => {
    const values = {inClient:{parentElement:{parentElement:{after(){}}}}};
    const photo = {src:'https://example.test/photo.png',currentSrc:'https://example.test/photo.png',getAttribute(){return this.src;},async decode(){}};
    const document = {getElementById:id=>values[id],createElement:()=>({}),querySelectorAll:()=>[photo]};
    let exportedSource = '';
    const window = {parent:{fetchQuotationPhotoBlob:async()=>({})},downloadSheet:async()=>{exportedSource=photo.src;},downloadCard:async()=>{}};
    class FakeReader { readAsDataURL() { this.result='data:image/png;base64,TEST'; this.onload(); } }
    const context = vm.createContext({document,window,FileReader:FakeReader,alert:()=>{throw new Error('Unexpected error');}});
    vm.runInContext(fs.readFileSync(new URL('../agn-cotizador-erp-bridge.js',import.meta.url),'utf8'),context);
    await context.window.downloadSheet();
    assert.equal(exportedSource,'data:image/png;base64,TEST');
    assert.equal(photo.src,'https://example.test/photo.png');
});

test('guardar envía el borrador y muestra el identificador confirmado', async () => {
    const html = fs.readFileSync(new URL('../admin.html', import.meta.url),'utf8');
    const saveCode = html.slice(html.indexOf('async function saveQuotationDraft('),html.indexOf('async function runQuotationAria('));
    const button = {disabled:false,textContent:'Guardar en ERP'};
    const progress = [];
    let sent;
    const context = vm.createContext({
        document:{getElementById:()=>button}, pendingImages:[], quotationNumber:Number,
        setQuotationSaveStatus:(text,type)=>progress.push({text,type}), showToast:()=>{}, recalculateQuotation:()=>{},
        quotationHistory:()=>[], quotationSessionKey:q=>q.id, API:'', adminPass:'test',
        sessionStorage:{removeItem(){},setItem(){}}, STORAGE_CONFIG:{supabaseUrl:'https://example.test'},
        fetchWithTimeout:async (_url,opts)=>{sent=JSON.parse(opts.body);return {ok:true,json:async()=>({data:{id:'quote-1',readable_id:'Q-2026-001',quotation_items:[]}})};},
        loadQuotations:async()=>{},renderQuotationEditor:()=>{}, selectedQuotation:null,
    });
    vm.runInContext(`${saveCode}\nglobalThis.save=saveQuotationDraft;`,context);
    await context.save({id:'draft-1',quotation_items:[{part_name:'Manifold',price_usd:145,shipping_usd:50,margin_pct:30}],editor_state:{}});
    assert.equal(sent.quotation.id,null);
    assert.equal(sent.items[0].shipping_usd,50);
    assert.equal(progress.at(-1).text,'Cotización Q-2026-001 guardada en el ERP');
    assert.equal(button.disabled,false);
    assert.equal(button.textContent,'Guardar en ERP');
});

test('si falla una imagen, guardar muestra el error y no envía la cotización', async () => {
    const html = fs.readFileSync(new URL('../admin.html', import.meta.url),'utf8');
    const saveCode = html.slice(html.indexOf('async function saveQuotationDraft('),html.indexOf('async function runQuotationAria('));
    const button = {disabled:false,textContent:'Guardar en ERP'};
    const progress = [];
    let sent = false;
    const context = vm.createContext({
        document:{getElementById:()=>button}, pendingImages:[], quotationNumber:Number,
        setQuotationSaveStatus:(text,type)=>progress.push({text,type}), showToast:()=>{}, recalculateQuotation:()=>{},
        STORAGE_CONFIG:{supabaseUrl:'https://example.test'}, URL, location:{href:'https://erp.test/admin.html',origin:'https://erp.test'},
        fetchQuotationPhotoBlob:async()=>{throw new Error('Imagen no disponible');},
        fetchWithTimeout:async()=>{sent=true;},
    });
    vm.runInContext(`${saveCode}\nglobalThis.save=saveQuotationDraft;`,context);
    await context.save({id:'draft-1',quotation_items:[{part_name:'Manifold',margin_pct:30,photos:['https://example.test/photo.jpg']}]});
    assert.equal(sent,false);
    assert.match(progress.at(-1).text,/No se pudo preparar una imagen del ítem 1/);
    assert.equal(progress.at(-1).type,'error');
    assert.equal(button.disabled,false);
});


test('cada repuesto conserva su número, enlace y fotos al moverlo y volver a abrirlo', () => {
    const values = Object.fromEntries(['inClient','inWhatsApp','inCar','inAdvisor','inAddress','inDeliveryTime','inObservations','inDiscountPct','inTitle','chkShowTotal','chkDiscount','chkAGN'].map(id => [id,{value:'',checked:false}]));
    values.inClient.parentElement = { parentElement:{ after() {} } };
    const document = { getElementById:id => values[id], createElement:()=>({}) };
    const context = vm.createContext({ document, window:{} });
    vm.runInContext("let items=[],editIdx=-1,nextItemNumber=1,showTotal=false,discountEnabled=false,discountPercent=0,quoteNumber='',quoteCreatedAt=''; function resetForm(){} function updateAll(){} function render(){} function getData(){return {}}",context);
    vm.runInContext(fs.readFileSync(new URL('../agn-cotizador-erp-bridge.js', import.meta.url),'utf8'),context);
    const quote={editor_state:{next_item_number:4},quotation_items:[
        {item_number:1,part_name:'A',part_number:'A-1',supplier_url:'https://example.test/a',photos:['https://example.test/a1.jpg','https://example.test/a2.jpg']},
        {item_number:3,part_name:'B',part_number:'B-3',supplier_url:'https://example.test/b',photos:['https://example.test/b.jpg']}
    ]};
    context.window.agnErpBridge.setQuote(quote);
    vm.runInContext('items.reverse(); [items[1].img,items[1].img2]=[items[1].img2,items[1].img]',context);
    const changed=context.window.agnErpBridge.getQuote(quote);
    assert.deepEqual(Array.from(changed.quotation_items, x => [x.item_number,x.part_name,x.part_number,x.supplier_url]),[[3,'B','B-3','https://example.test/b'],[1,'A','A-1','https://example.test/a']]);
    assert.deepEqual(Array.from(changed.quotation_items[1].photos),['https://example.test/a2.jpg','https://example.test/a1.jpg']);
    context.window.agnErpBridge.setQuote(changed);
    vm.runInContext('items.splice(0,1)',context);
    const reopened=context.window.agnErpBridge.getQuote(changed);
    assert.equal(reopened.quotation_items[0].item_number,1);
    assert.equal(reopened.quotation_items[0].part_number,'A-1');
    assert.equal(reopened.editor_state.next_item_number,4);
});

test('Aria identifica el repuesto por número fijo después de cambiar su posición', () => {
    const html=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');
    const calculation=html.slice(html.indexOf('const quotationMoney ='),html.indexOf('async function stageQuotationImage'));
    const application=html.slice(html.indexOf('function applyQuotationOperation('),html.indexOf('function renderQuotationEditor('));
    const context=vm.createContext({document:{getElementById:()=>null}});
    vm.runInContext(`${calculation}\n${application}\nglobalThis.apply=applyQuotationOperation;`,context);
    const quote={editor_state:{next_item_number:4},quotation_items:[{item_number:3,part_name:'B'},{item_number:1,part_name:'A'}]};
    const ops=sanitizeOperations([{type:'update_item',item_number:1,fields:{shipping_usd:56}},{type:'update_item',index:0,fields:{shipping_usd:99}},{type:'add_item',fields:{part_name:'C'}}],2,true);
    ops.forEach(op=>context.apply(quote,op));
    assert.equal(quote.quotation_items[1].shipping_usd,56);
    assert.equal(quote.quotation_items[0].shipping_usd,undefined);
    assert.equal(quote.quotation_items[2].item_number,4);
});

test('un borrador sin nombre conserva costo, flete y foto al consultar a Aria', () => {
    const ids=['inClient','inWhatsApp','inCar','inAdvisor','inAddress','inDeliveryTime','inObservations','inDiscountPct','inTitle','chkShowTotal','chkDiscount','chkAGN'];
    const values=Object.fromEntries(ids.map(id=>[id,{value:'',checked:false}]));
    values.inClient.parentElement={parentElement:{after(){}}};
    const context=vm.createContext({document:{getElementById:id=>values[id],createElement:()=>({})},window:{}});
    vm.runInContext("let items=[],editIdx=-1,nextItemNumber=1,showTotal=false,discountEnabled=false,discountPercent=0,quoteNumber='',quoteCreatedAt='',currentData={itemNo:1,tit:'',c:'145',s:'50',m:'30',img:'data:image/png;base64,foto'}; function getData(){return currentData} function resetForm(){currentData={}} function updateAll(){} function render(){} function loadItem(i){editIdx=i;currentData=items[i]}",context);
    vm.runInContext(fs.readFileSync(new URL('../agn-cotizador-erp-bridge.js',import.meta.url),'utf8'),context);
    const partial=context.window.agnErpBridge.getQuote({});
    assert.equal(partial.quotation_items[0].price_usd,145);
    assert.equal(partial.quotation_items[0].shipping_usd,50);
    assert.equal(partial.quotation_items[0].image_url,'data:image/png;base64,foto');
    context.window.agnErpBridge.setQuote(partial);
    const reopened=context.window.agnErpBridge.getQuote(partial);
    assert.equal(reopened.quotation_items[0].item_number,1);
    assert.equal(reopened.quotation_items[0].price_usd,145);
    assert.equal(reopened.quotation_items[0].shipping_usd,50);
    assert.equal(reopened.quotation_items[0].image_url,'data:image/png;base64,foto');
    reopened.quotation_items[0].part_name='Manifold';
    context.window.agnErpBridge.setQuote(reopened);
    const named=context.window.agnErpBridge.getQuote(reopened);
    assert.equal(named.quotation_items[0].part_name,'Manifold');
    assert.equal(named.quotation_items[0].price_usd,145);
    assert.equal(named.quotation_items[0].image_url,'data:image/png;base64,foto');
});

test('previsualizar un enlace para un repuesto nuevo no cambia el repuesto existente', async () => {
    const html=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');
    const source=html.slice(html.indexOf('async function enrichQuotationFromLink('),html.indexOf('function applyQuotationOperation('));
    let warning='';
    const context=vm.createContext({API:'',adminPass:'test',showToast:message=>{warning=message},fetchWithTimeout:async()=>({ok:true,json:async()=>({data:{url:'https://example.test/nuevo',title:'Repuesto nuevo',description:'Detalle',image_url:'https://example.test/nuevo.jpg'}})})});
    vm.runInContext(`${source}\nglobalThis.enrich=enrichQuotationFromLink;`,context);
    const quote={quotation_items:[{item_number:1,part_name:'Repuesto existente',supplier_url:''}]};
    const message=await context.enrich(quote,'Agrega un repuesto nuevo https://example.test/nuevo');
    assert.equal(quote.quotation_items[0].supplier_url,'');
    assert.match(message,/Repuesto nuevo/);
    context.fetchWithTimeout=async()=>{throw new Error('sin conexión')};
    const original='Agrega otro https://example.test/otro';
    assert.equal(await context.enrich(quote,original),original);
    assert.equal(quote.quotation_items[0].supplier_url,'');
    assert.match(warning,/No se pudo previsualizar/);
});

test('la subida de cotizaciones exige autenticación y guarda JPEG limitado a 125 KB', async () => {
    let upload;
    const bucket={upload:async(path,bytes,options)=>{upload={path,bytes,options};return {error:null}},getPublicUrl:path=>({data:{publicUrl:`https://example.test/${path}`}})};
    const handler=createQuotationImageUploadHandler({client:{storage:{from:name=>{assert.equal(name,'quotation-images');return bucket}}},hasServiceRole:()=>true});
    const response=()=>({statusCode:0,body:null,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}});
    let res=response();
    await handler({method:'POST',headers:{},body:{}},res);
    assert.equal(res.statusCode,401);
    const jpeg=Buffer.from([0xff,0xd8,0xff,0xd9]);
    res=response();
    await handler({method:'POST',headers:{'x-admin-password':'test-password'},body:{image:'data:image/jpeg;base64,'+jpeg.toString('base64')}},res);
    assert.equal(res.statusCode,200);
    assert.match(res.body.url,/\.jpg$/);
    assert.deepEqual(upload.bytes,jpeg);
    assert.equal(upload.options.contentType,'image/jpeg');
    res=response();
    await handler({method:'POST',headers:{'x-admin-password':'test-password'},body:{image:'data:image/jpeg;base64,'+Buffer.alloc(125*1024+1).toString('base64')}},res);
    assert.equal(res.statusCode,400);
    res=response();
    await handler({method:'POST',headers:{'x-admin-password':'test-password'},body:{image:'data:image/png;base64,AAAA'}},res);
    assert.equal(res.statusCode,400);
});

test('la subida indica si falta el espacio de imágenes sin crear buckets', async () => {
    const bucket={upload:async()=>({error:{message:'Bucket not found',statusCode:'404'}})};
    const handler=createQuotationImageUploadHandler({client:{storage:{from:()=>bucket}},hasServiceRole:()=>true});
    const res={statusCode:0,body:null,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
    const jpeg=Buffer.from([0xff,0xd8,0xff,0xd9]);
    await handler({method:'POST',headers:{'x-admin-password':'test-password'},body:{image:'data:image/jpeg;base64,'+jpeg.toString('base64')}},res);
    assert.equal(res.statusCode,503);
    assert.match(res.body.message,/quotation-images/);
});

test('el diagnóstico distingue el proyecto y si Storage reconoce el espacio', async () => {
    const bucket={upload:async()=>({error:{message:'Bucket not found',statusCode:'404'}})};
    let lookups=0;
    const client={storage:{from:()=>bucket,getBucket:async name=>{lookups++;assert.equal(name,'quotation-images');return {data:{public:true},error:null}}}};
    const handler=createQuotationImageUploadHandler({client,hasServiceRole:()=>true});
    const res={statusCode:0,body:null,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
    const jpeg=Buffer.from([0xff,0xd8,0xff,0xd9]);
    await handler({method:'POST',headers:{'x-admin-password':'test-password'},body:{image:'data:image/jpeg;base64,'+jpeg.toString('base64')}},res);
    assert.equal(res.statusCode,503);
    assert.equal(lookups,1);
    assert.match(res.body.message,/example\.supabase\.co/);
    assert.match(res.body.message,/Storage reconoce quotation-images \(público\)/);
});

test('una copia CSV recupera imágenes pegadas y enlaces sin aceptar protocolos inseguros', () => {
    const html=fs.readFileSync(new URL('../agn-cotizador-integrado.html',import.meta.url),'utf8');
    const source=html.slice(html.indexOf('    function readCSVImage('),html.indexOf('    // FUNCIÓN CON RETROCOMPATIBILIDAD: importCSV'));
    const context=vm.createContext({URL});
    vm.runInContext(`${source}\nglobalThis.read=readCSVImage`,context);
    assert.equal(context.read('https://example.test/foto.webp'),'https://example.test/foto.webp');
    assert.equal(context.read('data:image/png;base64,AAAA'),'data:image/png;base64,AAAA');
    assert.equal(context.read('javascript:alert(1)'),null);
});

test('cargar CSV no pregunta en una cotización vacía y permite conservar los cambios', async () => {
    const html=fs.readFileSync(new URL('../agn-cotizador-integrado.html',import.meta.url),'utf8');
    const source=html.slice(html.indexOf('    async function confirmSaveIfDirty()'),html.indexOf('    async function ensureCSVList()'));
    let editor={},promptCount=0;
    const fields={inAdvisor:{value:'Pedro Cordero'},inDeliveryTime:{value:'9-12 días lab.'},inMarg:{value:'30'}};
    const context=vm.createContext({document:{getElementById:id=>fields[id]},getData:()=>editor,recomputeDirty:()=>true,confirm:()=>{promptCount++;return false}});
    vm.runInContext(`let lastLoadedCSVText=null,items=[]; ${source}\nglobalThis.check=confirmSaveIfDirty;`,context);
    assert.equal(await context.check(),true);
    assert.equal(promptCount,0);
    editor={c:'99'};
    assert.equal(await context.check(),false);
    assert.equal(promptCount,1);
});

test('un archivo CSV inválido se rechaza antes de borrar el borrador abierto', () => {
    const html=fs.readFileSync(new URL('../agn-cotizador-integrado.html',import.meta.url),'utf8');
    const source=html.slice(html.indexOf('    function parseCSVContent('),html.indexOf('    async function importCSV('));
    const context=vm.createContext({});
    vm.runInContext(`let items=[{tit:'Sin perder'}]; ${source}\nglobalThis.parse=parseCSVContent;globalThis.current=()=>items;`,context);
    assert.throws(()=>context.parse('archivo inválido','incorrecto.csv'),/CSV válida/);
    assert.equal(context.current()[0].tit,'Sin perder');
});

test('exportar CSV incorpora imágenes externas y no entrega un archivo incompleto si fallan', async () => {
    const html=fs.readFileSync(new URL('../agn-cotizador-integrado.html',import.meta.url),'utf8');
    const source=html.slice(html.indexOf('    async function embedCSVImages('),html.indexOf('    // FUNCIÓN MODIFICADA: exportCSV ahora guarda'));
    let calls=0;
    class FakeFile { constructor(parts,name,options){this.type=options.type} }
    class FakeReader { readAsDataURL(){this.result='data:image/jpeg;base64,/9j/2Q==';this.onload()} }
    const parent={fetchQuotationPhotoBlob:async()=>{calls++;return {type:'image/png'}},compressImage:async()=>({type:'image/jpeg'})};
    const context=vm.createContext({window:{parent},File:FakeFile,FileReader:FakeReader});
    vm.runInContext(`${source}\nglobalThis.embed=embedCSVImages`,context);
    const csv='Titulo|Imagen|Imagen2|Imagen3\nA|https://example.test/a.png|data:image/png;base64,AAAA|\nB|https://example.test/a.png||\n';
    const result=await context.embed(csv);
    assert.equal(calls,1);
    assert.doesNotMatch(result,/https:\/\//);
    assert.match(result,/data:image\/jpeg;base64/);
    parent.fetchQuotationPhotoBlob=async()=>{throw new Error('No disponible')};
    await assert.rejects(context.embed(csv),/No se pudo incorporar una foto/);
});


test('Storage utiliza el proyecto del servidor y protege sus operaciones', async () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://current.supabase.co';
    let listed = 0, removed = null;
    const bucket = {list:async()=>{listed++;return {data:[{name:'one.jpg',metadata:{size:42}}],error:null}}, remove:async names=>{removed=names;return {error:null}}};
    const handler = createQuotationImageUploadHandler({client:{storage:{from:()=>bucket}},hasServiceRole:()=>true});
    const response=()=>({statusCode:0,body:null,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}});
    try {
        let res=response(); await handler({method:'GET',url:'/api/quotation-image-upload?config=1',headers:{'x-admin-password':'test-password'}},res);
        assert.equal(res.body.origin,'https://current.supabase.co'); assert.equal(listed,0);
        res=response(); await handler({method:'GET',url:'/api/quotation-image-upload',headers:{'x-admin-password':'test-password'}},res);
        assert.equal(res.body.files[0].name,'one.jpg'); assert.equal(listed,1);
        res=response(); await handler({method:'DELETE',headers:{},body:{names:['one.jpg']}},res);
        assert.equal(res.statusCode,401); assert.equal(removed,null);
        res=response(); await handler({method:'DELETE',headers:{'x-admin-password':'test-password'},body:{names:['../one.jpg']}},res);
        assert.equal(res.statusCode,400); assert.equal(removed,null);
        res=response(); await handler({method:'DELETE',headers:{'x-admin-password':'test-password'},body:{names:['one.jpg']}},res);
        assert.equal(res.statusCode,200); assert.deepEqual(removed,['one.jpg']);
    } finally { if (original === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL=original; }
});


test('Aria reconoce logos del catálogo y rechaza marcas inventadas', () => {
    assert.deepEqual(sanitizeOperations([{type:'add_logo',item_number:2,brand:'Denso'}],1,true),[{type:'add_logo',item_number:2,brand:'Denso'}]);
    assert.equal(sanitizeOperations([{type:'add_logo',item_number:2,brand:'Marca inexistente'}],1,true)[0].type,'question');
});

test('el logo se añade al ítem numerado sin reemplazar fotos y respeta el límite', async () => {
    const html=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');
    const code=html.slice(html.indexOf('async function applyQuotationLogo('),html.indexOf('async function runQuotationAria('));
    const context=vm.createContext({URL,location:{origin:'https://erp.test'}});
    vm.runInContext(`${code}\nglobalThis.apply=applyQuotationLogo`,context);
    const quote={quotation_items:[{item_number:7,photos:['https://example.test/photo.jpg'],image_url:'https://example.test/photo.jpg'},{item_number:2,photos:[]}]};
    const catalog=[{name:'Denso',url:'/logos/denso.jpg'}];
    assert.equal(await context.apply(quote,{item_number:7,brand:'Denso'},catalog),true);
    assert.deepEqual(Array.from(quote.quotation_items[0].photos),['https://example.test/photo.jpg','https://erp.test/logos/denso.jpg']);
    assert.equal(await context.apply(quote,{item_number:7,brand:'Denso'},catalog),false);
    quote.quotation_items[0].photos.push('https://example.test/other.jpg');
    await assert.rejects(context.apply(quote,{item_number:7,brand:'Denso2'},[{name:'Denso2',url:'/logos/denso2.jpg'}]),/tres imágenes/);
    await assert.rejects(context.apply(quote,{item_number:8,brand:'Denso'},catalog),/No existe el ítem/);
});


test('guardar reutiliza el logo del catálogo sin subirlo a Supabase', async () => {
    const html=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');
    const code=html.slice(html.indexOf('async function saveQuotationDraft('),html.indexOf('async function runQuotationAria('));
    let sent, uploads=0;
    const context=vm.createContext({URL,location:{href:'https://erp.test/admin.html',origin:'https://erp.test'},
        document:{getElementById:()=>({disabled:false,textContent:''})},pendingImages:[],quotationNumber:Number,
        setQuotationSaveStatus:()=>{},showToast:()=>{},recalculateQuotation:()=>{},STORAGE_CONFIG:{supabaseUrl:'https://db.test'},
        uploadQuotationImage:async()=>{uploads++;},fetchQuotationPhotoBlob:async()=>{throw Error('no debe leer el logo')},
        quotationHistory:()=>[],quotationSessionKey:q=>q.id,API:'',adminPass:'test',
        sessionStorage:{removeItem(){},setItem(){}},loadQuotations:async()=>{},renderQuotationEditor:()=>{},selectedQuotation:null,
        fetchWithTimeout:async(_url,opts)=>{sent=JSON.parse(opts.body);return {ok:true,json:async()=>({data:{id:'q1',readable_id:'Q-1'}})}}});
    vm.runInContext(`${code}\nglobalThis.save=saveQuotationDraft`,context);
    await context.save({id:'draft-1',quotation_items:[{item_number:1,part_name:'Filtro',margin_pct:30,photos:['https://erp.test/logos/denso.jpg']}]});
    assert.equal(uploads,0);assert.equal(sent.items[0].photos[0],'https://erp.test/logos/denso.jpg');
});


test('Aria admite la operación de logos y reconoce NTY y las marcas del ejemplo', async () => {
    const originalFetch=globalThis.fetch; let prompt='';
    globalThis.fetch=async (_url,opts)=>{prompt=JSON.parse(opts.body).messages[0].content;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({reply:'',operations:[{type:'add_logo',item_number:1,brand:'Mercedes-Benz'},{type:'add_logo',item_number:2,brand:'Dayco'},{type:'add_logo',item_number:3,brand:'NTY'}]})}}]})}};
    const res={statusCode:0,body:null,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
    try {
        await quotationAssist({method:'POST',headers:{'x-admin-password':'test-password'},body:{message:'Pon los logos de cada marca',quotation:{quotation_items:[{item_number:1,part_brand:'Mercedes Benz'},{item_number:2,part_brand:'Dayco'},{item_number:3,part_brand:'NTY'}]}}},res);
        assert.equal(res.statusCode,200);assert.deepEqual(res.body.data.operations.map(x=>x.brand),['Mercedes-Benz','Dayco','NTY']);
        assert.match(prompt,/Operaciones:[^\n]*add_logo/);assert.match(prompt,/según las marcas de los ítems/);
        const catalog=JSON.parse(fs.readFileSync(new URL('../logos/catalogo.json',import.meta.url),'utf8'));
        for (const name of ['Mercedes-Benz','Dayco','NTY']) { const item=catalog.find(x=>x.name===name); assert.ok(item);assert.ok(fs.existsSync(new URL('..'+item.url,import.meta.url))); }
    } finally {globalThis.fetch=originalFetch;}
});
