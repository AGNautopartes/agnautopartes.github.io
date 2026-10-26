-- Borrado manual y atómico de una orden con todos sus registros relacionados.
-- Rollback:
-- DROP FUNCTION IF EXISTS public.delete_order_with_relations(uuid);

CREATE OR REPLACE FUNCTION public.delete_order_with_relations(
    p_order_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_order_id uuid;
BEGIN
    DELETE FROM public.order_documents WHERE order_id = p_order_id;
    DELETE FROM public.order_notes WHERE order_id = p_order_id;
    DELETE FROM public.order_history WHERE order_id = p_order_id;
    DELETE FROM public.order_items WHERE order_id = p_order_id;
    DELETE FROM public.financials WHERE order_id = p_order_id;

    DELETE FROM public.orders
    WHERE id = p_order_id
    RETURNING id INTO deleted_order_id;

    RETURN deleted_order_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_order_with_relations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_order_with_relations(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_order_with_relations(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_order_with_relations(uuid) TO service_role;
