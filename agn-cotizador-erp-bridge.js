// Adapter for the original cotizador. Its presentation and calculations remain
// in agn-cotizador-integrado.html; this only maps state to the ERP.
(() => {
    const byId = id => document.getElementById(id);
    const getValue = id => byId(id)?.value || '';
    const setValue = (id, value) => { if (byId(id)) byId(id).value = value ?? ''; };

    // Escala únicamente la vista en pantalla: el PDF y el PNG conservan
    // las dimensiones originales de la hoja.
    const workspace = document.querySelector?.('.workspace');
    const sheet = byId('formal-sheet');
    let exportingFormal = false;
    const fitFormalPreview = () => {
        if (exportingFormal || !workspace || !sheet || workspace.clientWidth <= 0 || sheet.offsetWidth <= 0) return;
        const style = getComputedStyle(workspace);
        const available = workspace.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
        sheet.style.zoom = String(Math.min(1, Math.max(0.2, (available - 2) / sheet.offsetWidth)));
    };
    if (workspace && sheet) {
        if (typeof ResizeObserver === 'function') new ResizeObserver(fitFormalPreview).observe(workspace);
        window.addEventListener('resize', fitFormalPreview);
        fitFormalPreview();
    }

    const blobAsDataUrl = blob => new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo preparar una foto'));
        reader.readAsDataURL(blob);
    });

    const exportWithPhotos = async (selector, exportOriginal) => {
        const formal = selector.startsWith('#formal-sheet');
        if (formal && exportingFormal) return;
        if (formal) exportingFormal = true;
        const photos = Array.from(document.querySelectorAll(selector)).filter(img => img.getAttribute('src'));
        const originalSources = photos.map(img => img.getAttribute('src'));
        const originalZoom = sheet?.style.zoom;
        try {
            for (const img of photos) {
                const source = img.currentSrc || img.src;
                if (!source) throw new Error('Hay una foto sin dirección');
                if (!source.startsWith('data:')) {
                    const fetchPhoto = window.parent?.fetchQuotationPhotoBlob;
                    if (typeof fetchPhoto !== 'function') throw new Error('No se pudo acceder a las fotos del ERP');
                    img.src = await blobAsDataUrl(await fetchPhoto(source));
                }
                if (typeof img.decode === 'function') await img.decode();
                else if (!img.complete || !img.naturalWidth) throw new Error('La foto no se cargó');
            }
            if (formal && sheet) sheet.style.zoom = '1';
            await exportOriginal();
        } catch (error) {
            alert(`${error.message || 'No se pudo preparar una foto'}. Descarga o pega la imagen en el ítem y vuelve a intentarlo.`);
        } finally {
            if (sheet && originalZoom !== undefined) sheet.style.zoom = originalZoom;
            photos.forEach((img,index) => { img.src = originalSources[index]; });
            if (formal) { exportingFormal = false; fitFormalPreview(); }
        }
    };

    const originalDownloadSheet = window.downloadSheet;
    const originalDownloadCard = window.downloadCard;
    window.downloadSheet = () => exportWithPhotos('#formal-sheet img.quote-photo', originalDownloadSheet);
    window.downloadCard = () => exportWithPhotos('#social-card #cImg', originalDownloadCard);

    const phoneGroup = document.createElement('div');
    phoneGroup.className = 'form-group';
    phoneGroup.innerHTML = '<label for="inWhatsApp">WhatsApp cliente</label><input id="inWhatsApp" placeholder="Número del cliente">';
    byId('inClient').parentElement.parentElement.after(phoneGroup);

    const fromOriginalItem = item => {
        const photos = [item.img, item.img2, item.img3].filter(Boolean);
        return {
            ...item.erpMeta, item_number:item.itemNo, _draft_incomplete:!String(item.tit || '').trim(), part_name:item.tit || '', part_brand:item.brand || '', option_name:item.opt || '',
            description:item.desc || '', internal_reference:item.refInt || '', warranty:item.war || '',
            price_usd:Number(item.c) || 0, shipping_usd:Number(item.s) || 0, margin_pct:Number(item.m) || 0,
            image_url:photos[0] || '', photos, photo_scale:Number(item.photoScale) || 100
        };
    };

    const toOriginalItem = item => {
        const photos = (item.photos?.length ? item.photos : [item.image_url]).filter(Boolean).slice(0,3);
        const c = Number(item.price_usd) || 0, s = Number(item.shipping_usd) || 0, m = Number(item.margin_pct) || 0;
        return { itemNo:item.item_number, erpMeta:{ ...item }, tit:item.part_name || '', brand:item.part_brand || 'Genérico/Compatible', opt:item.option_name || '1: Alterno',
            desc:item.description || '', refInt:item.internal_reference || '', war:item.warranty || '3 meses',
            c, s, m, p:(m < 100 ? (c+s)/(1-m/100) : 0).toFixed(2), img:photos[0] || null,
            img2:photos[1] || null, img3:photos[2] || null, photoScale:item.photo_scale || 100 };
    };

    window.agnErpBridge = {
        getQuote(existing = {}, options = {}) {
            const sourceItems = items.slice();
            const current = getData();
            const hasCurrent = ['tit','desc','refInt','c','s'].some(key => String(current[key] ?? '').trim()) || !!(current.img || current.img2 || current.img3);
            if (editIdx >= 0) sourceItems[editIdx] = current;
            else if (hasCurrent) sourceItems.push(current);
            const mapped = sourceItems.map(fromOriginalItem);
            if (!mapped.length) mapped.push({ item_number:nextItemNumber, part_name:'', price_usd:0, shipping_usd:0, margin_pct:30 });
            const savedName = options.forSave ? getDefaultCSVFilename().replace(/\.csv$/i, '') : existing.editor_state?.display_name;
            const vehicle = getValue('inCar');
            const previousVehicle = [existing.vehicle_brand,existing.vehicle_model,existing.vehicle_year].filter(Boolean).join(' ');
            const vehicleFields = previousVehicle && vehicle !== previousVehicle ? { vehicle_brand:'', vehicle_model:'', vehicle_year:'' } : {};
            return { ...existing, ...vehicleFields, customer_name:getValue('inClient'), whatsapp_phone:getValue('inWhatsApp'),
                vehicle_display:vehicle, delivery_time:getValue('inDeliveryTime'),
                quotation_items:mapped, editor_state:{ ...existing.editor_state, next_item_number:Math.max(nextItemNumber, ...sourceItems.map(item => (Number(item.itemNo) || 0) + 1)), vehicle_display:getValue('inCar'), advisor:getValue('inAdvisor'), address:getValue('inAddress'),
                    observations:getValue('inObservations'), show_total:!!byId('chkShowTotal')?.checked,
                    discount_enabled:!!byId('chkDiscount')?.checked, discount_percent:Number(getValue('inDiscountPct')) || 0,
                    watermark:!!byId('chkAGN')?.checked, quote_number:quoteNumber, quote_created_at:quoteCreatedAt, display_name:savedName } };
        },
        setQuote(quote) {
            const extra = quote.editor_state || {};
            setValue('inClient',quote.customer_name); setValue('inWhatsApp',quote.whatsapp_phone);
            setValue('inCar',[quote.vehicle_brand,quote.vehicle_model,quote.vehicle_year].filter(Boolean).join(' ') || quote.vehicle_display || extra.vehicle_display || '');
            setValue('inAdvisor',extra.advisor || 'Pedro Cordero'); setValue('inAddress',extra.address);
            setValue('inDeliveryTime',quote.delivery_time || '9-12 días lab.');
            setValue('inObservations',extra.observations); setValue('inDiscountPct',extra.discount_percent || 0);
            byId('chkShowTotal').checked = !!extra.show_total; showTotal = !!extra.show_total;
            byId('chkDiscount').checked = !!extra.discount_enabled; discountEnabled = !!extra.discount_enabled;
            discountPercent = Number(extra.discount_percent) || 0; byId('chkAGN').checked = !!extra.watermark;
            quoteNumber = extra.quote_number || ''; quoteCreatedAt = extra.quote_created_at || '';
            const used = new Set();
            nextItemNumber = Math.max(1, Number(extra.next_item_number) || 1);
            const incoming = (quote.quotation_items || []).filter(item =>
                item._draft_incomplete || ['part_name','description','internal_reference','part_number','supplier_url','image_url','image_url_2','image_url_3'].some(key => String(item[key] || '').trim()) ||
                Number(item.price_usd) || Number(item.shipping_usd) || (item.photos || []).some(Boolean)
            );
            for (const item of incoming) {
                const n = Number(item.item_number);
                if (Number.isInteger(n) && n > 0 && !used.has(n)) { used.add(n); nextItemNumber = Math.max(nextItemNumber, n + 1); }
            }
            const assigned = new Set();
            items = incoming.map(item => {
                let n = Number(item.item_number);
                if (!Number.isInteger(n) || n < 1 || assigned.has(n)) {
                    while (used.has(nextItemNumber)) nextItemNumber++;
                    n = nextItemNumber++; used.add(n);
                }
                assigned.add(n);
                return toOriginalItem({ ...item, item_number:n });
            });
            editIdx = -1; resetForm(); updateAll();
            const incompleteIndex = items.findIndex(item => !String(item.tit || '').trim());
            if (incompleteIndex >= 0 && typeof loadItem === 'function') loadItem(incompleteIndex);
            render();
        }
    };
})();
