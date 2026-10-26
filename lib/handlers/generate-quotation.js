// api/generate-quotation.js
// Motor completo: recibe raw_input (voz/texto) → parseo → links scrape → PDF → Storage → BD → wa.me link
// Dependencias: node-fetch, pdfkit, @supabase/supabase-js (vía supabase-client.js)

import supabase from '../supabase-client.js';
import fetch from 'node-fetch';
import PDFDocument from 'pdfkit';

// Configuración
const PDF_MARGIN = 40;
const MAX_LINK_FETCH = 2;
const FETCH_TIMEOUT = 8000;

// Configuración de imágenes
const MAX_IMAGE_SIZE = 125 * 1024; // 125 KB máximo por imagen
const MAX_IMAGE_DIMENSION = 1200;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ============ 1. PARSEO INTELIGENTE DEL RAW_INPUT ============
function parseRawInput(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const text = raw.trim();

  // Extraer cliente y teléfono (último número de teléfono posible)
  const phoneMatch = text.match(/\+?[\d\-\s]{8,15}$/);
  const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, '') : '';
  // Remover teléfono del texto para extraer cliente/vehículo
  let textNoPhone = text;
  if (phoneMatch) {
    textNoPhone = text.replace(phoneMatch[0], '').trim();
  }

  // Extraer vehículo (patrón: marca modelo año)
  const vehicleMatch = textNoPhone.match(/([A-Za-zÁÉÍÓÚÑ\s]+)\s+([A-Za-zÁÉÍÓÚÑ\s]+)\s+(\d{4})/i);
  const vehicle_brand = vehicleMatch ? vehicleMatch[1].trim() : '';
  const vehicle_model = vehicleMatch ? vehicleMatch[2].trim() : '';
  const vehicle_year = vehicleMatch ? vehicleMatch[3] : '';

  // Extraer ítems (patrón simplificado: item - link - precio - peso - margen)
  // Formato esperado: "1. Radiador - proveedor.com/rad - $85 - 3.2kg - 30%" o por voz natural
  const itemRegex = /([^\d\-,;:]+?)\s*-\s*([^\s\-,;:]+(?:\.[^\s\-,;:]+)?)\s*-\s*[\$\€]?\s*([\d,.]+)\s*-\s*([\d,.]+)\s*(?:kg|Kg|g|G)?\s*-\s*([\d]+(?:\.[\d]+)?)\s*%/gi;
  const items = [];

  let match;
  while ((match = itemRegex.exec(textNoPhone)) !== null) {
    items.push({
      part_name: match[1].trim().replace(/\s+/g, ' '),
      supplier_url: match[2],
      price_usd: parseFloat(match[3].replace(/,/g, '.')),
      weight_kg: parseFloat(match[4].replace(/,/g, '.')),
      margin_pct: parseFloat(match[5])
    });
  }

  // Si no se detectaron ítems con regex, intentar parseo simple por líneas
  if (items.length === 0) {
    // Buscar patrones tipo "$XX" o "precio XX" después de palabras clave
    const simpleItems = [];
    const lines = textNoPhone.split('\n');
    for (const line of lines) {
      const priceInLine = line.match(/\$?[\d,.]+/);
      if (priceInLine) {
        simpleItems.push({
          part_name: line.trim(),
          supplier_url: '',
          price_usd: parseFloat(priceInLine[0].replace(/[$]/g, '').replace(/,/g, '.')),
          weight_kg: 0,
          margin_pct: 30 // default
        });
      }
    }
    if (simpleItems.length > 0) items.push(...simpleItems);
  }

return {
    raw_input: text,
    customer_name: '',
    vehicle_brand,
    vehicle_model,
    vehicle_year,
    phone,
    items: items.slice(0, 20)
  };
}

// ============ VALIDACIÓN DE IMÁGENES ============
function validateImageBuffer(buffer, mimeType) {
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    return { ok: false, error: `Tipo no permitido: ${mimeType}. Use JPEG, PNG o WebP` };
  }
  if (buffer.length > MAX_IMAGE_SIZE) {
    return { ok: false, error: `Imagen demasiado grande: ${(buffer.length/1024).toFixed(1)} KB. Máximo: ${MAX_IMAGE_SIZE/1024} KB` };
  }
  return { ok: true };
}

async function validateImageUrl(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeoutId);
    
    const contentType = res.headers.get('content-type');
    const contentLength = res.headers.get('content-length');
    
    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
      return { ok: false, error: `Tipo no permitido: ${contentType}` };
    }
    if (contentLength && parseInt(contentLength) > MAX_IMAGE_SIZE) {
      return { ok: false, error: `Imagen remota demasiado grande: ${(contentLength/1024).toFixed(1)} KB` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `No se pudo validar imagen: ${e.message}` };
  }
}

