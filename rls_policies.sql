-- ============================================================
-- AGN Autopartes — SEGURIDAD RLS
-- Instrucciones: Ejecutar en el SQL Editor de Supabase
-- Este script habilita RLS y bloquea el acceso directo anon/authenticated.
-- ============================================================

-- 1. Habilitar RLS en todas las tablas
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar cualquier política existente (limpieza)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON ' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- 3. Explicación: No creamos políticas para 'anon' ni 'authenticated'.
-- Supabase por defecto DENIEGA todo acceso si RLS está activo y no hay políticas.
-- El backend (Vercel) seguirá funcionando porque usa la 'service_role' key,
-- la cual salta (bypass) todas las reglas de RLS.

-- NOTA: Si en el futuro se requiere acceso de lectura público para alguna tabla específica (ej: tracking),
-- se deberá agregar una política específica de SELECT para el rol 'anon'.
