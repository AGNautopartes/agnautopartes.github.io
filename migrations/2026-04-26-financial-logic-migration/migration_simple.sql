ALTER TABLE financials 
  ADD COLUMN IF NOT EXISTS fob_cost DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS supplier_freight DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS customs_nationalization DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS other_expenses DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS margin_percent DECIMAL(5, 2) DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS price_with_vat DECIMAL(10, 2) DEFAULT 0.00;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS fob_cost DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS supplier_freight DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS customs_nationalization DECIMAL(10, 2) DEFAULT 0.00;

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
    COALESCE(SUM(oi.fob_cost), 0) as total_fob,
    COALESCE(SUM(oi.supplier_freight), 0) as total_freight,
    COALESCE(SUM(oi.customs_nationalization), 0) as total_customs,
    COALESCE(SUM(oi.fob_cost + oi.supplier_freight + oi.customs_nationalization), 0) as total_landed_cost,
    CASE 
        WHEN COALESCE(SUM(oi.fob_cost + oi.supplier_freight + oi.customs_nationalization), 0) > 0
        THEN (SUM(oi.margin_percent * (oi.fob_cost + oi.supplier_freight + oi.customs_nationalization)) / 
              NULLIF(SUM(oi.fob_cost + oi.supplier_freight + oi.customs_nationalization), 0))
        ELSE 0
    END as average_margin_percent,
    COALESCE(SUM(oi.price), 0) as total_price,
    COALESCE(SUM(oi.price_with_vat), 0) as total_price_with_vat,
    o.created_at,
    o.updated_at
FROM orders o
JOIN customers c ON o.customer_id = c.id
LEFT JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, o.readable_id, o.part_name, o.items_json, o.vehicle_brand, o.vehicle_model, o.vehicle_year, 
         c.full_name, c.phone, o.status, o.created_at, o.updated_at;

CREATE OR REPLACE FUNCTION calculate_price_from_cost_and_margin(cost DECIMAL, margin_percent DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
    IF margin_percent >= 100 THEN
        RETURN 0;
    END IF;
    RETURN cost / (1 - margin_percent / 100);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_margin_from_cost_and_price(cost DECIMAL, price DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
    IF cost <= 0 OR price <= 0 THEN
        RETURN 0;
    END IF;
    RETURN ((price - cost) / price) * 100;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_price_with_vat(price DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
    RETURN price * 1.15;
END;
$$ LANGUAGE plpgsql;