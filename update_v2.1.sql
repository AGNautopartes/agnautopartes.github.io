-- ============================================================
-- AGN Autopartes ERP — ACTUALIZACIÓN v2.1 (CORREGIDA)
-- OBJETIVO: Añadir IDs legibles (ORD-1, ORD-2...) y corregir visibilidad
-- ============================================================

-- 1. Crear secuencia para los IDs
CREATE SEQUENCE IF NOT EXISTS order_id_seq START WITH 1;

-- 2. Añadir columna readable_id a la tabla orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS readable_id TEXT UNIQUE;

-- 3. Función para auto-generar el ID (ej: ORD-1)
CREATE OR REPLACE FUNCTION generate_readable_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.readable_id IS NULL THEN
        NEW.readable_id := 'ORD-' || nextval('order_id_seq');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger para asignar el ID al insertar
DROP TRIGGER IF EXISTS trg_generate_readable_id ON orders;
CREATE TRIGGER trg_generate_readable_id
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_readable_id();

-- 5. Llenar IDs para órdenes existentes (CORREGIDO USANDO CTE)
WITH numbered_orders AS (
    SELECT id, 'ORD-' || row_number() OVER (ORDER BY created_at) as new_id
    FROM orders
    WHERE readable_id IS NULL
)
UPDATE orders
SET readable_id = numbered_orders.new_id
FROM numbered_orders
WHERE orders.id = numbered_orders.id;

-- Ajustar la secuencia para que no choque con los IDs ya asignados
SELECT setval('order_id_seq', (SELECT count(*) FROM orders));

-- 6. Actualizar la vista para incluir el readable_id
DROP VIEW IF EXISTS order_financial_summary;
CREATE VIEW order_financial_summary AS
SELECT
    f.order_id,
    o.readable_id,
    o.part_name,
    o.vehicle_brand,
    o.vehicle_model,
    o.vehicle_year,
    c.full_name AS customer_name,
    c.phone AS customer_phone,
    o.status,
    o.estimated_delivery_client,
    f.cost_fob,
    f.shipping_cost,
    f.customs_cost,
    f.taxes,
    f.other_expenses,
    f.sale_price,
    (f.cost_fob + f.shipping_cost + f.customs_cost + f.taxes + f.other_expenses) AS total_cost,
    (f.sale_price - (f.cost_fob + f.shipping_cost + f.customs_cost + f.taxes + f.other_expenses)) AS profit
FROM financials f
JOIN orders o ON f.order_id = o.id
JOIN customers c ON o.customer_id = c.id;

-- ✅ LISTO. Corre esto en el SQL Editor de Supabase.
