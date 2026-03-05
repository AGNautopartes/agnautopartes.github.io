-- Migration: Enable Multi-Item Orders

-- 1. Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    part_name TEXT NOT NULL,
    part_number TEXT,
    quantity INTEGER DEFAULT 1,
    cost_fob DECIMAL(10, 2) DEFAULT 0.00,
    sale_price DECIMAL(10, 2) DEFAULT 0.00,
    vendor_name TEXT,
    supplier_url TEXT,
    image_data TEXT, -- Base64 encoded image for saved quotes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Migrate existing data from orders to order_items
-- We assume current cost_fob in financials applies to the first item created
    INSERT INTO order_items (order_id, part_name, cost_fob, sale_price, vendor_name, supplier_url)
    SELECT 
        o.id, 
        o.part_name, 
        COALESCE(f.cost_fob, 0),
        COALESCE(((f.cost_fob + f.shipping_cost + f.taxes + f.other_expenses) * (1 + f.margin_percent / 100)), 0),
        o.vendor_name, 
        o.supplier_url
FROM orders o
LEFT JOIN financials f ON o.id = f.order_id;

-- 3. Update quotes table to allow linking
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

-- 4. Clean up orders table (Optional: keep columns for a bit if needed, but here we mark for removal or nullability)
-- ALTER TABLE orders DROP COLUMN part_name;
-- ALTER TABLE orders DROP COLUMN vendor_name;
-- ALTER TABLE orders DROP COLUMN buy_link;

-- 5. Add triggers for order_items updated_at
CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 6. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
