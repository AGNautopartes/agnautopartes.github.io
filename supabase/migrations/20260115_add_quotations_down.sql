-- ROLLBACK: Eliminar sistema de cotizaciones
-- Reversibilidad total

BEGIN;

DROP TRIGGER IF EXISTS trg_quotations_updated_at ON public.quotations;
DROP FUNCTION IF EXISTS public.set_updated_at();
DROP FUNCTION IF EXISTS public.generate_quotation_id();

ALTER TABLE public.orders
    DROP COLUMN IF EXISTS quotation_id;

DROP TABLE IF EXISTS public.quotation_items CASCADE;
DROP TABLE IF EXISTS public.quotations CASCADE;

COMMIT;