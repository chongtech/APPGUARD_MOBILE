-- Reconcile RPC contract drift between the mobile app and the public SQL catalog.

DO $$
BEGIN
  IF to_regprocedure('public.admin_get_all_news(integer)') IS NOT NULL
    AND to_regprocedure('public.admin_get_all_news_legacy(integer)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.admin_get_all_news(integer) RENAME TO admin_get_all_news_legacy';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regprocedure('public.admin_get_condominium_subscriptions()') IS NOT NULL
    AND to_regprocedure('public.admin_get_condominium_subscriptions_with_alerts_sent()') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.admin_get_condominium_subscriptions() RENAME TO admin_get_condominium_subscriptions_with_alerts_sent';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regprocedure('public.get_notifications(integer)') IS NOT NULL
    AND to_regprocedure('public.get_notifications_legacy(integer)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.get_notifications(integer) RENAME TO get_notifications_legacy';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regprocedure('public.mark_notification_read(integer)') IS NOT NULL
    AND to_regprocedure('public.mark_notification_read_unscoped(integer)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.mark_notification_read(integer) RENAME TO mark_notification_read_unscoped';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_residents_by_condominium(p_condominium_id integer)
RETURNS SETOF public.residents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.residents
  WHERE condominium_id = p_condominium_id
  ORDER BY name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_condo_visitor_photo_setting(p_condo_id integer, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.condominiums
  SET visitor_photo_enabled = p_enabled
  WHERE id = p_condo_id;
END;
$function$;
