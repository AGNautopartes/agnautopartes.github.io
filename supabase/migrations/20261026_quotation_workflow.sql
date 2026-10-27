-- Cotizaciones editables desde el ERP. No ejecutar automáticamente.
-- Rollback seguro: DROP FUNCTION public.save_quotation_draft(JSONB, JSONB).
-- No eliminar columnas en rollback: podrían contener cotizaciones ya guardadas.
BEGIN;

ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS description TEXT;

CREATE OR REPLACE FUNCTION public.save_quotation_draft(
    p_quotation JSONB,
    p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quotation_id UUID;
    v_readable_id TEXT;
BEGIN
    v_quotation_id := NULLIF(p_quotation->>'id', '')::UUID;

    IF v_quotation_id IS NULL THEN
        v_readable_id := public.generate_quotation_id();
        INSERT INTO public.quotations (
            readable_id, customer_name, vehicle_brand, vehicle_model,
            vehicle_year, whatsapp_phone, notes, status, total_usd, total_vat_usd
        ) VALUES (
            v_readable_id, NULLIF(p_quotation->>'customer_name', ''),
            NULLIF(p_quotation->>'vehicle_brand', ''), NULLIF(p_quotation->>'vehicle_model', ''),
            NULLIF(p_quotation->>'vehicle_year', ''), NULLIF(p_quotation->>'whatsapp_phone', ''),
            NULLIF(p_quotation->>'notes', ''), COALESCE(NULLIF(p_quotation->>'status', ''), 'borrador'),
            COALESCE((p_quotation->>'total_usd')::numeric, 0),
            COALESCE((p_quotation->>'total_vat_usd')::numeric, 0)
        ) RETURNING id INTO v_quotation_id;
    ELSE
        UPDATE public.quotations SET
            customer_name = NULLIF(p_quotation->>'customer_name', ''),
            vehicle_brand = NULLIF(p_quotation->>'vehicle_brand', ''),
            vehicle_model = NULLIF(p_quotation->>'vehicle_model', ''),
            vehicle_year = NULLIF(p_quotation->>'vehicle_year', ''),
            whatsapp_phone = NULLIF(p_quotation->>'whatsapp_phone', ''),
            notes = NULLIF(p_quotation->>'notes', ''),
            status = COALESCE(NULLIF(p_quotation->>'status', ''), status),
            total_usd = COALESCE((p_quotation->>'total_usd')::numeric, 0),
            total_vat_usd = COALESCE((p_quotation->>'total_vat_usd')::numeric, 0)
        WHERE id = v_quotation_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
        DELETE FROM public.quotation_items WHERE quotation_id = v_quotation_id;
    END IF;

    INSERT INTO public.quotation_items (
        quotation_id, part_name, part_number, description, supplier_url,
        image_url, price_usd, margin_pct, final_price_usd,
        final_price_vat_usd, sort_order
    )
    SELECT v_quotation_id, COALESCE(NULLIF(item->>'part_name', ''), 'Sin nombre'),
        NULLIF(item->>'part_number', ''), NULLIF(item->>'description', ''),
        NULLIF(item->>'supplier_url', ''), NULLIF(item->>'image_url', ''),
        COALESCE((item->>'price_usd')::numeric, 0), COALESCE((item->>'margin_pct')::numeric, 0),
        COALESCE((item->>'final_price_usd')::numeric, 0),
        COALESCE((item->>'final_price_vat_usd')::numeric, 0), ordinality - 1
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS entries(item, ordinality);

    RETURN v_quotation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_quotation_draft(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_quotation_draft(JSONB, JSONB) TO service_role;

COMMIT;
