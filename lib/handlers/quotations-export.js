// api/quotations-export.js
// Endpoint: GET /api/quotations-export?status=enviado&date_from=2026-01-01

import { serve } from '@vercel/functions';
import { render } from '@react-email/vercel';
import fetch from 'node-fetch';
import { quotationsToCSV } from './quotations-crud.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  try {
    const { status, date_from, date_to, customer_name } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (date_from) filters.date_from = date_from;
    if (date_to) filters.date_to = date_to;
    if (customer_name) filters.customer_name = customer_name;

    const list = await fetch('./quotations-crud.js', { /* Nota: en Vercel se importaría directamente */ })
      // En producción real, importarías la función directamente o la expondrías como endpoint separado
      // Por simplicidad, re-utilizaremos la lógica básica aquí
      ;

    // Por ahora, construimos lista vacía y llamamos al formatter
    // TODO: En producción, llamar a getQuotationsList() y luego quotationsToCSV()
    const csv = 'readable_id,cliente,total_usd,estado\n';

    return res.status(200).set({ 'Content-Type': 'text/csv; charset=utf-8' }).attachment('cotizaciones_' + new Date().toISOString().split('T')[0] + '.csv').send(csv);

  } catch (error) {
    console.error('❌ Error quotations-export:', error);
    return res.status(500).json({ message: 'Error interno', error: error.message });
  }
}