-- Migration: Add per-item status field
-- Up
BEGIN;
ALTER TABLE order_items
  ADD COLUMN item_status VARCHAR(30) NOT NULL DEFAULT 'Solicitado';
COMMIT;

-- Down
BEGIN;
ALTER TABLE order_items
  DROP COLUMN item_status;
COMMIT;
