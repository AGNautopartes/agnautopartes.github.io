-- ============================================================
-- AGN Autopartes ERP — ACTUALIZACIÓN DE FICHA DE ÓRDENES
-- OBJETIVO: Añadir campos financieros y soporte multi-ítem
-- ============================================================

-- 1. Añadir campos numéricos a la tabla orders si no existen
ALTER TABLE orders ADD COLUMN IF NOT EXISTS costo_fob DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_logistica DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_ecuador DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ad_valorem DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS margen_markdown DECIMAL(10,2) DEFAULT 0.30;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS precio_venta DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS comision_vendedor DECIMAL(10,2) DEFAULT 0.00;

-- 2. Añadir columna para múltiples repuestos (JSONB)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_json JSONB DEFAULT '[]'::jsonb;

-- 3. Actualizar la vista order_financial_summary para incluir los nuevos campos
DROP VIEW IF EXISTS order_financial_summary;
CREATE VIEW order_financial_summary AS
SELECT
    o.id as order_id,
    o.readable_id,
    o.part_name,
    o.items_json,
    o.vehicle_brand,
    o.vehicle_model,
    o.vehicle_year,
    c.full_name AS customer_name,
    c.phone AS customer_phone,
    o.status,
    o.costo_fob,
    o.shipping_logistica,
    o.shipping_ecuador,
    o.ad_valorem,
    o.margen_markdown,
    o.precio_venta,
    o.comision_vendedor,
    o.created_at
FROM orders o
JOIN customers c ON o.customer_id = c.id;

-- ✅ LISTO. COPIA ESTO Y CORRELO EN EL SQL EDITOR DE SUPABASE.
