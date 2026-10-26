-- P0 stabilization: persisted alarms and atomic order item replacement.

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS alarm boolean NOT NULL DEFAULT false;

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS order_date date,
    ADD COLUMN IF NOT EXISTS estimated_arrival date;

CREATE OR REPLACE FUNCTION public.replace_order_items(
    p_order_id uuid,
    p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.order_items WHERE order_id = p_order_id;

    INSERT INTO public.order_items (
        order_id,
        part_name,
        part_number,
        quantity,
        cost_fob,
        fob_cost,
        supplier_freight,
        customs_nationalization,
        sale_price,
        price,
        price_with_vat,
        margin_percent,
        item_status,
        vendor_name,
        supplier_url,
        tracking_number,
        order_date,
        estimated_arrival,
        updated_at
    )
    SELECT
        p_order_id,
        COALESCE(item.part_name, 'Sin nombre'),
        COALESCE(item.part_number, ''),
        COALESCE(item.quantity, 1),
        COALESCE(item.cost_fob, 0),
        COALESCE(item.fob_cost, 0),
        COALESCE(item.supplier_freight, 0),
        COALESCE(item.customs_nationalization, 0),
        COALESCE(item.sale_price, 0),
        COALESCE(item.price, 0),
        COALESCE(item.price_with_vat, 0),
        item.margin_percent,
        COALESCE(item.item_status, 'Solicitado'),
        COALESCE(item.vendor_name, ''),
        COALESCE(item.supplier_url, ''),
        COALESCE(item.tracking_number, ''),
        item.order_date,
        item.estimated_arrival,
        now()
    FROM jsonb_to_recordset(COALESCE(p_items, '[]'::jsonb)) AS item(
        part_name text,
        part_number text,
        quantity integer,
        cost_fob numeric,
        fob_cost numeric,
        supplier_freight numeric,
        customs_nationalization numeric,
        sale_price numeric,
        price numeric,
        price_with_vat numeric,
        margin_percent numeric,
        item_status text,
        vendor_name text,
        supplier_url text,
        tracking_number text,
        order_date date,
        estimated_arrival date
    );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_order_items(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_order_items(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.replace_order_items(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_order_items(uuid, jsonb) TO service_role;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.replace_order_items(uuid, jsonb);
-- ALTER TABLE public.order_items DROP COLUMN IF EXISTS estimated_arrival;
-- ALTER TABLE public.order_items DROP COLUMN IF EXISTS order_date;
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS alarm;
