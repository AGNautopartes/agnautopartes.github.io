-- AGN Autopartes ERP - Migración: Sistema de Cotizaciones Integradas
-- Versión: 1.0
-- Fecha: 2026-01-15
-- Reversibilidad: Ver 20260115_add_quotations_down.sql

BEGIN;

-- 1. Tabla: quotations (cabeceras de cotizaciones)
CREATE TABLE public.quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    readable_id TEXT UNIQUE NOT NULL,  -- Q-YYYY-NNN
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    vehicle_brand TEXT,
    vehicle_model TEXT,
    vehicle_year TEXT,
    status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','enviado','aceptado','vencido','convertido')),
    whatsapp_phone TEXT,
    pdf_url TEXT,
    whatsapp_link TEXT,
    notes TEXT,
    total_usd DECIMAL(10,2) DEFAULT 0,
    total_vat_usd DECIMAL(10,2) DEFAULT 0,
    created_by TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ
);

-- 2. Tabla: quotation_items (líneas de cada cotización)
CREATE TABLE public.quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    part_name TEXT NOT NULL,
    part_number TEXT,
    supplier_url TEXT,
    image_url TEXT,
    price_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
    weight_kg DECIMAL(8,3) NOT NULL DEFAULT 0,
    margin_pct DECIMAL(5,2) NOT NULL DEFAULT 20,
    landed_cost_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
    final_price_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
    final_price_vat_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0
);

-- 3. FK: orders → quotations (trazabilidad)
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL;

-- 4. Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_quotations_readable_id ON public.quotations(readable_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_customer_id ON public.quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_created_at ON public.quotations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id ON public.quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_orders_quotation_id ON public.orders(quotation_id);

-- 5. Trigger: updated_at automático
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_quotations_updated_at ON public.quotations;
CREATE TRIGGER trg_quotations_updated_at
    BEFORE UPDATE ON public.quotations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Función para generar readable_id automático (Q-YYYY-NNN)
CREATE OR REPLACE FUNCTION public.generate_quotation_id()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(readable_id FROM 6) AS INTEGER)), 0) + 1
    INTO next_num
    FROM public.quotations
    WHERE readable_id LIKE 'Q-' || EXTRACT(YEAR FROM now())::TEXT || '-%';
    RETURN 'Q-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(next_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- 7. RLS policies
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- Policy: service_role bypass (ya configurado)
-- Policy: anon/read-only para lectura
CREATE POLICY IF NOT EXISTS "quotations_read" ON public.quotations
    FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "quotation_items_read" ON public.quotation_items
    FOR SELECT USING (true);

-- 8. Grants
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.quotations TO anon, authenticated, service_role;
GRANT ALL ON public.quotations TO service_role;
GRANT SELECT ON public.quotation_items TO anon, authenticated, service_role;
GRANT ALL ON public.quotation_items TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_quotation_id() TO service_role;

COMMIT;