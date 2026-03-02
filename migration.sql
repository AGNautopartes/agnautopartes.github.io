-- ============================================================
-- AGN Autopartes ERP — MIGRATION v2
-- Ejecutar en Supabase: SQL Editor → New Query → Pegar y correr
-- ============================================================

-- 1. NUEVOS ESTADOS DE ORDEN
-- Añadir los nuevos valores al ENUM existente
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Tránsito 1 (Prov→Log)';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Tránsito 2 (Log→EC)';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'En Aduana';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Cancelado';

-- 2. NUEVAS COLUMNAS EN orders (vehículo y parte mejorada)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_brand TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_model TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_year TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS part_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_client DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. NUEVAS COLUMNAS EN financials (precio de venta)
ALTER TABLE financials ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE financials ADD COLUMN IF NOT EXISTS customs_cost DECIMAL(10,2) DEFAULT 0.00;

-- 4. TABLA: Historial de auditoría por orden
CREATE TABLE IF NOT EXISTS order_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    changed_by TEXT NOT NULL,         -- nombre del usuario que hizo el cambio
    field_changed TEXT NOT NULL,      -- 'status', 'tracking', 'financials', etc.
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TABLA: Notas internas por orden
CREATE TABLE IF NOT EXISTS order_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. TABLA: Archivos y documentos adjuntos
CREATE TABLE IF NOT EXISTS order_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,           -- URL de Supabase Storage
    file_type TEXT,                   -- 'invoice', 'customs', 'photo', 'other'
    uploaded_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. TABLA: Usuarios administrativos y empleados
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,      -- Bcrypt hash, NUNCA en texto plano
    role TEXT NOT NULL DEFAULT 'operador',  -- 'admin', 'operador', 'visualizador'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. HABILITAR REALTIME EN NUEVAS TABLAS
ALTER PUBLICATION supabase_realtime ADD TABLE order_history;
ALTER PUBLICATION supabase_realtime ADD TABLE order_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE order_documents;

-- 9. ACTUALIZAR LA VISTA DE RESUMEN FINANCIERO
DROP VIEW IF EXISTS order_financial_summary;
CREATE VIEW order_financial_summary AS
SELECT
    f.order_id,
    o.part_name,
    o.vehicle_brand,
    o.vehicle_model,
    o.vehicle_year,
    c.full_name as customer_name,
    c.phone as customer_phone,
    o.status,
    o.estimated_delivery_client,
    f.cost_fob,
    f.shipping_cost,
    f.customs_cost,
    f.taxes,
    f.other_expenses,
    f.sale_price,
    (f.cost_fob + f.shipping_cost + f.customs_cost + f.taxes + f.other_expenses) as total_cost,
    (f.sale_price - (f.cost_fob + f.shipping_cost + f.customs_cost + f.taxes + f.other_expenses)) as profit
FROM financials f
JOIN orders o ON f.order_id = o.id
JOIN customers c ON o.customer_id = c.id;

-- ============================================================
-- LISTO. Verifica en Table Editor que las tablas existen.
-- ============================================================
