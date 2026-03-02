-- ============================================================
-- AGN Autopartes ERP — SCHEMA COMPLETO v2
-- Ejecutar en Supabase: SQL Editor → New Query → Run
-- INSTRUCCIONES: Copia y pega TODO esto en el SQL Editor
-- ============================================================

-- PASO 1: Extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PASO 2: Eliminar tipos ENUM si existen (para recrear limpio)
DROP TYPE IF EXISTS customer_source CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;

-- PASO 3: Crear ENUMs con TODOS los estados
CREATE TYPE customer_source AS ENUM ('fb_ad', 'whatsapp', 'web_form', 'manual', 'alex_assistant');

CREATE TYPE order_status AS ENUM (
    'Solicitado',
    'Cotizado',
    'Comprado',
    'Tránsito 1 (Prov→Log)',
    'Tránsito 2 (Log→EC)',
    'En Aduana',
    'Entregado',
    'Cancelado'
);

-- PASO 4: Tabla de Clientes
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    source customer_source DEFAULT 'manual',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PASO 5: Tabla de Órdenes (mejorada)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    part_name TEXT NOT NULL,
    part_number TEXT,
    vin VARCHAR(17),
    vehicle_brand TEXT,
    vehicle_model TEXT,
    vehicle_year TEXT,
    supplier_url TEXT,
    status order_status DEFAULT 'Solicitado',
    vendor_name TEXT,
    tracking_number TEXT,
    estimated_arrival DATE,
    estimated_delivery_client DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PASO 6: Tabla de Financieros
CREATE TABLE IF NOT EXISTS financials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    cost_fob DECIMAL(10, 2) DEFAULT 0.00,
    shipping_cost DECIMAL(10, 2) DEFAULT 0.00,
    customs_cost DECIMAL(10, 2) DEFAULT 0.00,
    taxes DECIMAL(10, 2) DEFAULT 0.00,
    other_expenses DECIMAL(10, 2) DEFAULT 0.00,
    sale_price DECIMAL(10, 2) DEFAULT 0.00,
    margin_percent DECIMAL(5, 2) DEFAULT 20.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PASO 7: Tabla de Cotizaciones (histórico)
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name TEXT,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PASO 8: Historial de auditoría
CREATE TABLE IF NOT EXISTS order_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    changed_by TEXT NOT NULL DEFAULT 'sistema',
    field_changed TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PASO 9: Notas internas
CREATE TABLE IF NOT EXISTS order_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    author TEXT NOT NULL DEFAULT 'Admin',
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PASO 10: Documentos adjuntos
CREATE TABLE IF NOT EXISTS order_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT DEFAULT 'other',
    uploaded_by TEXT NOT NULL DEFAULT 'Admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PASO 11: Usuarios del sistema ERP
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operador',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PASO 12: Vista de resumen financiero
DROP VIEW IF EXISTS order_financial_summary;
CREATE VIEW order_financial_summary AS
SELECT
    f.order_id,
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

-- PASO 13: Triggers para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_financials_updated_at ON financials;
CREATE TRIGGER update_financials_updated_at
    BEFORE UPDATE ON financials FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- PASO 14: Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE customers;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE financials;
ALTER PUBLICATION supabase_realtime ADD TABLE order_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE order_history;

-- ✅ LISTO. Verifica en Table Editor que todas las tablas aparecen.