// ============ 2. FETCH PARALELO A PROVEEDORES ============
async function fetchSupplierData(urls) {
  if (!urls || urls.length === 0) return [];

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AGN-Bot/1.0)',
            'Accept': 'text/html'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) return { url, error: `HTTP ${res.status}` };

        const html = await res.text();

        // Regex simples para extraer precio y título (ajustable por proveedor)
        const priceMatch = html.match(/["\']?price["\']?\s*[:]?\s*["\']?([\d,.]+)["\']?/i);
        const titleMatch = html.match(/<title>[^<]+([^\d]{3,50}[\d]{2,})[^<]*<\/title>/i) ||
                          html.match(/["\']?product["\']?\s*[:]?\s*["\']?([^\d]{3,50})/i);

        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '.')) : null;
        const extractedTitle = titleMatch ? titleMatch[1].trim().substring(0, 80) : null;

        return { url, title: extractedTitle, price, success: true };
      } catch (err) {
        return { url, error: err.message, success: false };
      }
    })
  );

  return results.map(r => r.success ? { url: r.url, title: r.title, price: r.price } : { url: r.url, error: r.error });
}

// ============ 3. GENERAR PDF PROFESIONAL ============
function generateQuotationPDF(quotationData) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: PDF_MARGIN,
      size: 'A4',
      layout: 'portrait'
    });

    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Encabezado: Logo/AGN
    doc.fontSize(9).text('AGN Autopartes - Cotización', PDF_MARGIN, PDF_MARGIN);
    doc.fontSize(11).text(`Número: ${quotationData.readable_id}`, PDF_MARGIN, PDF_MARGIN + 15);
    doc.fontSize(10).text(`Fecha: ${new Date().toLocaleDateString('es-EC')}`, PDF_MARGIN + 100, PDF_MARGIN + 15);

    // Cliente/Vehículo
    doc.moveDown();
    doc.fontSize(10).text(`Cliente: ${quotationData.customer_name || 'Por definir'}`, PDF_MARGIN, doc.y + 5);
    doc.fontSize(10).text(`Teléfono: ${quotationData.whatsapp_phone || 'Por definir'}`, PDF_MARGIN, doc.y + 5);
    doc.fontSize(10).text(`Vehículo: ${quotationData.vehicle_brand || ''} ${quotationData.vehicle_model || ''} ${quotationData.vehicle_year || ''}`, PDF_MARGIN, doc.y + 5);

    // Tabla de ítems
    doc.moveDown(2);
    doc.fontSize(9).text('Items:', PDF_MARGIN, doc.y + 5);
    const tableTop = doc.y + 5;

    let subtotal = 0;
    for (const item of quotationData.items) {
      const itemTotal = item.final_price_usd * (item.quantity || 1);
      subtotal += itemTotal;

      doc.text(`• ${item.part_name}`, PDF_MARGIN, doc.y + 5);
      if (item.supplier_url) doc.text(`Link: ${item.supplier_url}`, PDF_MARGIN + 80, doc.y + 5);
      doc.text(`$${item.final_price_usd.toFixed(2)} x ${item.weight_kg || 1}kg`, PDF_MARGIN + 130, doc.y + 5);
      doc.text(`Márg.: ${item.margin_pct}%`, PDF_MARGIN + 200, doc.y + 5);
      doc.text(`$${item.final_price_vat_usd.toFixed(2)} (IVA 15% incl.)`, PDF_MARGIN + 260, doc.y + 5);
    }

    // Totales
    doc.moveDown();
    doc.fontSize(10).text(`SUBTOTAL: $${subtotal.toFixed(2)}`, PDF_MARGIN, doc.y + 10);
    const totalVat = subtotal * 0.15;
    const totalConIva = subtotal + totalVat;
    doc.fontSize(10).text(`TOTAL + IVA 15%: $${totalConIva.toFixed(2)}`, PDF_MARGIN, doc.y + 10);
    doc.fontSize(10).text(`Última actualización: ${new Date().toLocaleString()}`, PDF_MARGIN, doc.y + 15);

    doc.end();
  });
}

