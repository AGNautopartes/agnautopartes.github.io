-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Enums
CREATE TYPE customer_source AS ENUM ('fb_ad', 'whatsapp', 'web_form', 'manual');
CREATE TYPE order_status AS ENUM ('Solicitado', 'Cotizado', 'Comprado', 'En Tránsito', 'Entregado');

-- 2. Customers Table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    source customer_source DEFAULT 'manual',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Orders Table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    part_name TEXT NOT NULL,
    vin VARCHAR(17),
    status order_status DEFAULT 'Solicitado',
    vendor_name TEXT,
    buy_link TEXT,
    tracking_number TEXT,
    estimated_arrival DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Financials Table
CREATE TABLE financials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    cost_fob DECIMAL(10, 2) DEFAULT 0.00,
    shipping_cost DECIMAL(10, 2) DEFAULT 0.00,
    taxes DECIMAL(10, 2) DEFAULT 0.00,
    other_expenses DECIMAL(10, 2) DEFAULT 0.00,
    margin_percent DECIMAL(5, 2) DEFAULT 20.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create View for Final Price Calculation
-- Using a view instead of a computed column for better flexibility in Supabase
CREATE VIEW order_financial_summary AS
SELECT 
    f.order_id,
    o.part_name,
    (f.cost_fob + f.shipping_cost + f.taxes + f.other_expenses) as total_costs,
    f.margin_percent,
    ((f.cost_fob + f.shipping_cost + f.taxes + f.other_expenses) * (1 + f.margin_percent / 100)) as final_price
FROM financials f
JOIN orders o ON f.order_id = o.id;

-- 6. Quotes Table (Historical Data)
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name TEXT,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_financials_updated_at BEFORE UPDATE ON financials FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Enable Realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE customers;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE financials;
