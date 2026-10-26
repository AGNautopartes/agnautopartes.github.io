// api/quotations-import.js
// Endpoint: POST /api/quotations-import
// Body: { csv_text } o multipart/form-data con archivo

import supabase from '../supabase-client.js';
import { quotationsToCSV, CSVToQuotationObjects } from './quotations-crud.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  try {
    // Soporte multipart y JSON
    let csvText = '';
    if (req.headers['content-type']?.includes('multipart')) {
      // Vercel maneja multipart en req.body si se configura
      // En producción usar @vercel/blob o similar
      // Aquí simplificado: esperar JSON con csv_text
      csvText = req.body?.csv_text || '';
    } else {
      csvText = req.body?.csv_text || '';
    }

    if (!csvText) {
      return res.status(400).json({ message: 'csv_text requerido en body' });
    }

    // Parsear CSV
    const parsedQuotations = CSVToQuotationObjects(csvText);
    if (parsedQuotations.length === 0) {
      return res.status(400).json({ message: 'CSV vacío o inválido' });
    }

    const results = [];
    let created = 0;
    let errors = 0;

    for (const q of parsedQuotations) {
      try {
        // Crear cotización con datos del CSV
        const { data: quotation, error } = await supabase
          .from('quotations')
          .insert({
            readable_id: q.readable_id || `Q-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            customer_name: q.cliente || 'Cliente CSV',
            vehicle_brand: q.veh_marca || 'Marca',
            vehicle_model: q.veh_modelo || 'Modelo',
            vehicle_year: q.veh_anio || '',
            whatsapp_phone: q.telefono || '',
            status: q.estado || 'borrador',
            pdf_url: q.pdf_url || null,
            whatsapp_link: q.whatsapp_link || null,
            total_usd: parseFloat(q.total_usd) || 0,
            total_vat_usd: parseFloat(q.total_vat_usd) || 0,
            notes: `Importado desde CSV`,
            created_by: 'import-csv'
          })
          .select()
          .single();

        if (error) throw error;
        created++;
        results.push({ readable_id: quotation.readable_id, status: 'created' });
      } catch (err) {
        errors++;
        results.push({ error: err.message, status: 'failed' });
      }
    }

    return res.status(201).json({
      message: `Importación completada: ${created} creadas, ${errors} errores`,
      total: parsedQuotations.length,
      created,
      errors,
      results
    });

  } catch (error) {
    console.error('❌ Error quotations-import:', error);
    return res.status(500).json({ message: 'Error interno', error: error.message });
  }
}