-- Migration: Add per‑item financial fields
-- Up
BEGIN;
ALTER TABLE order_items
  ADD COLUMN tracking_number VARCHAR(255),
  ADD COLUMN margin_percent NUMERIC(6,2),
  ADD COLUMN supplier_name VARCHAR(255);

-- Populate first item per order with existing global values (if any)
WITH first_item AS (
  SELECT id, order_id,
         ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY id) AS rn
  FROM order_items
)
UPDATE order_items oi
SET
  tracking_number = o.tracking_number,
  margin_percent   = o.margen_markdown,
  supplier_name    = NULL  -- no historic supplier name, keep NULL
FROM orders o, first_item f
WHERE oi.id = f.id
  AND f.rn = 1
  AND oi.order_id = o.id;
COMMIT;

-- Down
BEGIN;
ALTER TABLE order_items
  DROP COLUMN tracking_number,
  DROP COLUMN margin_percent,
  DROP COLUMN supplier_name;
COMMIT;