// ============ 4. SUBIR A SUPABASE STORAGE ============
async function uploadToSupabaseStorage(buffer, filename, bucket = 'quotation-pdfs') {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(`${Date.now()}-${filename}`, buffer, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return publicUrl;
}

// ============ 5. GENERAR wa.me LINK ============
function generateWaMeLink(phone, quotationId, itemsSummary) {
  const timestamp = new Date().toISOString();
  const itemsText = itemsSummary || '1 item';
  const message = `Hola! Estoy interesado en la cotización Q-${quotationId}. ${itemsText}. Total con IVA 15%.`;
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${phone.replace('+', '')}?text=${encodedMessage}`;
}

// ============ HANDLER PRINCIPAL ============
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  try {
    const { raw_input, customer_name, vehicle_brand, vehicle_model, vehicle_year, whatsapp_phone } = req.body || {};

    if (!raw_input) {
      return res.status(400).json({ message: 'raw_input es requerido' });
    }

    // 1. Parseo
    const parsed = parseRawInput(raw_input);
    if (!parsed) return res.status(400).json({ message: 'No parseable' });

    // Sobrescribir con datos explícitos si vienen
    if (customer_name) parsed.customer_name = customer_name;
    if (vehicle_brand) parsed.vehicle_brand = vehicle_brand;
    if (vehicle_model) parsed.vehicle_model = vehicle_model;
    if (vehicle_year) parsed.vehicle_year = vehicle_year;
    if (whatsapp_phone) parsed.whatsapp_phone = whatsapp_phone;

    // 2. Scrapeo paralelo de links
    const supplierUrls = parsed.items.map(i => i.supplier_url).filter(Boolean);
    const fetchedData = await fetchSupplierData(supplierUrls);

    // 3. Enriquecer items con datos scrapeados
    parsed.items.forEach((item, i) => {
      const fetched = fetchedData.find(f => f.url === item.supplier_url);
      if (fetched && fetched.price) {
        item.price_usd = fetched.price;
        if (fetched.title) item.part_name = fetched.title;
      }
    });

    // 4. Calcular precios y márgenes
    let subtotal = 0;
    for (const item of parsed.items) {
      // Si no hay precio, usar default o calcular desde margen
      if (item.price_usd <= 0) item.price_usd = 25; // default placeholder
      const landedCost = item.price_usd / (1 - (item.margin_pct / 100));
      const priceWithVat = item.price_usd * 1.15;

      item.final_price_usd = Math.round(item.price_usd * 100) / 100;
      item.final_price_vat_usd = Math.round(priceWithVat * 100) / 100;
      item.quantity = 1; // por defecto

      subtotal += item.final_price_vat_usd;
    }

    const totalVat = subtotal * 0.15;
    const totalConIva = subtotal + totalVat;

    // 5. Generar PDF
    const pdfBuffer = await generateQuotationPDF({
      readable_id: `Q-${Date.now()}`,
      customer_name: parsed.customer_name || 'Cliente',
      whatsapp_phone: parsed.whatsapp_phone || '',
      vehicle_brand: parsed.vehicle_brand || 'Marca',
      vehicle_model: parsed.vehicle_model || 'Modelo',
      vehicle_year: parsed.vehicle_year || '',
      items: parsed.items
    });

    // 6. Subir Storage
    const pdfUrl = await uploadToSupabaseStorage(pdfBuffer, `cot-${Date.now()}.pdf`);

    // 7. Generar wa.me link
    const waMeLink = generateWaMeLink(parsed.whatsapp_phone || '593987654321', `Q-${Date.now()}`, `${parsed.items.length} items`);

    // 8. Guardar en BD
    const readableId = `Q-${Date.now()}`;
    const { data: quotation, error: dbError } = await supabase
      .from('quotations')
      .insert({
        readable_id: readableId,
        customer_id: null, // se llenará después si se busca/cliente existente
        vehicle_brand: parsed.vehicle_brand || 'Marca',
        vehicle_model: parsed.vehicle_model || 'Modelo',
        vehicle_year: parsed.vehicle_year || '',
        status: 'borrador',
        whatsapp_phone: parsed.whatsapp_phone || '',
        pdf_url: pdfUrl,
        whatsapp_link: waMeLink,
        total_usd: Math.round(subtotal * 100) / 100,
        total_vat_usd: Math.round(totalVat * 100) / 100,
        notes: `Generado automáticamente vía API generate-quotation.js`,
        created_by: 'Aria'
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // 8. Guardar items
    for (let i = 0; i < parsed.items.length; i++) {
      const item = parsed.items[i];
      await supabase
        .from('quotation_items')
        .insert({
          quotation_id: quotation.id,
          part_name: item.part_name || item.supplier_url || 'Sin nombre',
          part_number: item.part_number || '',
          supplier_url: item.supplier_url || '',
          price_usd: item.price_usd,
          weight_kg: item.weight_kg,
          margin_pct: item.margin_pct || 30,
          landed_cost_usd: Math.round((item.price_usd / (1 - (item.margin_pct / 100))) * 100) / 100,
          final_price_usd: item.final_price_usd,
          final_price_vat_usd: item.final_price_vat_usd,
          sort_order: i
        });
    }

    // 9. Respuesta
    return res.status(201).json({
      message: 'Cotización generada exitosamente',
      quotation: {
        id: quotation.id,
        readable_id: quotation.readable_id,
        customer_name: parsed.customer_name,
        vehicle: `${parsed.vehicle_brand || ''} ${parsed.vehicle_model || ''} ${parsed.vehicle_year || ''}`,
        status: quotation.status,
        total_usd: quotation.total_usd,
        total_vat_usd: quotation.total_vat_usd,
        pdf_url: quotation.pdf_url,
        whatsapp_link: quotation.whatsapp_link,
        items_count: parsed.items.length
      }
    });

  } catch (error) {
    console.error('❌ Error generate-quotation:', error);
    return res.status(500).json({ message: 'Error interno', error: error.message });
  }
}