-- Migration: Fix items fields - add missing columns, unify vendor fields
-- Up
BEGIN;

-- 1. Add missing columns to order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS order_date DATE,
  ADD COLUMN IF NOT EXISTS estimated_arrival DATE;

-- 2. Migrate existing supplier_name data to vendor_name
UPDATE order_items
  SET vendor_name = supplier_name
  WHERE vendor_name IS NULL AND supplier_name IS NOT NULL;

-- 3. Remove redundant supplier_name column
ALTER TABLE order_items
  DROP COLUMN IF EXISTS supplier_name;

COMMIT;

-- Down
BEGIN;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);

UPDATE order_items
  SET supplier_name = vendor_name
  WHERE supplier_name IS NULL AND vendor_name IS NOT NULL;

ALTER TABLE order_items
  DROP COLUMN IF EXISTS order_date,
  DROP COLUMN IF EXISTS estimated_arrival;

COMMIT;