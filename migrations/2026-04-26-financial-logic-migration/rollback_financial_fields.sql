-- ============================================================
-- AGN Autopartes ERP - FINANCIAL LOGIC MIGRATION ROLLBACK
-- ============================================================
-- Rollback: Remove enhanced financial fields added in financial logic migration
-- ============================================================

-- 1. Drop the custom functions we created
DROP FUNCTION IF EXISTS calculate_price_with_vat(DECIMAL);
DROP FUNCTION IF EXISTS calculate_margin_from_cost_and_price(DECIMAL, DECIMAL);
DROP FUNCTION IF EXISTS calculate_price_from_cost_and_margin(DECIMAL, DECIMAL);

-- 2. Drop the updated view
DROP VIEW IF EXISTS order_financial_summary;

-- 3. Remove added columns from financials table
ALTER TABLE financials
  DROP COLUMN IF EXISTS fob_cost,
  DROP COLUMN IF EXISTS supplier_freight,
  DROP COLUMN IF EXISTS customs_nationalization,
  DROP COLUMN IF EXISTS other_expenses,
  DROP COLUMN IF EXISTS margin_percent,
  DROP COLUMN IF EXISTS price,
  DROP COLUMN IF EXISTS price_with_vat;

-- 4. Remove added column from order_items table
ALTER TABLE order_items
  DROP COLUMN IF EXISTS customs_nationalization;

-- 5. Recreate the original view (based on current schema)
CREATE VIEW order_financial_summary AS
SELECT 
    f.order_id,
    o.part_name,
    (f.cost_fob + f.shipping_cost + f.taxes + f.other_expenses) as total_costs,
    f.margin_percent,
    ((f.cost_fob + f.shipping_cost + f.taxes + f.other_expenses) * (1 + f.margin_percent / 100)) as final_price
FROM financials f
JOIN orders o ON f.order_id = o.id;

COMMIT;