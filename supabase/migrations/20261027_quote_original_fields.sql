-- Campos del cotizador original. Aplicar antes de desplegar el código que los usa.
-- La reversión no debe eliminar columnas con datos de usuarios.
BEGIN;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS delivery_time text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS editor_state jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS shipping_usd numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS part_brand text;
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS option_name text;
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS internal_reference text;
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS warranty text;

CREATE OR REPLACE FUNCTION public.generate_quotation_id()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_year text := to_char(now(), 'YYYY');
    v_next integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('agn_quotation_number_' || v_year));
    SELECT COALESCE(MAX(split_part(readable_id, '-', 3)::integer), 0) + 1 INTO v_next
    FROM public.quotations
    WHERE readable_id ~ ('^Q-' || v_year || '-[0-9]+$');
    RETURN 'Q-' || v_year || '-' || lpad(v_next::text, greatest(3, length(v_next::text)), '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.save_quotation_draft(p_quotation jsonb, p_items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_quotation_id uuid;
BEGIN
    v_quotation_id := NULLIF(p_quotation->>'id', '')::uuid;
    IF v_quotation_id IS NULL THEN
        INSERT INTO public.quotations (readable_id, customer_name, vehicle_brand, vehicle_model, vehicle_year, whatsapp_phone, delivery_time, editor_state, notes, status, total_usd, total_vat_usd)
        VALUES (public.generate_quotation_id(), NULLIF(p_quotation->>'customer_name',''), NULLIF(p_quotation->>'vehicle_brand',''), NULLIF(p_quotation->>'vehicle_model',''), NULLIF(p_quotation->>'vehicle_year',''), NULLIF(p_quotation->>'whatsapp_phone',''), NULLIF(p_quotation->>'delivery_time',''), COALESCE(p_quotation->'editor_state','{}'::jsonb), NULLIF(p_quotation->>'notes',''), COALESCE(NULLIF(p_quotation->>'status',''),'borrador'), COALESCE((p_quotation->>'total_usd')::numeric,0), COALESCE((p_quotation->>'total_vat_usd')::numeric,0))
        RETURNING id INTO v_quotation_id;
    ELSE
        UPDATE public.quotations SET customer_name=NULLIF(p_quotation->>'customer_name',''), vehicle_brand=NULLIF(p_quotation->>'vehicle_brand',''), vehicle_model=NULLIF(p_quotation->>'vehicle_model',''), vehicle_year=NULLIF(p_quotation->>'vehicle_year',''), whatsapp_phone=NULLIF(p_quotation->>'whatsapp_phone',''), delivery_time=NULLIF(p_quotation->>'delivery_time',''), editor_state=COALESCE(p_quotation->'editor_state','{}'::jsonb), notes=NULLIF(p_quotation->>'notes',''), status=COALESCE(NULLIF(p_quotation->>'status',''),status), total_usd=COALESCE((p_quotation->>'total_usd')::numeric,0), total_vat_usd=COALESCE((p_quotation->>'total_vat_usd')::numeric,0) WHERE id=v_quotation_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
        DELETE FROM public.quotation_items WHERE quotation_id=v_quotation_id;
    END IF;
    INSERT INTO public.quotation_items (quotation_id, part_name, part_number, part_brand, option_name, description, internal_reference, warranty, supplier_url, image_url, price_usd, shipping_usd, margin_pct, final_price_usd, final_price_vat_usd, sort_order)
    SELECT v_quotation_id, COALESCE(NULLIF(item->>'part_name',''),'Sin nombre'), NULLIF(item->>'part_number',''), NULLIF(item->>'part_brand',''), NULLIF(item->>'option_name',''), NULLIF(item->>'description',''), NULLIF(item->>'internal_reference',''), NULLIF(item->>'warranty',''), NULLIF(item->>'supplier_url',''), NULLIF(item->>'image_url',''), COALESCE((item->>'price_usd')::numeric,0), COALESCE((item->>'shipping_usd')::numeric,0), COALESCE((item->>'margin_pct')::numeric,0), COALESCE((item->>'final_price_usd')::numeric,0), COALESCE((item->>'final_price_vat_usd')::numeric,0), ordinality-1
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS entries(item, ordinality);
    RETURN v_quotation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_quotation_draft(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_quotation_draft(jsonb,jsonb) TO service_role;
COMMIT;
