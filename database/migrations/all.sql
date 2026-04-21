-- ============================================================
-- Consolidated SQL Catalog - EntryFlow / APPGUARD_MOBILE
-- This file is the single local source of truth for Supabase SQL.
-- Sections:
--   1. Consolidated schema deltas and supporting objects
--   2. Compatibility reconciliation for legacy overloaded RPC names
--   3. Canonical public RPC catalog
-- ============================================================

-- ============================================================
-- 1. Consolidated Schema Deltas
-- ============================================================

-- Subscription management tables and bootstrap objects.
CREATE TABLE IF NOT EXISTS public.app_pricing_rules (
  id SERIAL PRIMARY KEY,
  min_residents INTEGER NOT NULL,
  max_residents INTEGER,
  price_per_resident NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'AOA' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.condominium_subscriptions (
  id SERIAL PRIMARY KEY,
  condominium_id INTEGER NOT NULL REFERENCES public.condominiums(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,
  last_payment_date DATE,
  next_due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  custom_price_per_resident NUMERIC(10, 2),
  discount_percentage NUMERIC(5, 2) DEFAULT 0,
  UNIQUE(condominium_id)
);

ALTER TABLE public.condominium_subscriptions
DROP CONSTRAINT IF EXISTS condominium_subscriptions_status_check;

ALTER TABLE public.condominium_subscriptions
ADD CONSTRAINT condominium_subscriptions_status_check
CHECK (status IN ('ACTIVE', 'OVERDUE', 'INACTIVE', 'TRIAL', 'SUSPENDED'));

CREATE OR REPLACE FUNCTION public.create_condominium_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.condominium_subscriptions (condominium_id, status)
  VALUES (NEW.id, 'ACTIVE')
  ON CONFLICT (condominium_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_condominium_created_subscription ON public.condominiums;

CREATE TRIGGER on_condominium_created_subscription
AFTER INSERT ON public.condominiums
FOR EACH ROW
EXECUTE FUNCTION public.create_condominium_subscription();

INSERT INTO public.condominium_subscriptions (condominium_id, status)
SELECT id, 'ACTIVE'
FROM public.condominiums
ON CONFLICT (condominium_id) DO NOTHING;

ALTER TABLE public.app_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominium_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access app_pricing_rules" ON public.app_pricing_rules;
CREATE POLICY "Allow authenticated full access app_pricing_rules"
ON public.app_pricing_rules AS PERMISSIVE FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access condominium_subscriptions" ON public.condominium_subscriptions;
CREATE POLICY "Allow authenticated full access condominium_subscriptions"
ON public.condominium_subscriptions AS PERMISSIVE FOR ALL TO authenticated USING (true);

-- Subscription payments and reporting support.
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id SERIAL PRIMARY KEY,
  condominium_id INTEGER NOT NULL REFERENCES public.condominiums(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'AOA' NOT NULL,
  payment_date DATE NOT NULL,
  reference_period VARCHAR(20),
  status VARCHAR(20) DEFAULT 'PAID' NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_status_check;
ALTER TABLE public.subscription_payments
ADD CONSTRAINT subscription_payments_status_check
CHECK (status IN ('PAID', 'PENDING', 'FAILED', 'PARTIAL'));

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access subscription_payments" ON public.subscription_payments;
CREATE POLICY "Allow authenticated full access subscription_payments"
ON public.subscription_payments AS PERMISSIVE FOR ALL TO authenticated USING (true);

-- Subscription alerts and related access rules.
CREATE TABLE IF NOT EXISTS public.subscription_alerts (
  id SERIAL PRIMARY KEY,
  condominium_id INTEGER NOT NULL REFERENCES public.condominiums(id) ON DELETE CASCADE,
  alert_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference_month TEXT NOT NULL,
  sent_by INTEGER NOT NULL REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscription_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access subscription_alerts" ON public.subscription_alerts;
CREATE POLICY "Allow authenticated full access subscription_alerts"
ON public.subscription_alerts AS PERMISSIVE FOR ALL TO authenticated USING (true);

-- Supporting indexes used by subscription and resident reporting flows.
CREATE INDEX IF NOT EXISTS idx_condominium_subscriptions_condo
ON public.condominium_subscriptions(condominium_id);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_condo_period
ON public.subscription_payments(condominium_id, reference_period);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_status
ON public.subscription_payments(status);

CREATE INDEX IF NOT EXISTS idx_residents_condominium_id
ON public.residents(condominium_id);

-- Resident app adoption reporting view.
CREATE OR REPLACE VIEW public.v_app_adoption_stats AS
SELECT
  c.id AS condominium_id,
  c.name AS condominium_name,
  COUNT(DISTINCT u.id) AS total_units,
  COUNT(DISTINCT r.id) AS total_residents,
  COUNT(DISTINCT CASE WHEN r.has_app_installed THEN r.id END) AS residents_with_app,
  COUNT(DISTINCT CASE WHEN r.has_app_installed THEN u.id END) AS units_with_app,
  ROUND(
    (
      COUNT(DISTINCT CASE WHEN r.has_app_installed THEN r.id END)::NUMERIC
      / NULLIF(COUNT(DISTINCT r.id), 0)::NUMERIC
    ) * 100,
    1
  ) AS resident_adoption_percent,
  ROUND(
    (
      COUNT(DISTINCT CASE WHEN r.has_app_installed THEN u.id END)::NUMERIC
      / NULLIF(COUNT(DISTINCT u.id), 0)::NUMERIC
    ) * 100,
    1
  ) AS unit_coverage_percent
FROM public.condominiums c
LEFT JOIN public.units u ON u.condominium_id = c.id
LEFT JOIN public.residents r ON r.unit_id = u.id
GROUP BY c.id, c.name
ORDER BY condominium_name;

COMMENT ON VIEW public.v_app_adoption_stats IS 'Statistics on resident app adoption per condominium';

-- OTP tables, supporting functions, and rate-limiting trigger.
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,
  resident_id INTEGER REFERENCES public.residents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes'),
  used_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON public.otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON public.otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_codes_resident_id ON public.otp_codes(resident_id);

CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.otp_codes
  WHERE expires_at < NOW() - INTERVAL '1 day';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_otp_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.otp_codes
  WHERE phone = NEW.phone
    AND created_at > NOW() - INTERVAL '1 hour';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Muitas tentativas. Aguarde 1 hora antes de solicitar novo codigo.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_otp_rate_limit ON public.otp_codes;

CREATE TRIGGER trigger_otp_rate_limit
BEFORE INSERT ON public.otp_codes
FOR EACH ROW
EXECUTE FUNCTION public.check_otp_rate_limit();

COMMENT ON TABLE public.otp_codes IS 'Armazena codigos OTP temporarios para verificacao de telefone e reset de PIN';
COMMENT ON COLUMN public.otp_codes.purpose IS 'Tipo de operacao: RESET_PIN, VERIFY_PHONE, etc.';
COMMENT ON COLUMN public.otp_codes.attempts IS 'Numero de tentativas de validacao do codigo';
COMMENT ON COLUMN public.otp_codes.max_attempts IS 'Maximo de tentativas permitidas antes de invalidar o codigo';

-- Visitor photo toggle support on condominiums.
ALTER TABLE public.condominiums
ADD COLUMN IF NOT EXISTS visitor_photo_enabled BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- 2. Compatibility Reconciliation
-- ============================================================

-- Rename public overloads that are unsafe for Supabase/PostgREST RPC routing.
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

-- ============================================================
-- 3. Canonical Public RPC Catalog
-- verify-rpc-signatures.js parses only the block below.
-- ============================================================-- BEGIN CANONICAL RPC CATALOG
-- ============================================================
-- All RPC Functions - EntryFlow (Supabase/PostgreSQL)
-- Generated: 2026-03-28
-- Total functions: 178
-- Source: public schema function definitions
-- ============================================================

-- ----------------------------------------
-- Function: acknowledge_incident
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_incident(p_id uuid, p_guard_id integer)
 RETURNS SETOF incidents
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE incidents
  SET
    status           = 'acknowledged',
    acknowledged_at  = NOW(),
    acknowledged_by  = p_guard_id
  WHERE id = p_id
    AND status NOT IN ('resolved');

  RETURN QUERY
  SELECT *
  FROM incidents
  WHERE id = p_id;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_create_app_pricing_rule
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_app_pricing_rule(p_min_residents integer, p_max_residents integer, p_price_per_resident numeric, p_currency character varying)
 RETURNS app_pricing_rules
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_rule public.app_pricing_rules;
BEGIN
  INSERT INTO public.app_pricing_rules (min_residents, max_residents, price_per_resident, currency)
  VALUES (p_min_residents, p_max_residents, p_price_per_resident, p_currency)
  RETURNING * INTO v_rule;
  
  RETURN v_rule;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_create_condominium
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_condominium(p_data jsonb)
 RETURNS condominiums
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_row public.condominiums;
begin
  insert into public.condominiums (
    name,
    address,
    logo_url,
    latitude,
    longitude,
    gps_radius_meters,
    status,
    phone_number,
    contact_person,
    contact_email,
    manager_name
  )
  values (
    p_data->>'name',
    p_data->>'address',
    p_data->>'logo_url',
    (p_data->>'latitude')::float8,
    (p_data->>'longitude')::float8,
    (p_data->>'gps_radius_meters')::int4,
    coalesce(p_data->>'status', 'ACTIVE'),
    p_data->>'phone_number',
    p_data->>'contact_person',
    p_data->>'contact_email',
    p_data->>'manager_name'
  )
  returning * into v_row;

  return v_row;
end;
$function$
;

-- ----------------------------------------
-- Function: admin_create_device
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_device(p_data jsonb)
 RETURNS devices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.devices;
BEGIN
  INSERT INTO public.devices
  SELECT * FROM jsonb_populate_record(NULL::public.devices, p_data)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_create_news
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_news(p_data jsonb)
 RETURNS condominium_news
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_news condominium_news;
BEGIN
  INSERT INTO condominium_news (
    condominium_id,
    title,
    description,
    content,
    image_url,
    category_id,
    created_at,
    updated_at
  )
  VALUES (
    (p_data->>'condominium_id')::INT4,
    p_data->>'title',
    p_data->>'description',
    p_data->>'content',
    p_data->>'image_url',
    (p_data->>'category_id')::INT4,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_news;

  RETURN v_news;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_create_news_category
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_news_category(p_data jsonb)
 RETURNS news_categories
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_category news_categories;
BEGIN
  INSERT INTO news_categories (
    name,
    label,
    created_at
  )
  VALUES (
    p_data->>'name',
    p_data->>'label',
    NOW()
  )
  RETURNING * INTO v_category;

  RETURN v_category;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_create_resident
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_resident(p_data jsonb)
 RETURNS SETOF residents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  INSERT INTO public.residents (
    name,
    email,
    phone,
    condominium_id,
    unit_id,
    type
  )
  VALUES (
    p_data->>'name',
    p_data->>'email',
    p_data->>'phone',
    (p_data->>'condominium_id')::int,
    (p_data->>'unit_id')::int,
    p_data->>'type'
  )
  RETURNING *;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_create_restaurant
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_restaurant(p_data jsonb)
 RETURNS restaurants
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_row public.restaurants;
  v_rec public.restaurants;
BEGIN
  v_rec := jsonb_populate_record(NULL::public.restaurants, p_data);

  INSERT INTO public.restaurants (name, description, condominium_id, status)
  VALUES (v_rec.name, v_rec.description, v_rec.condominium_id, v_rec.status)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_create_service_type
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_service_type(p_data jsonb)
 RETURNS service_types
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.service_types;
BEGIN
  INSERT INTO public.service_types (name)
  VALUES (p_data->>'name')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_create_sport
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_sport(p_data jsonb)
 RETURNS sports
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_row public.sports;
  v_data record;
BEGIN
  SELECT * INTO v_data
  FROM jsonb_to_record(p_data) AS x(
    name text,
    description text,
    condominium_id int4,
    status text
  );

  INSERT INTO public.sports (name, description, condominium_id, status)
  VALUES (v_data.name, v_data.description, v_data.condominium_id, v_data.status)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_create_staff_with_pin
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_staff_with_pin(p_first_name text, p_last_name text, p_condominium_id integer, p_role text, p_pin_cleartext text, p_photo_url text)
 RETURNS staff
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_row public.staff;
  v_pin_hash text;
begin
  if length(p_pin_cleartext) < 4 or length(p_pin_cleartext) > 6 then
    raise exception 'PIN deve ter entre 4 e 6 dÃƒÂ­gitos';
  end if;

  v_pin_hash := crypt(p_pin_cleartext, gen_salt('bf', 10));

  insert into public.staff (
    first_name, last_name, condominium_id, role, pin_hash, photo_url
  )
  values (
    p_first_name, p_last_name, p_condominium_id, p_role, v_pin_hash, p_photo_url
  )
  returning * into v_row;

  return v_row;
end;
$function$
;

-- ----------------------------------------
-- Function: admin_create_subscription_payment
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_subscription_payment(p_condominium_id integer, p_amount numeric, p_currency character varying, p_payment_date date, p_reference_period character varying, p_status character varying, p_notes text)
 RETURNS subscription_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payment public.subscription_payments;
BEGIN
  INSERT INTO public.subscription_payments (
    condominium_id, amount, currency, payment_date, reference_period, status, notes
  ) VALUES (
    p_condominium_id, p_amount, COALESCE(p_currency, 'AOA'), p_payment_date, p_reference_period, COALESCE(p_status, 'PAID'), p_notes
  )
  RETURNING * INTO v_payment;
  
  -- Also update the condominium's last payment date
  UPDATE public.condominium_subscriptions
  SET last_payment_date = p_payment_date, updated_at = NOW()
  WHERE condominium_id = p_condominium_id;

  RETURN v_payment;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_create_unit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_unit(p_data jsonb)
 RETURNS units
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_row public.units;
begin
  insert into public.units (
    condominium_id,
    code_block,
    number,
    floor,
    building_name
  )
  values (
    (p_data->>'condominium_id')::int,
    p_data->>'code_block',
    p_data->>'number',
    nullif(p_data->>'floor','')::int,
    nullif(p_data->>'building_name','')
  )
  returning * into v_row;

  return v_row;
end;
$function$
;

-- ----------------------------------------
-- Function: admin_create_visit_type
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_visit_type(p_data jsonb)
 RETURNS visit_types
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.visit_types;
BEGIN
  INSERT INTO public.visit_types (
    name,
    icon_key,
    requires_service_type,
    requires_restaurant,
    requires_sport
  ) VALUES (
    p_data->>'name',
    COALESCE(p_data->>'icon_key', 'user'),
    COALESCE((p_data->>'requires_service_type')::boolean, false),
    COALESCE((p_data->>'requires_restaurant')::boolean, false),
    COALESCE((p_data->>'requires_sport')::boolean, false)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_app_pricing_rule
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_app_pricing_rule(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.app_pricing_rules WHERE id = p_id;
  RETURN FOUND;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_condominium
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_condominium(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.condominiums
  WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_device
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_device(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.devices
  WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_incident
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_incident(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.incidents
  WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_news
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_news(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM condominium_news WHERE id = p_id;
  RETURN FOUND;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_news_category
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_news_category(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- First, set category_id to NULL for any news using this category
  UPDATE condominium_news SET category_id = NULL WHERE category_id = p_id;

  -- Then delete the category
  DELETE FROM news_categories WHERE id = p_id;
  RETURN FOUND;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_resident
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_resident(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.residents
  WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_restaurant
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_restaurant(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.restaurants
  WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_service_type
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_service_type(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.service_types
  WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_sport
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_sport(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.sports
  WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_staff
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_staff(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.staff
  WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_unit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_unit(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.units
  WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_delete_visit_type
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_visit_type(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.visit_types
  WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_all_devices
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_all_devices()
 RETURNS SETOF devices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.devices
  ORDER BY id;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_all_incidents
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_all_incidents(p_condominium_id integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, reported_at timestamp with time zone, resident_id integer, resident_name text, resident_condominium_id integer, resident_unit_id integer, unit_code_block text, unit_number text, unit_floor text, unit_building_name text, description text, type text, type_label text, status text, status_label text, photo_path text, acknowledged_at timestamp with time zone, acknowledged_by integer, guard_notes text, resolved_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.reported_at,
    i.resident_id,
    res.name AS resident_name,
    res.condominium_id AS resident_condominium_id,
    res.unit_id AS resident_unit_id,
    u.code_block AS unit_code_block,
    u.number AS unit_number,
    u.floor AS unit_floor,
    u.building_name AS unit_building_name,
    i.description,
    i.type,
    it.label AS type_label,
    i.status,
    ist.label AS status_label,
    i.photo_path,
    i.acknowledged_at,
    i.acknowledged_by,
    i.guard_notes,
    i.resolved_at
  FROM incidents i
  INNER JOIN residents res ON i.resident_id = res.id
  LEFT JOIN units u ON res.unit_id = u.id
  LEFT JOIN incident_types it ON i.type = it.code
  LEFT JOIN incident_statuses ist ON i.status = ist.code
  WHERE (p_condominium_id IS NULL OR res.condominium_id = p_condominium_id)
  ORDER BY i.reported_at DESC;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_all_news
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_all_news(p_condominium_id integer DEFAULT NULL::integer, p_limit integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text, p_category_id integer DEFAULT NULL::integer, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id integer DEFAULT NULL::integer)
 RETURNS SETOF condominium_news
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT cn.*
  FROM condominium_news cn
  WHERE
    (p_condominium_id IS NULL OR cn.condominium_id = p_condominium_id)
    AND (p_search IS NULL OR cn.title ILIKE '%' || p_search || '%'
      OR cn.description ILIKE '%' || p_search || '%'
      OR cn.content ILIKE '%' || p_search || '%')
    AND (p_category_id IS NULL OR cn.category_id = p_category_id)
    AND (p_date_from IS NULL OR cn.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR cn.created_at::date <= p_date_to)
    AND (p_after_created_at IS NULL
      OR cn.created_at < p_after_created_at
      OR (cn.created_at = p_after_created_at AND cn.id < p_after_id))
  ORDER BY cn.created_at DESC, cn.id DESC
  LIMIT COALESCE(p_limit, 1000);
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_all_news_legacy
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_all_news_legacy(p_condominium_id integer DEFAULT NULL::integer)
 RETURNS SETOF condominium_news
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF p_condominium_id IS NOT NULL THEN
    RETURN QUERY
    SELECT cn.*
    FROM condominium_news cn
    WHERE cn.condominium_id = p_condominium_id
    ORDER BY cn.created_at DESC;
  ELSE
    RETURN QUERY
    SELECT cn.*
    FROM condominium_news cn
    ORDER BY cn.created_at DESC;
  END IF;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_all_staff
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_all_staff(p_condominium_id integer DEFAULT NULL::integer)
 RETURNS TABLE(id integer, first_name text, last_name text, condominium_id integer, role text, pin_hash text, photo_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  return query
  select
    s.id,
    s.first_name,
    s.last_name,
    s.condominium_id,
    s.role,
    s.pin_hash,
    s.photo_url
  from public.staff s
  where p_condominium_id is null or s.condominium_id = p_condominium_id
  order by s.first_name, s.last_name;
end;
$function$
;

-- ----------------------------------------
-- Function: admin_get_all_units
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_all_units(p_condominium_id integer DEFAULT NULL::integer)
 RETURNS TABLE(id integer, condominium_id integer, code_block text, number text, floor text, building_name text, created_at timestamp with time zone, residents jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.condominium_id,
    u.code_block,
    u.number,
    u.floor,
    u.building_name,
    u.created_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'name', r.name,
            'email', r.email,
            'phone', r.phone,
            'condominium_id', r.condominium_id,
            'unit_id', r.unit_id,
            'created_at', r.created_at
          )
        )
        FROM residents r
        WHERE r.unit_id = u.id
      ),
      '[]'::jsonb
    ) AS residents
  FROM units u
  WHERE 
    (p_condominium_id IS NULL OR u.condominium_id = p_condominium_id)
  ORDER BY u.condominium_id, u.code_block, u.number;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_all_visits
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_all_visits(p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_condominium_id integer DEFAULT NULL::integer)
 RETURNS TABLE(id integer, created_at timestamp with time zone, condominium_id integer, visitor_name text, visitor_doc text, visitor_phone text, visit_type_id integer, visit_type text, service_type_id integer, service_type text, restaurant_id uuid, restaurant_name text, sport_id uuid, sport_name text, unit_id integer, unit_block text, unit_number text, reason text, photo_url text, qr_token text, qr_expires_at timestamp with time zone, check_in_at timestamp with time zone, check_out_at timestamp with time zone, status text, approval_mode text, guard_id integer, device_id uuid, sync_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.created_at,
    v.condominium_id,
    v.visitor_name,
    v.visitor_doc,
    v.visitor_phone,
    v.visit_type_id,
    vt.name AS visit_type,
    v.service_type_id,
    st.name AS service_type,
    v.restaurant_id,
    r.name AS restaurant_name,
    v.sport_id,
    s.name AS sport_name,
    v.unit_id,
    u.code_block AS unit_block,
    u.number AS unit_number,
    v.reason,
    v.photo_url,
    v.qr_token,
    v.qr_expires_at,
    v.check_in_at,
    v.check_out_at,
    v.status,
    v.approval_mode,
    v.guard_id,
    v.device_id,
    'SINCRONIZADO'::text AS sync_status
  FROM visits v
  LEFT JOIN visit_types vt ON v.visit_type_id = vt.id
  LEFT JOIN service_types st ON v.service_type_id = st.id
  LEFT JOIN restaurants r ON v.restaurant_id = r.id
  LEFT JOIN sports s ON v.sport_id = s.id
  LEFT JOIN units u ON v.unit_id = u.id
  WHERE
    (p_condominium_id IS NULL OR v.condominium_id = p_condominium_id)
    AND (p_start_date IS NULL OR v.check_in_at >= p_start_date)
    AND (p_end_date   IS NULL OR v.check_in_at <= p_end_date)
  ORDER BY v.check_in_at DESC;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_all_visits_filtered
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_all_visits_filtered(p_start_date timestamp without time zone DEFAULT NULL::timestamp without time zone, p_end_date timestamp without time zone DEFAULT NULL::timestamp without time zone, p_condominium_id integer DEFAULT NULL::integer, p_visit_type text DEFAULT NULL::text, p_service_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id integer, condominium_id integer, visitor_name text, visitor_doc text, visitor_phone text, visit_type text, visit_type_id integer, service_type text, service_type_id integer, restaurant_id integer, restaurant_name text, sport_id integer, sport_name text, unit_id integer, unit_block text, unit_number text, reason text, photo_url text, qr_token text, qr_expires_at timestamp without time zone, check_in_at timestamp without time zone, check_out_at timestamp without time zone, status text, approval_mode text, guard_id integer, device_id text, sync_status text, condominium_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.condominium_id,
    v.visitor_name,
    v.visitor_doc,
    v.visitor_phone,
    vt.name AS visit_type,
    v.visit_type_id,
    st.name AS service_type,
    v.service_type_id,
    v.restaurant_id,
    r.name AS restaurant_name,
    v.sport_id,
    sp.name AS sport_name,
    v.unit_id,
    u.code_block AS unit_block,
    u.number AS unit_number,
    v.reason,
    v.photo_url,
    v.qr_token,
    v.qr_expires_at,
    v.check_in_at,
    v.check_out_at,
    v.status::TEXT,
    v.approval_mode::TEXT,
    v.guard_id,
    v.device_id,
    v.sync_status::TEXT,
    c.name AS condominium_name
  FROM visits v
  LEFT JOIN condominiums c ON c.id = v.condominium_id
  LEFT JOIN visit_types vt ON vt.id = v.visit_type_id
  LEFT JOIN service_types st ON st.id = v.service_type_id
  LEFT JOIN restaurants r ON r.id = v.restaurant_id
  LEFT JOIN sports sp ON sp.id = v.sport_id
  LEFT JOIN units u ON u.id = v.unit_id
  WHERE
    (p_start_date IS NULL OR v.check_in_at >= p_start_date)
    AND (p_end_date IS NULL OR v.check_in_at <= p_end_date)
    AND (p_condominium_id IS NULL OR v.condominium_id = p_condominium_id)
    AND (p_visit_type IS NULL OR vt.name = p_visit_type)
    AND (p_service_type IS NULL OR st.name = p_service_type)
    AND (p_status IS NULL OR v.status::TEXT = p_status)
  ORDER BY v.check_in_at DESC;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_app_pricing_rules
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_app_pricing_rules()
 RETURNS SETOF app_pricing_rules
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT * FROM public.app_pricing_rules ORDER BY min_residents ASC;
$function$
;

-- ----------------------------------------
-- Function: admin_get_audit_logs
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_audit_logs(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_condominium_id integer, p_actor_id integer, p_action text, p_target_table text, p_limit integer, p_offset integer)
 RETURNS TABLE(id integer, created_at timestamp with time zone, condominium_id integer, condominium_name text, actor_id integer, actor_first_name text, actor_last_name text, actor_role text, action text, target_table text, target_id text, details jsonb, total_count bigint)
  LANGUAGE sql
  SECURITY DEFINER
AS $function$
  SELECT
    a.id,
    a.created_at,
    a.condominium_id,
    c.name AS condominium_name,
    a.actor_id,
    s.first_name AS actor_first_name,
    s.last_name AS actor_last_name,
    s.role AS actor_role,
    a.action,
    a.target_table,
    a.target_id,          -- now text
    a.details,
    COUNT(*) OVER() AS total_count
  FROM public.audit_logs a
  LEFT JOIN public.condominiums c ON c.id = a.condominium_id
  LEFT JOIN public.staff s ON s.id = a.actor_id
  WHERE
    (p_start_date IS NULL OR a.created_at >= p_start_date) AND
    (p_end_date IS NULL OR a.created_at <= p_end_date) AND
    (p_condominium_id IS NULL OR a.condominium_id = p_condominium_id) AND
    (p_actor_id IS NULL OR a.actor_id = p_actor_id) AND
    (p_action IS NULL OR a.action = p_action) AND
    (p_target_table IS NULL OR a.target_table = p_target_table)
  ORDER BY a.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$
;

-- ----------------------------------------
-- Function: get_incident_audit_logs
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_incident_audit_logs(p_condominium_id integer DEFAULT NULL::integer, p_incident_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id integer, created_at timestamp with time zone, condominium_id integer, actor_id integer, actor_first_name text, actor_last_name text, actor_role text, action text, target_table text, target_id text, details jsonb, incident_id text)
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  WITH incident_logs AS (
    SELECT
      a.*,
      COALESCE(NULLIF(a.target_id, ''), NULLIF(a.details->>'incident_id', '')) AS resolved_incident_id
    FROM public.audit_logs a
    WHERE a.target_table = 'incidents'
      AND (p_condominium_id IS NULL OR a.condominium_id = p_condominium_id)
  )
  SELECT
    a.id,
    a.created_at,
    a.condominium_id,
    a.actor_id,
    s.first_name AS actor_first_name,
    s.last_name AS actor_last_name,
    s.role::text AS actor_role,
    a.action,
    a.target_table,
    a.target_id,
    a.details,
    a.resolved_incident_id AS incident_id
  FROM incident_logs a
  LEFT JOIN public.staff s ON s.id = a.actor_id
  WHERE a.resolved_incident_id IS NOT NULL
    AND (
      p_incident_ids IS NULL
      OR EXISTS (
        SELECT 1
        FROM unnest(p_incident_ids) AS requested_id
        WHERE requested_id::text = a.resolved_incident_id
      )
    )
  ORDER BY a.created_at ASC, a.id ASC;
$function$
;

-- ----------------------------------------
-- Function: admin_get_condominium_subscriptions_with_alerts_sent
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_condominium_subscriptions_with_alerts_sent()
 RETURNS TABLE(id bigint, condominium_id bigint, status text, custom_price_per_resident numeric, discount_percentage numeric, last_payment_date date, next_due_date date, created_at timestamp with time zone, updated_at timestamp with time zone, condominium_name text, current_residents_count bigint, payment_status text, months_in_arrears bigint, missing_months_list text, arrears_details jsonb, alerts_sent bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_current_period TEXT := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
  v_global_start DATE := '2025-01-01'::DATE;
BEGIN
  RETURN QUERY
  WITH condo_counts AS (
    SELECT c.id as c_id, COUNT(r.id)::BIGINT as res_count
    FROM public.condominiums c
    LEFT JOIN public.residents r ON c.id = r.condominium_id
    GROUP BY c.id
  ),
  current_month_info AS (
    SELECT 
      p.condominium_id as cm_c_id,
      CASE 
        WHEN 'PAID' = ANY(ARRAY_AGG(p.status)) THEN 'PAID'
        WHEN 'PARTIAL' = ANY(ARRAY_AGG(p.status)) THEN 'PARTIAL'
        ELSE 'PENDING'
      END as status
    FROM public.subscription_payments p
    WHERE p.reference_period = v_current_period
    GROUP BY p.condominium_id
  ),
  alerts_count AS (
    SELECT condominium_id as al_c_id, COUNT(*)::BIGINT as count
    FROM public.subscription_alerts
    GROUP BY condominium_id
  ),
  arrears_calc AS (
    SELECT 
      c.id as a_c_id,
      COUNT(m.month)::BIGINT as total_gaps,
      STRING_AGG(TO_CHAR(m.month, 'YYYY-MM'), ', ' ORDER BY m.month DESC) as gaps_list,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'period', TO_CHAR(m.month, 'YYYY-MM'),
          'expected', (
             COALESCE(s.custom_price_per_resident, (
               SELECT pr.price_per_resident 
               FROM public.app_pricing_rules pr 
               WHERE COALESCE(cc.res_count, 0) BETWEEN pr.min_residents AND COALESCE(pr.max_residents, 999999) 
               LIMIT 1
             ), 0) * COALESCE(cc.res_count, 0) * (1 - COALESCE(s.discount_percentage, 0) / 100.0)
          ),
          'paid', COALESCE((
            SELECT SUM(p2.amount) 
            FROM public.subscription_payments p2 
            WHERE p2.condominium_id = c.id AND p2.reference_period = TO_CHAR(m.month, 'YYYY-MM') AND p2.status != 'FAILED'
          ), 0)
        ) ORDER BY m.month DESC
      ) as details
    FROM public.condominiums c
    LEFT JOIN public.condominium_subscriptions s ON c.id = s.condominium_id
    LEFT JOIN condo_counts cc ON c.id = cc.c_id
    CROSS JOIN LATERAL generate_series(
      v_global_start,
      DATE_TRUNC('month', v_today),
      '1 month'::interval
    ) AS m(month)
    LEFT JOIN public.subscription_payments p ON c.id = p.condominium_id 
      AND p.reference_period = TO_CHAR(m.month, 'YYYY-MM') 
      AND p.status = 'PAID'
    WHERE p.id IS NULL
    GROUP BY c.id
  )
  SELECT 
    COALESCE(s.id, (-c.id))::BIGINT as id, 
    c.id::BIGINT as condominium_id, 
    COALESCE(s.status, 'ACTIVE')::TEXT as status, 
    s.custom_price_per_resident::NUMERIC, 
    COALESCE(s.discount_percentage, 0)::NUMERIC as discount_percentage,
    (SELECT MAX(p.payment_date) FROM public.subscription_payments p WHERE p.condominium_id = c.id AND p.status IN ('PAID', 'PARTIAL'))::DATE as last_payment_date, 
    s.next_due_date::DATE, 
    s.created_at::TIMESTAMP WITH TIME ZONE, 
    s.updated_at::TIMESTAMP WITH TIME ZONE,
    c.name::TEXT as condominium_name,
    COALESCE(cc.res_count, 0)::BIGINT as current_residents_count,
    COALESCE(cms.status, 'PENDING')::TEXT as payment_status,
    COALESCE(ac.total_gaps, 0)::BIGINT as months_in_arrears,
    COALESCE(ac.gaps_list, '')::TEXT as missing_months_list,
    COALESCE(ac.details, '[]'::jsonb) as arrears_details,
    COALESCE(al.count, 0)::BIGINT as alerts_sent
  FROM public.condominiums c
  LEFT JOIN public.condominium_subscriptions s ON c.id = s.condominium_id
  LEFT JOIN condo_counts cc ON c.id = cc.c_id
  LEFT JOIN current_month_info cms ON c.id = cms.cm_c_id
  LEFT JOIN arrears_calc ac ON c.id = ac.a_c_id
  LEFT JOIN alerts_count al ON c.id = al.al_c_id
  ORDER BY c.name ASC;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_condominium_subscriptions
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_condominium_subscriptions(p_year integer DEFAULT NULL::integer, p_month integer DEFAULT NULL::integer)
 RETURNS TABLE(id bigint, condominium_id bigint, status text, custom_price_per_resident numeric, discount_percentage numeric, last_payment_date date, next_due_date date, created_at timestamp with time zone, updated_at timestamp with time zone, condominium_name text, current_residents_count bigint, payment_status text, months_in_arrears bigint, missing_months_list text, arrears_details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_target_date DATE := CURRENT_DATE;
  v_current_period TEXT;
  v_global_start DATE := '2025-01-01'::DATE;
BEGIN
  IF p_year IS NOT NULL AND p_month IS NOT NULL THEN
    v_target_date := MAKE_DATE(p_year, p_month, 1);
    v_current_period := TO_CHAR(v_target_date, 'YYYY-MM');
  ELSE
    v_current_period := TO_CHAR(v_today, 'YYYY-MM');
  END IF;
  RETURN QUERY
  WITH condo_counts AS (
    -- Pre-calculate count of residents to use in pricing
    SELECT c.id as c_id, COUNT(r.id)::BIGINT as res_count
    FROM public.condominiums c
    LEFT JOIN public.residents r ON c.id = r.condominium_id
    GROUP BY c.id
  ),
  current_month_info AS (
    SELECT 
      p.condominium_id as cm_c_id,
      CASE 
        WHEN 'PAID' = ANY(ARRAY_AGG(p.status)) THEN 'PAID'
        WHEN 'PARTIAL' = ANY(ARRAY_AGG(p.status)) THEN 'PARTIAL'
        ELSE 'PENDING'
      END as status
    FROM public.subscription_payments p
    WHERE p.reference_period = v_current_period
    GROUP BY p.condominium_id
  ),
  arrears_calc AS (
    -- Analyze every month for every condo up to the target date
    SELECT 
      c.id as a_c_id,
      COUNT(m.month)::BIGINT as total_gaps,
      STRING_AGG(TO_CHAR(m.month, 'YYYY-MM'), ', ' ORDER BY m.month DESC) as gaps_list,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'period', TO_CHAR(m.month, 'YYYY-MM'),
          'expected', (
             -- Pricing Logic inside the loop
             COALESCE(s.custom_price_per_resident, (
               SELECT pr.price_per_resident 
               FROM public.app_pricing_rules pr 
               WHERE COALESCE(cc.res_count, 0) BETWEEN pr.min_residents AND COALESCE(pr.max_residents, 999999) 
               LIMIT 1
             ), 0) * COALESCE(cc.res_count, 0) * (1 - COALESCE(s.discount_percentage, 0) / 100.0)
          ),
          'paid', COALESCE((
            SELECT SUM(p2.amount) 
            FROM public.subscription_payments p2 
            WHERE p2.condominium_id = c.id AND p2.reference_period = TO_CHAR(m.month, 'YYYY-MM') AND p2.status != 'FAILED'
          ), 0)
        ) ORDER BY m.month DESC
      ) as details
    FROM public.condominiums c
    LEFT JOIN public.condominium_subscriptions s ON c.id = s.condominium_id
    LEFT JOIN condo_counts cc ON c.id = cc.c_id
    CROSS JOIN LATERAL generate_series(
      v_global_start,
      DATE_TRUNC('month', v_target_date),
      '1 month'::interval
    ) AS m(month)
    -- A month is in arrears if there is NO 'PAID' status record
    LEFT JOIN public.subscription_payments p ON c.id = p.condominium_id 
      AND p.reference_period = TO_CHAR(m.month, 'YYYY-MM') 
      AND p.status = 'PAID'
    WHERE p.id IS NULL
    GROUP BY c.id
  )
  SELECT 
    COALESCE(s.id, (-c.id))::BIGINT as id, 
    c.id::BIGINT as condominium_id, 
    COALESCE(s.status, 'ACTIVE')::TEXT as status, 
    s.custom_price_per_resident::NUMERIC, 
    COALESCE(s.discount_percentage, 0)::NUMERIC as discount_percentage,
    (SELECT MAX(p.payment_date) FROM public.subscription_payments p WHERE p.condominium_id = c.id AND p.status IN ('PAID', 'PARTIAL'))::DATE as last_payment_date, 
    s.next_due_date::DATE, 
    s.created_at::TIMESTAMP WITH TIME ZONE, 
    s.updated_at::TIMESTAMP WITH TIME ZONE,
    c.name::TEXT as condominium_name,
    COALESCE(cc.res_count, 0)::BIGINT as current_residents_count,
    COALESCE(cms.status, 'PENDING')::TEXT as payment_status,
    COALESCE(ac.total_gaps, 0)::BIGINT as months_in_arrears,
    COALESCE(ac.gaps_list, '')::TEXT as missing_months_list,
    COALESCE(ac.details, '[]'::jsonb) as arrears_details
  FROM public.condominiums c
  LEFT JOIN public.condominium_subscriptions s ON c.id = s.condominium_id
  LEFT JOIN condo_counts cc ON c.id = cc.c_id
  LEFT JOIN current_month_info cms ON c.id = cms.cm_c_id
  LEFT JOIN arrears_calc ac ON c.id = ac.a_c_id
  ORDER BY c.name ASC;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_condominiums_with_stats
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_condominiums_with_stats()
 RETURNS TABLE(id integer, name text, address text, latitude double precision, longitude double precision, total_visits_today bigint, total_incidents_open bigint, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  v_start := date_trunc('day', now());
  v_end := v_start + interval '1 day';

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.address,
    c.latitude,
    c.longitude,
    (
      SELECT COUNT(*)
      FROM public.visits v
      WHERE v.condominium_id = c.id
        AND v.check_in_at >= v_start
        AND v.check_in_at < v_end
    ) AS total_visits_today,
    (
      SELECT COUNT(*)
      FROM public.incidents i
      JOIN public.residents r ON r.id = i.resident_id
      JOIN public.units u ON u.id = r.unit_id
      WHERE u.condominium_id = c.id
        AND i.status IN ('PENDING', 'ACKNOWLEDGED')
    ) AS total_incidents_open,
    c.status::text
  FROM public.condominiums c
  WHERE c.status = 'ACTIVE'
  ORDER BY c.name;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_dashboard_stats
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
 RETURNS TABLE(total_condominiums integer, active_condominiums integer, total_devices integer, active_devices integer, total_staff integer, total_units integer, total_residents integer, today_visits integer, pending_visits integer, inside_visits integer, active_incidents integer, total_incidents integer, resolved_incidents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  today_start TIMESTAMPTZ;
BEGIN
  today_start := DATE_TRUNC('day', NOW());

  RETURN QUERY
  SELECT
    -- Condominiums
    (SELECT COUNT(*)::INT FROM condominiums) AS total_condominiums,
    (SELECT COUNT(*)::INT FROM condominiums WHERE status = 'ACTIVE') AS active_condominiums,

    -- Devices
    (SELECT COUNT(*)::INT FROM devices) AS total_devices,
    (SELECT COUNT(*)::INT FROM devices WHERE status = 'ACTIVE') AS active_devices,

    -- Staff
    (SELECT COUNT(*)::INT FROM staff) AS total_staff,

    -- Units
    (SELECT COUNT(*)::INT FROM units) AS total_units,

    -- Residents
    (SELECT COUNT(*)::INT FROM residents) AS total_residents,

    -- Today's visits
    (SELECT COUNT(*)::INT FROM visits WHERE check_in_at >= today_start) AS today_visits,
    (SELECT COUNT(*)::INT FROM visits WHERE check_in_at >= today_start AND status = 'PENDENTE') AS pending_visits,
    (SELECT COUNT(*)::INT FROM visits WHERE check_in_at >= today_start AND status = 'NO INTERIOR') AS inside_visits,

    -- Incidents
    (SELECT COUNT(*)::INT FROM incidents WHERE status IN ('new', 'acknowledged', 'inprogress')) AS active_incidents,
    (SELECT COUNT(*)::INT FROM incidents) AS total_incidents,
    (SELECT COUNT(*)::INT FROM incidents WHERE status = 'resolved') AS resolved_incidents;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_residents
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_residents(p_condominium_id integer DEFAULT NULL::integer, p_limit integer DEFAULT 100, p_search text DEFAULT NULL::text, p_after_name text DEFAULT NULL::text, p_after_id integer DEFAULT NULL::integer)
 RETURNS SETOF residents
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.residents
  WHERE (p_condominium_id IS NULL OR condominium_id = p_condominium_id)
    AND (
      p_search IS NULL OR
      name ILIKE '%' || p_search || '%' OR
      email ILIKE '%' || p_search || '%' OR
      phone ILIKE '%' || p_search || '%'
    )
    AND (
      p_after_name IS NULL OR
      (name, id) > (p_after_name, p_after_id)
    )
  ORDER BY name, id
  LIMIT p_limit;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_restaurants
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_restaurants()
 RETURNS SETOF restaurants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.restaurants
  ORDER BY id;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_service_types
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_service_types()
 RETURNS SETOF service_types
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.service_types
  ORDER BY id;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_sports
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_sports()
 RETURNS SETOF sports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.sports
  ORDER BY id;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_subscription_payments
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_subscription_payments(p_condominium_id bigint, p_year integer, p_month integer)
 RETURNS TABLE(id bigint, condominium_id bigint, amount numeric, currency text, payment_date date, reference_period text, status text, notes text, created_at timestamp with time zone, updated_at timestamp with time zone, condominium_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    p.id::BIGINT, 
    p.condominium_id::BIGINT, 
    p.amount::NUMERIC, 
    p.currency::TEXT, 
    p.payment_date::DATE, 
    p.reference_period::TEXT, 
    p.status::TEXT, 
    p.notes::TEXT, 
    p.created_at, 
    p.updated_at,
    c.name::TEXT as condominium_name
  FROM public.subscription_payments p
  LEFT JOIN public.condominiums c ON p.condominium_id = c.id
  WHERE (p_condominium_id IS NULL OR p.condominium_id = p_condominium_id)
    AND (p_year IS NULL OR EXTRACT(YEAR FROM p.payment_date) = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM p.payment_date) = p_month)
  ORDER BY p.payment_date DESC;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_get_visit_types
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_visit_types()
 RETURNS SETOF visit_types
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.visit_types
  ORDER BY id;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_send_subscription_alert
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_send_subscription_alert(p_condominium_id integer, p_staff_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_total_alerts INT;
    v_alerts_this_month INT;
    v_reference_month TEXT;
    v_months_in_arrears INT;
    v_blocked BOOLEAN := false;
    v_result jsonb;
BEGIN
    -- Determine current reference month (MM/YYYY)
    v_reference_month := to_char(CURRENT_DATE, 'MM/YYYY');
    -- Check if alert was already sent this month for this condominium
    SELECT count(*) INTO v_alerts_this_month
    FROM subscription_alerts
    WHERE condominium_id = p_condominium_id
      AND to_char(alert_date, 'MM/YYYY') = to_char(CURRENT_DATE, 'MM/YYYY');
    IF v_alerts_this_month > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'JÃƒÂ¡ foi enviado um alerta para este condomÃƒÂ­nio neste mÃƒÂªs. Limite de 1 alerta por mÃƒÂªs.'
        );
    END IF;
    -- Record the new alert
    INSERT INTO subscription_alerts (condominium_id, alert_date, reference_month, sent_by)
    VALUES (p_condominium_id, NOW(), v_reference_month, p_staff_id);
    -- Check total alerts sent
    SELECT count(*) INTO v_total_alerts
    FROM subscription_alerts
    WHERE condominium_id = p_condominium_id;
    -- Calculate current arrears (this uses your existing function logic if available, or a simplified check based on what RPCs exist)
    -- Assuming your view/RPC provides months_in_arrears:
    -- Here we do a simplified check for > 0 arrears across all time, though normally we'd call a calculation function.
    -- For safety, we block if total alerts >= 3.
    IF v_total_alerts >= 3 THEN
        -- Check if it should be blocked (i.e., it is really still in arrears)
        -- In the context of calling from the frontend, we are only calling this if it has arrears >= 5.
        -- So we proceed to block.
        
        -- Turn condominium INACTIVE
        UPDATE condominiums
        SET status = 'INACTIVE'
        WHERE id = p_condominium_id;
        -- Turn subscription INACTIVE
        UPDATE condominium_subscriptions
        SET status = 'INACTIVE'
        WHERE condominium_id = p_condominium_id;
        -- Optionally turn devices INACTIVE
        UPDATE devices
        SET status = 'INACTIVE'
        WHERE condominium_id = p_condominium_id;
        v_blocked := true;
    END IF;
    v_result := jsonb_build_object(
        'success', true,
        'message', 'Alerta registado com sucesso.',
        'total_alerts', v_total_alerts,
        'blocked', v_blocked
    );
    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', SQLERRM
    );
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_app_pricing_rule
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_app_pricing_rule(p_id integer, p_min_residents integer, p_max_residents integer, p_price_per_resident numeric, p_currency character varying)
 RETURNS app_pricing_rules
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_rule public.app_pricing_rules;
BEGIN
  UPDATE public.app_pricing_rules
  SET min_residents = COALESCE(p_min_residents, min_residents),
      max_residents = COALESCE(p_max_residents, max_residents),
      price_per_resident = COALESCE(p_price_per_resident, price_per_resident),
      currency = COALESCE(p_currency, currency),
      updated_at = NOW()
  WHERE id = p_id
  RETURNING * INTO v_rule;
  
  RETURN v_rule;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_condominium
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_condominium(p_id integer, p_data jsonb)
 RETURNS condominiums
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec public.condominiums;
  v_set_clause text;
BEGIN
  v_rec := jsonb_populate_record(NULL::public.condominiums, p_data);

  SELECT string_agg(
    format('%I = COALESCE(($1).%I, %I)', column_name, column_name, column_name),
    ', '
  )
  INTO v_set_clause
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'condominiums'
    AND column_name <> 'id';

  EXECUTE format('UPDATE public.condominiums SET %s WHERE id = $2 RETURNING *', v_set_clause)
  INTO v_rec
  USING v_rec, p_id;

  RETURN v_rec;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_device
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_device(p_id uuid, p_data jsonb)
 RETURNS devices
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_device devices;
BEGIN
  UPDATE public.devices
  SET
    device_identifier = CASE
      WHEN p_data ? 'device_identifier' THEN p_data->>'device_identifier'
      ELSE device_identifier
    END,
    device_name = CASE
      WHEN p_data ? 'device_name' THEN p_data->>'device_name'
      ELSE device_name
    END,
    condominium_id = CASE
      WHEN p_data ? 'condominium_id' THEN (p_data->>'condominium_id')::INT4
      ELSE condominium_id
    END,
    configured_at = CASE
      WHEN p_data ? 'configured_at' THEN (p_data->>'configured_at')::TIMESTAMPTZ
      ELSE configured_at
    END,
    last_seen_at = CASE
      WHEN p_data ? 'last_seen_at' THEN (p_data->>'last_seen_at')::TIMESTAMPTZ
      ELSE last_seen_at
    END,
    status = CASE
      WHEN p_data ? 'status' THEN p_data->>'status'
      ELSE status
    END,
    metadata = CASE
      WHEN p_data ? 'metadata' THEN p_data->'metadata'
      ELSE metadata
    END
  WHERE id = p_id
  RETURNING * INTO v_device;

  RETURN v_device;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_incident
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_incident(p_id uuid, p_data jsonb)
 RETURNS incidents
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_rec public.incidents;
  v_new_notes TEXT;
  v_existing_notes TEXT;
BEGIN
  -- Get existing notes
  SELECT guard_notes INTO v_existing_notes FROM public.incidents WHERE id = p_id;

  -- If new notes provided, append with separator instead of overwriting
  IF p_data->>'guard_notes' IS NOT NULL THEN
    IF v_existing_notes IS NOT NULL AND v_existing_notes <> '' THEN
      v_new_notes := v_existing_notes || E'\n---\n' || (p_data->>'guard_notes');
    ELSE
      v_new_notes := p_data->>'guard_notes';
    END IF;
  ELSE
    v_new_notes := v_existing_notes;
  END IF;

  UPDATE public.incidents
  SET
    status = COALESCE(p_data->>'status', status),
    description = COALESCE(p_data->>'description', description),
    guard_notes = v_new_notes,
    acknowledged_at = COALESCE((p_data->>'acknowledged_at')::timestamptz, acknowledged_at),
    acknowledged_by = COALESCE((p_data->>'acknowledged_by')::int, acknowledged_by),
    resolved_at = COALESCE((p_data->>'resolved_at')::timestamptz, resolved_at),
    photo_path = COALESCE(p_data->>'photo_path', photo_path)
  WHERE id = p_id
  RETURNING * INTO v_rec;

  RETURN v_rec;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_news
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_news(p_id integer, p_data jsonb)
 RETURNS condominium_news
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_news condominium_news;
BEGIN
  UPDATE condominium_news
  SET
    title = COALESCE(p_data->>'title', title),
    description = COALESCE(p_data->>'description', description),
    content = COALESCE(p_data->>'content', content),
    image_url = COALESCE(p_data->>'image_url', image_url),
    category_id = COALESCE((p_data->>'category_id')::INT4, category_id),
    updated_at = NOW()
  WHERE id = p_id
  RETURNING * INTO v_news;

  RETURN v_news;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_news_category
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_news_category(p_id integer, p_data jsonb)
 RETURNS news_categories
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_category news_categories;
BEGIN
  UPDATE news_categories
  SET
    name = COALESCE(p_data->>'name', name),
    label = COALESCE(p_data->>'label', label)
  WHERE id = p_id
  RETURNING * INTO v_category;

  RETURN v_category;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_resident
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_resident(p_id integer, p_data jsonb)
 RETURNS residents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec public.residents;
  v_set_clause text;
BEGIN
  v_rec := jsonb_populate_record(NULL::public.residents, p_data);

  SELECT string_agg(
    format('%I = COALESCE(($1).%I, %I)', column_name, column_name, column_name),
    ', '
  )
  INTO v_set_clause
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'residents'
    AND column_name <> 'id';

  EXECUTE format('UPDATE public.residents SET %s WHERE id = $2 RETURNING *', v_set_clause)
  INTO v_rec
  USING v_rec, p_id;

  RETURN v_rec;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_restaurant
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_restaurant(p_id uuid, p_data jsonb)
 RETURNS restaurants
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_row public.restaurants;
  v_data record;
BEGIN
  SELECT * INTO v_data
  FROM jsonb_to_record(p_data) AS x(
    name text,
    description text,
    condominium_id int4,
    status text
  );

  UPDATE public.restaurants
  SET
    name = COALESCE(v_data.name, name),
    description = COALESCE(v_data.description, description),
    condominium_id = COALESCE(v_data.condominium_id, condominium_id),
    status = COALESCE(v_data.status, status)
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_service_type
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_service_type(p_id integer, p_data jsonb)
 RETURNS service_types
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec public.service_types;
  v_set_clause text;
BEGIN
  v_rec := jsonb_populate_record(NULL::public.service_types, p_data);

  SELECT string_agg(
    format('%I = COALESCE(($1).%I, %I)', column_name, column_name, column_name),
    ', '
  )
  INTO v_set_clause
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'service_types'
    AND column_name <> 'id';

  EXECUTE format('UPDATE public.service_types SET %s WHERE id = $2 RETURNING *', v_set_clause)
  INTO v_rec
  USING v_rec, p_id;

  RETURN v_rec;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_sport
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_sport(p_id uuid, p_data jsonb)
 RETURNS sports
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_row public.sports;
  v_data record;
BEGIN
  SELECT * INTO v_data
  FROM jsonb_to_record(p_data) AS x(
    name text,
    description text,
    condominium_id int4,
    status text
  );

  UPDATE public.sports
  SET
    name = COALESCE(v_data.name, name),
    description = COALESCE(v_data.description, description),
    condominium_id = COALESCE(v_data.condominium_id, condominium_id),
    status = COALESCE(v_data.status, status)
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_staff
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_staff(p_id integer, p_data jsonb)
 RETURNS staff
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_row public.staff;
begin
  update public.staff
  set
    first_name      = coalesce(p_data->>'first_name', first_name),
    last_name       = coalesce(p_data->>'last_name', last_name),
    role            = coalesce(p_data->>'role', role::text)::text,
    condominium_id  = coalesce((p_data->>'condominium_id')::integer, condominium_id),
    photo_url       = coalesce(p_data->>'photo_url', photo_url)
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$function$
;

-- ----------------------------------------
-- Function: admin_update_staff_pin
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_staff_pin(p_staff_id integer, p_pin_cleartext text)
 RETURNS staff
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_row public.staff;
begin
  if length(p_pin_cleartext) < 4 or length(p_pin_cleartext) > 6 then
    raise exception 'PIN deve ter entre 4 e 6 dÃƒÂ­gitos';
  end if;

  update public.staff
  set pin_hash = crypt(p_pin_cleartext, gen_salt('bf', 10))
  where id = p_staff_id
  returning * into v_row;

  return v_row;
end;
$function$
;

-- ----------------------------------------
-- Function: admin_update_subscription_details
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_subscription_details(p_id integer, p_condominium_id integer, p_status character varying DEFAULT NULL::character varying, p_custom_price_per_resident numeric DEFAULT NULL::numeric, p_discount_percentage numeric DEFAULT NULL::numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- If p_id is null or < 0, we try to find by condominium_id or insert
  IF p_id IS NULL OR p_id < 0 THEN
    INSERT INTO public.condominium_subscriptions (condominium_id, status, custom_price_per_resident, discount_percentage)
    VALUES (p_condominium_id, COALESCE(p_status, 'ACTIVE'), p_custom_price_per_resident, COALESCE(p_discount_percentage, 0))
    ON CONFLICT (condominium_id) DO UPDATE SET 
      status = COALESCE(EXCLUDED.status, condominium_subscriptions.status),
      custom_price_per_resident = EXCLUDED.custom_price_per_resident,
      discount_percentage = COALESCE(EXCLUDED.discount_percentage, condominium_subscriptions.discount_percentage),
      updated_at = NOW();
  ELSE
    UPDATE public.condominium_subscriptions
    SET 
      status = COALESCE(p_status, status),
      custom_price_per_resident = p_custom_price_per_resident,
      discount_percentage = COALESCE(p_discount_percentage, discount_percentage),
      updated_at = NOW()
    WHERE id = p_id;
    
    -- If no rows updated by ID, maybe it was a wrong ID, try by condo_id as fallback
    IF NOT FOUND THEN
      UPDATE public.condominium_subscriptions
      SET 
        status = COALESCE(p_status, status),
        custom_price_per_resident = p_custom_price_per_resident,
        discount_percentage = COALESCE(p_discount_percentage, discount_percentage),
        updated_at = NOW()
      WHERE condominium_id = p_condominium_id;
    END IF;
  END IF;
  RETURN TRUE;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_subscription_status
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_subscription_status(p_id integer, p_condominium_id integer, p_status character varying)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF p_id < 0 THEN
    INSERT INTO public.condominium_subscriptions (condominium_id, status)
    VALUES (p_condominium_id, p_status)
    ON CONFLICT (condominium_id) DO UPDATE SET status = EXCLUDED.status;
  ELSE
    UPDATE public.condominium_subscriptions
    SET status = p_status, updated_at = NOW()
    WHERE id = p_id;
  END IF;
  RETURN TRUE;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_unit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_unit(p_id integer, p_data jsonb)
 RETURNS units
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec public.units;
  v_set_clause text;
BEGIN
  v_rec := jsonb_populate_record(NULL::public.units, p_data);

  SELECT string_agg(
    format('%I = COALESCE(($1).%I, %I)', column_name, column_name, column_name),
    ', '
  )
  INTO v_set_clause
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'units'
    AND column_name <> 'id';

  EXECUTE format('UPDATE public.units SET %s WHERE id = $2 RETURNING *', v_set_clause)
  INTO v_rec
  USING v_rec, p_id;

  RETURN v_rec;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_visit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_visit(p_id integer, p_data jsonb)
 RETURNS visits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec public.visits;
  v_set_clause text;
BEGIN
  v_rec := jsonb_populate_record(NULL::public.visits, p_data);

  SELECT string_agg(
    format('%I = COALESCE(($1).%I, %I)', column_name, column_name, column_name),
    ', '
  )
  INTO v_set_clause
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'visits'
    AND column_name <> 'id';

  EXECUTE format('UPDATE public.visits SET %s WHERE id = $2 RETURNING *', v_set_clause)
  INTO v_rec
  USING v_rec, p_id;

  RETURN v_rec;
END;
$function$
;

-- ----------------------------------------
-- Function: admin_update_visit_type
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_visit_type(p_id integer, p_data jsonb)
 RETURNS visit_types
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec public.visit_types;
  v_set_clause text;
BEGIN
  v_rec := jsonb_populate_record(NULL::public.visit_types, p_data);

  SELECT string_agg(
    format('%I = COALESCE(($1).%I, %I)', column_name, column_name, column_name),
    ', '
  )
  INTO v_set_clause
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'visit_types'
    AND column_name <> 'id';

  EXECUTE format('UPDATE public.visit_types SET %s WHERE id = $2 RETURNING *', v_set_clause)
  INTO v_rec
  USING v_rec, p_id;

  RETURN v_rec;
END;
$function$
;

-- ----------------------------------------
-- Function: approve_visit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.approve_visit(p_visit_id integer, p_approval_mode text DEFAULT 'app'::text)
 RETURNS SETOF visits
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
  RETURN QUERY
  UPDATE public.visits
  SET
    status = 'AUTORIZADO',
    approved_at = now(),
    approval_mode = p_approval_mode
  WHERE id = p_visit_id
  RETURNING *;
END;$function$
;

-- ----------------------------------------
-- Function: audit_visit_delete
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.audit_visit_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Attempt to log the deletion
  -- Note: actor_id would need to be passed via session variable or another mechanism
  INSERT INTO audit_logs (
    condominium_id,
    actor_id,
    action,
    target_table,
    target_id,
    details
  ) VALUES (
    OLD.condominium_id,
    NULL, -- Would need session context
    'DELETE',
    'visits',
    OLD.id,
    jsonb_build_object(
      'visitor_name', OLD.visitor_name,
      'check_in_at', OLD.check_in_at,
      'status', OLD.status
    )
  );

  RETURN OLD;
END;
$function$
;

-- ----------------------------------------
-- Function: check_otp_validity
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.check_otp_validity(p_phone text)
 RETURNS TABLE(has_valid_otp boolean, expires_in_seconds integer, attempts_remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_otp RECORD;
  v_normalized_phone TEXT;
BEGIN
  v_normalized_phone := REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g');

  SELECT * INTO v_otp
  FROM otp_codes
  WHERE phone = v_normalized_phone
    AND purpose = 'RESET_PIN'
    AND used_at IS NULL
    AND expires_at > NOW()
    AND attempts < max_attempts
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_otp.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0;
  ELSE
    RETURN QUERY
    SELECT
      TRUE,
      EXTRACT(EPOCH FROM (v_otp.expires_at - NOW()))::INTEGER,
      (v_otp.max_attempts - v_otp.attempts)::INTEGER;
  END IF;
END;
$function$
;

-- ----------------------------------------
-- Function: check_unit_has_app
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.check_unit_has_app(p_unit_id integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_has_app BOOLEAN;
  v_resident_count INT4;
  v_app_resident_count INT4;
  v_result JSON;
BEGIN
  -- Count total residents
  SELECT COUNT(*) INTO v_resident_count
  FROM residents
  WHERE unit_id = p_unit_id;

  -- Count residents with app
  SELECT COUNT(*) INTO v_app_resident_count
  FROM residents
  WHERE unit_id = p_unit_id AND has_app_installed = TRUE;

  -- Determine if unit has app (at least one resident)
  v_has_app := (v_app_resident_count > 0);

  -- Build result
  SELECT json_build_object(
    'unit_id', p_unit_id,
    'has_app', v_has_app,
    'total_residents', v_resident_count,
    'residents_with_app', v_app_resident_count,
    'coverage_percent',
      CASE
        WHEN v_resident_count > 0
        THEN ROUND((v_app_resident_count::NUMERIC / v_resident_count::NUMERIC) * 100, 1)
        ELSE 0
      END
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

-- ----------------------------------------
-- Function: checkout_visit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.checkout_visit(p_id integer)
 RETURNS visits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.visits;
BEGIN
  UPDATE public.visits
  SET
    status = 'LEFT',
    check_out_at = COALESCE(check_out_at, now())
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: create_audit_log
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.create_audit_log(p_data jsonb)
 RETURNS audit_logs
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_row public.audit_logs;
  v_input public.audit_logs;
BEGIN
  v_input := jsonb_populate_record(NULL::public.audit_logs, p_data);

  INSERT INTO public.audit_logs (
    condominium_id, actor_id, action, target_table, target_id, details, created_at
  )
  VALUES (
    v_input.condominium_id,
    v_input.actor_id,
    v_input.action,
    v_input.target_table,
    v_input.target_id,
    v_input.details,
    COALESCE(v_input.created_at, now())
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: create_condominium_news
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.create_condominium_news(p_condominium_id integer, p_title text, p_description text, p_category_id integer)
 RETURNS SETOF condominium_news
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  INSERT INTO public.condominium_news (
    condominium_id,
    title,
    description,
    category_id
  ) VALUES (
    p_condominium_id,
    p_title,
    p_description,
    p_category_id
  )
  RETURNING *;
END;
$function$
;

-- ----------------------------------------
-- Function: create_condominium_subscription
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.create_condominium_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO public.condominium_subscriptions (condominium_id, status)
    VALUES (NEW.id, 'ACTIVE')
    ON CONFLICT (condominium_id) DO NOTHING;
    RETURN NEW;
END;
$function$
;

-- ----------------------------------------
-- Function: create_incident
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.create_incident(p_resident_id integer, p_description text, p_type text, p_photo_path text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_id UUID;
BEGIN
  -- photo_path should be the public URL from Supabase Storage bucket 'incidents'
  -- Client-side should upload photo first and pass the resulting URL
  INSERT INTO incidents (
    resident_id,
    description,
    type,
    photo_path,
    status
  ) VALUES (
    p_resident_id,
    p_description,
    p_type,
    p_photo_path,
    'new'
  )
  RETURNING incidents.id INTO v_id;
  
  RETURN QUERY
  SELECT v_id, 'Incident reported successfully'::TEXT;
END;
$function$
;

-- ----------------------------------------
-- Function: create_notification
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.create_notification(p_resident_id integer, p_condominium_id integer, p_unit_id integer, p_title text, p_body text, p_type text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_notification_id INT;
BEGIN
  INSERT INTO notifications (
    resident_id,
    condominium_id,
    unit_id,
    title,
    body,
    type,
    data
  ) VALUES (
    p_resident_id,
    p_condominium_id,
    p_unit_id,
    p_title,
    p_body,
    p_type,
    p_data
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$function$
;

-- ----------------------------------------
-- Function: create_street
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.create_street(p_data jsonb)
 RETURNS streets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.streets;
begin
  insert into public.streets (
    condominium_id,
    name
  )
  values (
    (p_data->>'condominium_id')::int4,
    p_data->>'name'
  )
  returning * into v_row;

  return v_row;
end;
$function$
;

-- ----------------------------------------
-- Function: create_visit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.create_visit(p_data jsonb)
 RETURNS visits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$DECLARE
  v_row public.visits;
BEGIN
  INSERT INTO public.visits (
    condominium_id, visitor_name, visitor_doc, visitor_phone, vehicle_license_plate,
    visit_type_id, service_type_id, restaurant_id, sport_id,
    unit_id, reason, photo_url, qr_token, qr_expires_at,
    check_in_at, check_out_at, status, approval_mode,
    guard_id, device_id
  ) VALUES (
    (p_data->>'condominium_id')::int,
    p_data->>'visitor_name',
    p_data->>'visitor_doc',
    p_data->>'visitor_phone',
    p_data->>'vehicle_license_plate',
    (p_data->>'visit_type_id')::int,
    (p_data->>'service_type_id')::int,
    NULLIF(p_data->>'restaurant_id','')::uuid, -- changed
    NULLIF(p_data->>'sport_id','')::uuid,   
    (p_data->>'unit_id')::int,
    p_data->>'reason',
    p_data->>'photo_url',
    p_data->>'qr_token',
    (p_data->>'qr_expires_at')::timestamptz,
    (p_data->>'check_in_at')::timestamptz,
    (p_data->>'check_out_at')::timestamptz,
    p_data->>'status',
    p_data->>'approval_mode',
    (p_data->>'guard_id')::int,
    NULLIF(p_data->>'device_id','')::uuid
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;$function$
;

-- ----------------------------------------
-- Function: create_visit_event
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.create_visit_event(p_data jsonb)
 RETURNS visit_events
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v public.visit_events;
begin
  insert into public.visit_events (
    visit_id, status, event_at, actor_id, device_id
  )
  values (
    (p_data->>'visit_id')::int4,
    p_data->>'status',
    coalesce((p_data->>'event_at')::timestamptz, now()),
    nullif(p_data->>'actor_id', '')::int4,
    nullif(p_data->>'device_id', '')::uuid
  )
  returning * into v;

  return v;
end;
$function$
;

-- ----------------------------------------
-- Function: create_visitor_qr_code
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.create_visitor_qr_code(p_resident_id integer, p_condominium_id integer, p_unit_id integer, p_purpose text, p_visitor_name text, p_visitor_phone text, p_notes text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, qr_code text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_qr_code TEXT;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_id UUID;
BEGIN
  -- Use provided expiration time or default to 24 hours from now
  v_expires_at := COALESCE(p_expires_at, NOW() + INTERVAL '24 hours');
  
  -- Generate unique QR code token
  v_qr_code := encode(gen_random_bytes(16), 'hex');
  
  -- Insert into resident_qr_codes table
  INSERT INTO resident_qr_codes (
    resident_id,
    condominium_id,
    unit_id,
    purpose,
    visitor_name,
    visitor_phone,
    notes,
    qr_code,
    expires_at,
    status
  ) VALUES (
    p_resident_id,
    p_condominium_id,
    p_unit_id,
    p_purpose,
    p_visitor_name,
    p_visitor_phone,
    p_notes,
    v_qr_code,
    v_expires_at,
    'active'
  )
  RETURNING resident_qr_codes.id INTO v_id;
  
  RETURN QUERY
  SELECT v_id, v_qr_code, NOW();
END;
$function$
;

-- ----------------------------------------
-- Function: deactivate_condo_devices
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_condo_devices(p_condominium_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update devices
  set status = 'INACTIVE'
  where condominium_id = p_condominium_id
    and status = 'ACTIVE';

  return true;
end;
$function$
;

-- ----------------------------------------
-- Function: delete_resident_device
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.delete_resident_device(p_resident_id integer, p_push_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.resident_devices
  WHERE resident_id = p_resident_id
    AND push_token = p_push_token;
END;
$function$
;

-- ----------------------------------------
-- Function: delete_street
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.delete_street(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.streets
  WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$
;

-- ----------------------------------------
-- Function: deny_visit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.deny_visit(p_visit_id integer, p_approval_mode text DEFAULT 'app'::text)
 RETURNS SETOF visits
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
  RETURN QUERY
  UPDATE public.visits
  SET
    status = 'NEGADO',
    denied_at = now(),
    approval_mode = p_approval_mode
  WHERE id = p_visit_id
  RETURNING *;
END;$function$
;

-- ----------------------------------------
-- Function: expire_qr_codes
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.expire_qr_codes()
 RETURNS TABLE(expired_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count INT;
BEGIN
  UPDATE resident_qr_codes
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active'
    AND expires_at <= NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN QUERY SELECT v_count;
END;
$function$
;

-- ----------------------------------------
-- Function: get_active_qr_codes
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_qr_codes(p_resident_id integer)
 RETURNS TABLE(id uuid, visitor_name text, visitor_phone text, purpose text, notes text, qr_code text, expires_at timestamp with time zone, status text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    resident_qr_codes.id,
    resident_qr_codes.visitor_name,
    resident_qr_codes.visitor_phone,
    resident_qr_codes.purpose,
    resident_qr_codes.notes,
    resident_qr_codes.qr_code,
    resident_qr_codes.expires_at,
    resident_qr_codes.status,
    resident_qr_codes.created_at,
    resident_qr_codes.updated_at
  FROM resident_qr_codes
  WHERE resident_qr_codes.resident_id = p_resident_id
    AND resident_qr_codes.status = 'active'
    AND resident_qr_codes.expires_at > NOW()
  ORDER BY resident_qr_codes.created_at DESC;
END;
$function$
;

-- ----------------------------------------
-- Function: get_available_condominiums_for_setup
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_available_condominiums_for_setup()
 RETURNS TABLE("like" condominiums)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT c.*
  FROM condominiums c
  WHERE c.status = 'ACTIVE'
    AND NOT EXISTS (
      SELECT 1 FROM devices d
      WHERE d.condominium_id = c.id
        AND d.status = 'ACTIVE'
    )
  ORDER BY c.name;
END;
$function$
;

-- ----------------------------------------
-- Function: get_condominium
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_condominium(p_id integer)
 RETURNS SETOF condominiums
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.condominiums
  WHERE id = p_id;
END;
$function$
;

-- ----------------------------------------
-- Function: get_condominium_by_id
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_condominium_by_id(p_condominium_id integer)
 RETURNS TABLE(id integer, name text, address text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.address,
    c.created_at
  FROM public.condominiums c
  WHERE c.id = p_condominium_id
  LIMIT 1;
END;
$function$
;

-- ----------------------------------------
-- Function: get_condominium_news
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_condominium_news(p_condominium_id integer)
 RETURNS TABLE(id text, condominium_id text, title text, description text, content text, image_url text, category_id text, created_at timestamp with time zone, updated_at timestamp with time zone, category_name text, category_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    n.id::text,
    n.condominium_id::text,
    n.title,
    n.description,
    n.content,
    n.image_url,
    n.category_id::text,
    n.created_at,
    n.updated_at,
    c.name::text,
    c.label::text
  FROM public.condominium_news n
  LEFT JOIN public.news_categories c ON c.id = n.category_id
  WHERE n.condominium_id = p_condominium_id
  ORDER BY n.created_at DESC;
END;
$function$
;

-- ----------------------------------------
-- Function: get_condominiums
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_condominiums()
 RETURNS SETOF condominiums
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.condominiums
  ORDER BY id;
END;
$function$
;

-- ----------------------------------------
-- Function: get_device
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_device(p_identifier text)
 RETURNS SETOF devices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.devices
  WHERE device_identifier = p_identifier;
END;
$function$
;

-- ----------------------------------------
-- Function: get_devices_by_condominium
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_devices_by_condominium(p_condominium_id integer)
 RETURNS SETOF devices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.devices
  WHERE condominium_id = p_condominium_id
  ORDER BY last_seen_at DESC NULLS LAST, id;
END;
$function$
;

-- ----------------------------------------
-- Function: get_incident_by_id
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_incident_by_id(p_incident_id integer)
 RETURNS TABLE(id text, type text, description text, status text, photo_path text, reported_at timestamp with time zone, acknowledged_by text, guard_notes text, resolved_at timestamp with time zone, acknowledged_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    i.id::text,
    i.type,
    i.description,
    i.status,
    i.photo_path,
    i.reported_at,
    i.acknowledged_by::text,
    i.guard_notes,
    i.resolved_at,
    i.acknowledged_at
  FROM public.incidents i
  WHERE i.id = p_incident_id
  LIMIT 1;
END;
$function$
;

-- ----------------------------------------
-- Function: get_incident_statuses
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_incident_statuses()
 RETURNS TABLE(code text, label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    incident_statuses.code,
    incident_statuses.code AS label
  FROM incident_statuses
  ORDER BY incident_statuses.code;
END;
$function$
;

-- ----------------------------------------
-- Function: get_incident_types
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_incident_types()
 RETURNS TABLE(code text, label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
  RETURN QUERY
  SELECT t.code::TEXT as code, t.label::TEXT as label
  FROM incident_types t
  ORDER BY t.sort_order;
END;$function$
;

-- ----------------------------------------
-- Function: get_incidents
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_incidents(p_condominium_id integer)
 RETURNS TABLE(id uuid, reported_at timestamp with time zone, resident_id integer, description text, type text, type_label text, status text, status_label text, photo_path text, acknowledged_at timestamp with time zone, acknowledged_by integer, guard_notes text, resolved_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    i.id,
    i.reported_at,
    i.resident_id,
    i.description,
    i.type,
    it.label AS type_label,
    i.status,
    ist.label AS status_label,
    i.photo_path,
    i.acknowledged_at,
    i.acknowledged_by,
    i.guard_notes,
    i.resolved_at
  FROM incidents i
  JOIN residents r ON i.resident_id = r.id
  LEFT JOIN incident_types it ON i.type = it.code
  LEFT JOIN incident_statuses ist ON i.status = ist.code
  WHERE r.condominium_id = p_condominium_id
  ORDER BY i.reported_at DESC;
$function$
;

-- ----------------------------------------
-- Function: get_incidents_by_resident
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_incidents_by_resident(p_resident_id integer)
 RETURNS TABLE(id text, type text, description text, status text, photo_path text, reported_at timestamp with time zone, acknowledged_by text, guard_notes text, resolved_at timestamp with time zone, acknowledged_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    i.id::text,
    i.type,
    i.description,
    i.status,
    i.photo_path,
    i.reported_at,
    i.acknowledged_by::text,
    i.guard_notes,
    i.resolved_at,
    i.acknowledged_at
  FROM public.incidents i
  WHERE i.resident_id = p_resident_id
  ORDER BY i.reported_at DESC;
END;
$function$
;

-- ----------------------------------------
-- Function: get_news
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_news(p_condominium_id integer, p_days integer DEFAULT 7)
 RETURNS TABLE(id integer, condominium_id integer, title text, description text, content text, image_url text, category_id integer, category_name text, category_label text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.condominium_id,
    n.title,
    n.description,
    n.content,
    n.image_url,
    n.category_id,
    nc.name::text AS category_name,
    nc.label::text AS category_label,
    n.created_at,
    n.updated_at
  FROM condominium_news n
  LEFT JOIN news_categories nc ON n.category_id = nc.id
  WHERE n.condominium_id = p_condominium_id
    AND n.created_at >= NOW() - (p_days::TEXT || ' days')::INTERVAL
  ORDER BY n.created_at DESC;
END;
$function$
;

-- ----------------------------------------
-- Function: get_news_categories
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_news_categories()
 RETURNS SETOF news_categories
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
  RETURN QUERY
  SELECT *
  FROM news_categories
  ORDER BY name ASC;
END;$function$
;

-- ----------------------------------------
-- Function: get_notification_preferences
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_notification_preferences(p_resident_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_prefs jsonb;
BEGIN
  SELECT notification_preferences
  INTO v_prefs
  FROM public.residents
  WHERE id = p_resident_id
  LIMIT 1;

  RETURN v_prefs;
END;
$function$
;

-- ----------------------------------------
-- Function: get_notifications_legacy
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_notifications_legacy(p_resident_id integer)
 RETURNS SETOF notifications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.notifications
  WHERE resident_id = p_resident_id
  ORDER BY created_at DESC, id DESC;
END;
$function$
;

-- ----------------------------------------
-- Function: get_notifications
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_notifications(p_resident_id integer, p_limit integer DEFAULT 50)
 RETURNS SETOF notifications
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.notifications
  WHERE resident_id = p_resident_id
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$function$
;

-- ----------------------------------------
-- Function: get_pending_visits
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_visits(p_unit_id integer, p_limit integer DEFAULT 10)
 RETURNS SETOF visits
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.visits
  WHERE unit_id = p_unit_id
    AND status = 'PENDENTE'
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$function$
;

-- ----------------------------------------
-- Function: get_qr_code_history
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_qr_code_history(p_resident_id integer)
 RETURNS TABLE(id uuid, visitor_name text, visitor_phone text, purpose text, qr_code text, expires_at timestamp with time zone, status text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    resident_qr_codes.id,
    resident_qr_codes.visitor_name,
    resident_qr_codes.visitor_phone,
    resident_qr_codes.purpose,
    resident_qr_codes.qr_code,
    resident_qr_codes.expires_at,
    resident_qr_codes.status,
    resident_qr_codes.created_at,
    resident_qr_codes.updated_at
  FROM resident_qr_codes
  WHERE resident_qr_codes.resident_id = p_resident_id
  ORDER BY resident_qr_codes.created_at DESC;
END;
$function$
;

-- ----------------------------------------
-- Function: get_resident
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_resident(p_id integer)
 RETURNS SETOF residents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.residents
  WHERE id = p_id;
END;
$function$
;

-- ----------------------------------------
-- Function: get_resident_by_id
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_resident_by_id(p_resident_id integer)
 RETURNS TABLE(id integer, name text, phone text, email text, avatar_url text, condominium_id integer, unit_id integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.phone,
    r.email,
    r.avatar_url,
    r.condominium_id,
    r.unit_id,
    r.created_at
  FROM public.residents r
  WHERE r.id = p_resident_id
  LIMIT 1;
END;
$function$
;

-- ----------------------------------------
-- Function: get_residents_by_condominium
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_residents_by_condominium(p_condominium_id integer)
 RETURNS SETOF residents
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
$function$
;

-- ----------------------------------------
-- Function: get_resident_incidents
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_resident_incidents(p_resident_id integer)
 RETURNS TABLE(id uuid, reported_at timestamp with time zone, description text, type text, status text, photo_path text, acknowledged_at timestamp with time zone, acknowledged_by integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    incidents.id,
    incidents.reported_at,
    incidents.description,
    incidents.type,
    incidents.status,
    incidents.photo_path,
    incidents.acknowledged_at,
    incidents.acknowledged_by
  FROM incidents
  WHERE incidents.resident_id = p_resident_id
  ORDER BY incidents.reported_at DESC;
END;
$function$
;

-- ----------------------------------------
-- Function: get_resident_notifications
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_resident_notifications(p_resident_id integer, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_unread_only boolean DEFAULT false)
 RETURNS TABLE(id integer, created_at timestamp with time zone, title character varying, body text, type character varying, data jsonb, read boolean, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.created_at,
    n.title,
    n.body,
    n.type,
    n.data,
    n.read,
    n.updated_at
  FROM notifications n
  WHERE n.resident_id = p_resident_id
    AND (p_unread_only = FALSE OR n.read = FALSE)
  ORDER BY n.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$
;

-- ----------------------------------------
-- Function: get_resident_qr_codes
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_resident_qr_codes(p_resident_id integer, p_filter text DEFAULT 'active'::text)
 RETURNS SETOF resident_qr_codes
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF p_filter = 'active' THEN
    RETURN QUERY
    SELECT *
    FROM public.resident_qr_codes
    WHERE resident_id = p_resident_id
      AND status = 'active'
    ORDER BY created_at DESC;
  ELSE
    RETURN QUERY
    SELECT *
    FROM public.resident_qr_codes
    WHERE resident_id = p_resident_id
      AND status IN ('expired', 'revoked', 'used')
    ORDER BY created_at DESC;
  END IF;
END;
$function$
;

-- ----------------------------------------
-- Function: get_resident_units
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_resident_units(p_resident_id integer)
 RETURNS TABLE(id text, code_block text, number text, floor integer, building_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    u.id::text,
    u.code_block,
    u.number,
    u.floor,
    u.building_name
  FROM public.residents_units ru
  JOIN public.units u ON u.id = ru.unit_id
  WHERE ru.resident_id = p_resident_id;
END;
$function$
;

-- ----------------------------------------
-- Function: get_restaurants
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_restaurants(p_condominium_id integer)
 RETURNS SETOF restaurants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.restaurants
  WHERE condominium_id = p_condominium_id
  ORDER BY name;
END;
$function$
;

-- ----------------------------------------
-- Function: get_service_types
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_service_types()
 RETURNS SETOF service_types
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.service_types
  ORDER BY id;
END;
$function$
;

-- ----------------------------------------
-- Function: get_sports
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_sports(p_condominium_id integer)
 RETURNS SETOF sports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.sports
  WHERE condominium_id = p_condominium_id
  ORDER BY name;
END;
$function$
;

-- ----------------------------------------
-- Function: get_staff_by_condominium
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_by_condominium(p_condominium_id integer)
 RETURNS SETOF staff
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.staff
  WHERE condominium_id = p_condominium_id
  ORDER BY last_name, first_name;
END;
$function$
;

-- ----------------------------------------
-- Function: get_streets
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_streets(p_condominium_id integer)
 RETURNS SETOF streets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.streets
  WHERE condominium_id = p_condominium_id
  ORDER BY name;
END;
$function$
;

-- ----------------------------------------
-- Function: get_todays_visits
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_todays_visits(p_condominium_id integer)
 RETURNS TABLE(id integer, created_at timestamp with time zone, condominium_id integer, visitor_name text, visitor_doc text, visitor_phone text, visit_type_id integer, service_type_id integer, restaurant_id uuid, sport_id uuid, unit_id integer, reason text, photo_url text, qr_token text, qr_expires_at timestamp with time zone, check_in_at timestamp with time zone, check_out_at timestamp with time zone, status text, approval_mode text, guard_id integer, device_id uuid, visit_type_name text, service_type_name text, restaurant_name text, sport_name text, unit_block text, unit_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  v_start := date_trunc('day', now());
  v_end := v_start + interval '1 day';

  RETURN QUERY
  SELECT 
    v.id,
    v.created_at,
    v.condominium_id,
    v.visitor_name,
    v.visitor_doc,
    v.visitor_phone,
    v.visit_type_id,
    v.service_type_id,
    v.restaurant_id,
    v.sport_id,
    v.unit_id,
    v.reason,
    v.photo_url,
    v.qr_token,
    v.qr_expires_at,
    v.check_in_at,
    v.check_out_at,
    v.status,
    v.approval_mode,
    v.guard_id,
    v.device_id,
    vt.name AS visit_type_name,
    st.name AS service_type_name,
    r.name AS restaurant_name,
    s.name AS sport_name,
    u.code_block AS unit_block,
    u.number AS unit_number
  FROM public.visits v
  LEFT JOIN public.visit_types vt ON v.visit_type_id = vt.id
  LEFT JOIN public.service_types st ON v.service_type_id = st.id
  LEFT JOIN public.restaurants r ON v.restaurant_id = r.id
  LEFT JOIN public.sports s ON v.sport_id = s.id
  LEFT JOIN public.units u ON v.unit_id = u.id
  WHERE v.condominium_id = p_condominium_id
    AND v.check_in_at >= v_start
    AND v.check_in_at < v_end
  ORDER BY v.check_in_at DESC;
END;
$function$
;

-- ----------------------------------------
-- Function: get_unit_by_id
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_unit_by_id(p_unit_id integer)
 RETURNS TABLE(id integer, condominium_id integer, number text, code_block text, building_name text, floor text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.condominium_id,
    u.number,
    u.code_block,
    u.building_name,
    u.floor,
    u.created_at
  FROM public.units u
  WHERE u.id = p_unit_id
  LIMIT 1;
END;$function$
;

-- ----------------------------------------
-- Function: get_units
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_units(p_condominium_id integer)
 RETURNS TABLE(id integer, condominium_id integer, code_block text, number text, floor text, building_name text, residents jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select
    u.id,
    u.condominium_id,
    u.code_block,
    u.number,
    u.floor,
    u.building_name,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'phone', r.phone,
          'has_app_installed', r.has_app_installed,
          'device_token', r.device_token
        )
      ) filter (where r.id is not null),
      '[]'::jsonb
    ) as residents
  from public.units u
  left join public.residents r on r.unit_id = u.id
  where u.condominium_id = p_condominium_id
  group by u.id
  order by u.code_block, u.number;
end;
$function$
;

-- ----------------------------------------
-- Function: get_unread_notification_count
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_resident_id integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.notifications
  WHERE resident_id = p_resident_id
    AND read = false;

  RETURN v_count;
END;
$function$
;

-- ----------------------------------------
-- Function: get_visit_events
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_visit_events(p_visit_id integer)
 RETURNS SETOF visit_events
 LANGUAGE sql
AS $function$
  select *
  from public.visit_events
  where visit_id = p_visit_id
  order by event_at asc;
$function$
;

-- ----------------------------------------
-- Function: get_visit_types
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_visit_types(p_condominium_id integer DEFAULT NULL::integer)
 RETURNS SETOF visit_types
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT * FROM visit_types
  
$function$
;

-- ----------------------------------------
-- Function: get_visits_history
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_visits_history(p_unit_id integer, p_start timestamp with time zone, p_end timestamp with time zone, p_limit integer DEFAULT 100)
 RETURNS SETOF visits
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.visits
  WHERE unit_id = p_unit_id
    AND created_at >= p_start
    AND created_at <= p_end
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$function$
;

-- ----------------------------------------
-- Function: gin_extract_query_trgm
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$
;

-- ----------------------------------------
-- Function: gin_extract_value_trgm
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$
;

-- ----------------------------------------
-- Function: gin_trgm_consistent
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$
;

-- ----------------------------------------
-- Function: gin_trgm_triconsistent
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
 RETURNS "char"
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$
;

-- ----------------------------------------
-- Function: gtrgm_compress
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$
;

-- ----------------------------------------
-- Function: gtrgm_consistent
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$
;

-- ----------------------------------------
-- Function: gtrgm_decompress
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$
;

-- ----------------------------------------
-- Function: gtrgm_distance
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$
;

-- ----------------------------------------
-- Function: gtrgm_in
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$
;

-- ----------------------------------------
-- Function: gtrgm_options
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
 RETURNS void
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$
;

-- ----------------------------------------
-- Function: gtrgm_out
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$
;

-- ----------------------------------------
-- Function: gtrgm_penalty
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$
;

-- ----------------------------------------
-- Function: gtrgm_picksplit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$
;

-- ----------------------------------------
-- Function: gtrgm_same
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$
;

-- ----------------------------------------
-- Function: gtrgm_union
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$
;

-- ----------------------------------------
-- Function: log_audit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit(p_condominium_id integer, p_actor_id integer, p_action character varying, p_target_table character varying, p_target_id integer, p_details jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_audit_id INT;
BEGIN
  INSERT INTO audit_logs (
    condominium_id,
    actor_id,
    action,
    target_table,
    target_id,
    details
  ) VALUES (
    p_condominium_id,
    p_actor_id,
    p_action,
    p_target_table,
    p_target_id,
    p_details
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$function$
;

-- ----------------------------------------
-- Function: mark_all_notifications_read
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(p_resident_id integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count INT;
BEGIN
  UPDATE notifications
  SET 
    read = TRUE,
    updated_at = NOW()
  WHERE resident_id = p_resident_id
    AND read = FALSE;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

-- ----------------------------------------
-- Function: mark_notification_read
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id integer, p_resident_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE notifications
  SET 
    read = TRUE,
    updated_at = NOW()
  WHERE id = p_notification_id
    AND resident_id = p_resident_id
    AND read = FALSE;
  
  RETURN FOUND;
END;
$function$
;

-- ----------------------------------------
-- Function: mark_notification_read_unscoped
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notification_read_unscoped(p_notification_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.notifications
  SET read = true,
      updated_at = now()
  WHERE id = p_notification_id;
END;
$function$
;

-- ----------------------------------------
-- Function: mark_qr_code_used
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.mark_qr_code_used(p_qr_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$begin
  update resident_qr_codes
  set status = 'used',
      updated_at = now()
  where qr_code = p_qr_code
    and status = 'active';
end;$function$
;

-- ----------------------------------------
-- Function: register_device
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.register_device(p_data jsonb)
 RETURNS devices
 LANGUAGE plpgsql
AS $function$
declare
  v_row public.devices;
  v_identifier text;
begin
  v_identifier := p_data->>'device_identifier';
  if v_identifier is null or v_identifier = '' then
    raise exception 'device_identifier required';
  end if;

  select * into v_row
  from public.devices
  where device_identifier = v_identifier
  limit 1;

  if v_row.id is null then
    insert into public.devices (
      device_identifier,
      device_name,
      condominium_id,
      configured_at,
      last_seen_at,
      status,
      metadata
    )
    select
      device_identifier,
      device_name,
      condominium_id,
      configured_at,
      last_seen_at,
      status,
      metadata
    from jsonb_populate_record(null::public.devices, p_data)
    returning * into v_row;
  else
    v_row := public.admin_update_device(v_row.id, p_data);
  end if;

  return v_row;

exception when others then
  insert into public.device_registration_errors (
    device_identifier, error_message, payload
  ) values (
    v_identifier, sqlerrm, p_data
  );
  raise;
end;
$function$
;

-- ----------------------------------------
-- Function: register_resident_pin
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.register_resident_pin(p_phone text, p_pin_cleartext text, p_device_token text DEFAULT NULL::text)
 RETURNS TABLE(id integer, condominium_id integer, unit_id integer, name text, phone text, email text, has_app_installed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$DECLARE
  v_resident_id INTEGER;
  v_pin_hash TEXT;
BEGIN
  -- ValidaÃƒÂ§ÃƒÂµes
  IF LENGTH(p_pin_cleartext) < 4 OR LENGTH(p_pin_cleartext) > 6 THEN
    RAISE EXCEPTION 'PIN deve ter entre 4 e 6 dÃƒÂ­gitos';
  END IF;

  IF p_phone IS NULL OR LENGTH(TRIM(p_phone)) = 0 THEN
    RAISE EXCEPTION 'Telefone ÃƒÂ© obrigatÃƒÂ³rio';
  END IF;

  -- Normaliza telefone (remove espaÃƒÂ§os, traÃƒÂ§os, etc)
  p_phone := REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g');

  -- Verifica se residente existe e ainda nÃƒÂ£o tem PIN
  SELECT r.id INTO v_resident_id
  FROM residents r
  WHERE r.phone = p_phone
    AND (r.pin_hash IS NULL OR r.pin_hash = '')
  LIMIT 1;

  IF v_resident_id IS NULL THEN
    RAISE EXCEPTION 'Telefone nÃƒÂ£o encontrado ou jÃƒÂ¡ possui PIN cadastrado. Entre em contato com a administraÃƒÂ§ÃƒÂ£o.';
  END IF;

  -- Gera hash bcrypt do PIN
  v_pin_hash := crypt(p_pin_cleartext, gen_salt('bf', 10));

  -- Atualiza residente com PIN e marca app como instalado
  UPDATE residents
  SET 
    pin_hash = v_pin_hash,
    has_app_installed = TRUE,
    device_token = p_device_token,
    app_first_login_at = NOW(),
    app_last_seen_at = NOW()
  WHERE residents.id = v_resident_id;

  -- Retorna dados do residente (sem PIN hash)
  RETURN QUERY
  SELECT 
    re.id,
    re.condominium_id,
    re.unit_id,
    re.name,
    re.phone,
    re.email,
    re.has_app_installed
  FROM residents re
  WHERE re.id = v_resident_id;
END;$function$
;

-- ----------------------------------------
-- Function: request_pin_reset_otp
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.request_pin_reset_otp(p_phone text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(otp_id integer, phone text, expires_in_seconds integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_resident RECORD;
  v_otp_code TEXT;
  v_otp_id INTEGER;
  v_normalized_phone TEXT;
BEGIN
  -- Normaliza telefone
  v_normalized_phone := REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g');

  -- Valida telefone
  IF v_normalized_phone IS NULL OR LENGTH(v_normalized_phone) < 9 THEN
    RAISE EXCEPTION 'Telefone invÃƒÂ¡lido';
  END IF;

  -- Busca residente por telefone
  SELECT * INTO v_resident
  FROM residents r
  WHERE r.phone = v_normalized_phone
  LIMIT 1;

  IF v_resident.id IS NULL THEN
    -- Por seguranÃƒÂ§a, nÃƒÂ£o revela se telefone existe ou nÃƒÂ£o
    RAISE EXCEPTION 'Se o telefone estiver cadastrado, vocÃƒÂª receberÃƒÂ¡ um SMS com o cÃƒÂ³digo.';
  END IF;

  -- Verifica se residente jÃƒÂ¡ tem PIN (nÃƒÂ£o pode resetar se nunca configurou)
  IF v_resident.pin_hash IS NULL OR v_resident.pin_hash = '' THEN
    RAISE EXCEPTION 'PIN nÃƒÂ£o cadastrado. Realize o primeiro acesso atravÃƒÂ©s da opÃƒÂ§ÃƒÂ£o "Primeiro Acesso".';
  END IF;

  -- Gera cÃƒÂ³digo OTP de 6 dÃƒÂ­gitos
  v_otp_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

  -- Insere OTP na tabela (trigger irÃƒÂ¡ validar rate limit)
  INSERT INTO otp_codes (
    phone,
    code,
    purpose,
    resident_id,
    ip_address,
    user_agent
  )
  VALUES (
    v_normalized_phone,
    v_otp_code,
    'RESET_PIN',
    v_resident.id,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_otp_id;

  -- TODO: IntegraÃƒÂ§ÃƒÂ£o com serviÃƒÂ§o de SMS (Twilio, AWS SNS, etc.)
  -- Por ora, apenas retorna o cÃƒÂ³digo (em produÃƒÂ§ÃƒÂ£o, remover isso!)
  -- PERFORM send_sms(v_normalized_phone, 'Seu cÃƒÂ³digo de verificaÃƒÂ§ÃƒÂ£o Elite AccesControl: ' || v_otp_code);

  -- Log (opcional)
  RAISE NOTICE 'OTP gerado para telefone %: % (ID: %)', v_normalized_phone, v_otp_code, v_otp_id;

  RETURN QUERY
  SELECT
    v_otp_id,
    v_normalized_phone,
    600, -- 10 minutos em segundos
    'CÃƒÂ³digo enviado por SMS. VÃƒÂ¡lido por 10 minutos.'::TEXT;
END;
$function$
;

-- ----------------------------------------
-- Function: reset_pin_with_otp
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.reset_pin_with_otp(p_phone text, p_otp_code text, p_new_pin text)
 RETURNS TABLE(id integer, name text, phone text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_otp RECORD;
  v_resident RECORD;
  v_new_pin_hash TEXT;
  v_normalized_phone TEXT;
BEGIN
  -- Normaliza telefone
  v_normalized_phone := REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g');

  -- Valida novo PIN
  IF LENGTH(p_new_pin) < 4 OR LENGTH(p_new_pin) > 6 OR p_new_pin !~ '^\d+$' THEN
    RAISE EXCEPTION 'PIN deve ter entre 4 e 6 dÃƒÂ­gitos numÃƒÂ©ricos';
  END IF;

  -- Busca OTP mais recente e ainda vÃƒÂ¡lido
  SELECT * INTO v_otp
  FROM otp_codes
  WHERE phone = v_normalized_phone
    AND purpose = 'RESET_PIN'
    AND used_at IS NULL
    AND expires_at > NOW()
    AND attempts < max_attempts
  ORDER BY created_at DESC
  LIMIT 1;

  -- Verifica se OTP existe
  IF v_otp.id IS NULL THEN
    RAISE EXCEPTION 'CÃƒÂ³digo invÃƒÂ¡lido, expirado ou jÃƒÂ¡ utilizado. Solicite um novo cÃƒÂ³digo.';
  END IF;

  -- Incrementa tentativas
  UPDATE otp_codes
  SET attempts = attempts + 1
  WHERE id = v_otp.id;

  -- Verifica se cÃƒÂ³digo estÃƒÂ¡ correto
  IF v_otp.code != p_otp_code THEN
    -- Se atingiu mÃƒÂ¡ximo de tentativas, invalida o OTP
    IF v_otp.attempts + 1 >= v_otp.max_attempts THEN
      UPDATE otp_codes
      SET used_at = NOW()
      WHERE id = v_otp.id;

      RAISE EXCEPTION 'CÃƒÂ³digo incorreto. MÃƒÂ¡ximo de tentativas atingido. Solicite um novo cÃƒÂ³digo.';
    END IF;

    RAISE EXCEPTION 'CÃƒÂ³digo incorreto. Tentativa % de %.', v_otp.attempts + 1, v_otp.max_attempts;
  END IF;

  -- Busca residente
  SELECT * INTO v_resident
  FROM residents
  WHERE id = v_otp.resident_id;

  IF v_resident.id IS NULL THEN
    RAISE EXCEPTION 'Residente nÃƒÂ£o encontrado';
  END IF;

  -- Gera hash bcrypt do novo PIN
  v_new_pin_hash := crypt(p_new_pin, gen_salt('bf', 10));

  -- Atualiza PIN do residente
  UPDATE residents
  SET
    pin_hash = v_new_pin_hash,
    app_last_seen_at = NOW()
  WHERE id = v_resident.id;

  -- Marca OTP como utilizado
  UPDATE otp_codes
  SET used_at = NOW()
  WHERE id = v_otp.id;

  -- Invalida todos os outros OTPs deste residente (seguranÃƒÂ§a)
  UPDATE otp_codes
  SET used_at = NOW()
  WHERE resident_id = v_resident.id
    AND id != v_otp.id
    AND used_at IS NULL;

  -- Log de auditoria
  RAISE NOTICE 'PIN resetado com sucesso para residente % (ID: %)', v_resident.name, v_resident.id;

  RETURN QUERY
  SELECT
    v_resident.id,
    v_resident.name,
    v_resident.phone,
    'PIN alterado com sucesso!'::TEXT;
END;
$function$
;

-- ----------------------------------------
-- Function: revoke_qr_code
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_qr_code(p_qr_code_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE resident_qr_codes
  SET status = 'revoked', updated_at = NOW()
  WHERE id = p_qr_code_id;
  
  IF FOUND THEN
    RETURN QUERY SELECT TRUE::BOOLEAN, 'QR code revoked successfully'::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE::BOOLEAN, 'QR code not found'::TEXT;
  END IF;
END;
$function$
;

-- ----------------------------------------
-- Function: revoke_resident_qr_code
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_resident_qr_code(p_qr_id uuid)
 RETURNS SETOF resident_qr_codes
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.resident_qr_codes
  SET status = 'revoked',
      updated_at = now()
  WHERE id = p_qr_id
  RETURNING *;
END;
$function$
;

-- ----------------------------------------
-- Function: set_condo_visitor_photo_setting
-- ----------------------------------------
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
$function$
;

-- ----------------------------------------
-- Function: set_limit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.set_limit(real)
 RETURNS real
 LANGUAGE c
 STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$
;

-- ----------------------------------------
-- Function: set_resident_push_token
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.set_resident_push_token(p_resident_id integer, p_push_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.residents
  SET push_token = p_push_token
  WHERE id = p_resident_id;
END;
$function$
;

-- ----------------------------------------
-- Function: show_limit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$
;

-- ----------------------------------------
-- Function: show_trgm
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$
;

-- ----------------------------------------
-- Function: similarity
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$
;

-- ----------------------------------------
-- Function: similarity_dist
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$
;

-- ----------------------------------------
-- Function: similarity_op
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$
;

-- ----------------------------------------
-- Function: strict_word_similarity
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$
;

-- ----------------------------------------
-- Function: strict_word_similarity_commutator_op
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$
;

-- ----------------------------------------
-- Function: strict_word_similarity_dist_commutator_op
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$
;

-- ----------------------------------------
-- Function: strict_word_similarity_dist_op
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$
;

-- ----------------------------------------
-- Function: strict_word_similarity_op
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$
;

-- ----------------------------------------
-- Function: update_condominium_news_image
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.update_condominium_news_image(p_news_id integer, p_image_url text)
 RETURNS SETOF condominium_news
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.condominium_news
  SET image_url = p_image_url,
      updated_at = now()
  WHERE id = p_news_id
  RETURNING *;
END;
$function$
;

-- ----------------------------------------
-- Function: update_device_heartbeat
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.update_device_heartbeat(p_identifier text)
 RETURNS devices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.devices;
BEGIN
  UPDATE public.devices
  SET last_seen_at = now()
  WHERE device_identifier = p_identifier
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: update_device_status
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.update_device_status(p_id integer, p_status text)
 RETURNS devices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.devices;
BEGIN
  UPDATE public.devices
  SET status = p_status
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: update_incident_status
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.update_incident_status(p_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS incidents
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_row public.incidents;
  v_existing_notes text;
  v_next_notes text;
BEGIN
  SELECT guard_notes
  INTO v_existing_notes
  FROM public.incidents
  WHERE id = p_id;

  IF p_notes IS NULL OR btrim(p_notes) = '' THEN
    v_next_notes := v_existing_notes;
  ELSIF v_existing_notes IS NULL OR btrim(v_existing_notes) = '' THEN
    v_next_notes := p_notes;
  ELSE
    v_next_notes := v_existing_notes || E'\n---\n' || p_notes;
  END IF;

  UPDATE public.incidents
  SET
    status = p_status,
    guard_notes = v_next_notes,
    resolved_at = CASE
      WHEN p_status = 'resolved' AND resolved_at IS NULL THEN now()
      ELSE resolved_at
    END
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: update_notification_preferences
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.update_notification_preferences(p_resident_id integer, p_preferences jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_prefs jsonb;
BEGIN
  UPDATE public.residents
  SET notification_preferences = p_preferences
  WHERE id = p_resident_id
  RETURNING notification_preferences
  INTO v_prefs;

  RETURN v_prefs;
END;
$function$
;

-- ----------------------------------------
-- Function: update_resident
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.update_resident(p_resident_id integer, p_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text, p_push_token text DEFAULT NULL::text, p_notification_preferences jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(id integer, name text, phone text, email text, avatar_url text, condominium_id integer, unit_id integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.residents r
  SET
    name = COALESCE(p_name, r.name),
    phone = COALESCE(p_phone, r.phone),
    email = COALESCE(p_email, r.email),
    avatar_url = COALESCE(p_avatar_url, r.avatar_url),
    push_token = COALESCE(p_push_token, r.push_token),
    notification_preferences = COALESCE(p_notification_preferences, r.notification_preferences)
  WHERE r.id = p_resident_id
  RETURNING
    r.id,
    r.name,
    r.phone,
    r.email,
    r.avatar_url,
    r.condominium_id,
    r.unit_id,
    r.created_at;
END;
$function$
;

-- ----------------------------------------
-- Function: update_resident_app_activity
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.update_resident_app_activity(p_resident_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE residents
  SET app_last_seen_at = NOW()
  WHERE id = p_resident_id AND has_app_installed = TRUE;
END;
$function$
;

-- ----------------------------------------
-- Function: update_resident_qr_code
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.update_resident_qr_code(p_qr_id uuid, p_qr_code text, p_is_recurring boolean DEFAULT NULL::boolean, p_recurrence_pattern text DEFAULT NULL::text, p_recurrence_days jsonb DEFAULT NULL::jsonb, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS SETOF resident_qr_codes
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.resident_qr_codes
  SET
    qr_code = COALESCE(p_qr_code, qr_code),
    is_recurring = COALESCE(p_is_recurring, is_recurring),
    recurrence_pattern = COALESCE(p_recurrence_pattern, recurrence_pattern),
    recurrence_days = COALESCE(p_recurrence_days, recurrence_days),
    start_date = COALESCE(p_start_date, start_date),
    end_date = COALESCE(p_end_date, end_date),
    updated_at = now()
  WHERE id = p_qr_id
  RETURNING *;
END;
$function$
;

-- ----------------------------------------
-- Function: update_visit_status
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.update_visit_status(p_id integer, p_status text)
 RETURNS visits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.visits;
BEGIN
  UPDATE public.visits
  SET status = p_status
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

-- ----------------------------------------
-- Function: upsert_resident_device
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_resident_device(p_resident_id integer, p_push_token text, p_device_name text, p_platform text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.resident_devices (
    resident_id,
    push_token,
    device_name,
    platform,
    last_active
  ) VALUES (
    p_resident_id,
    p_push_token,
    p_device_name,
    p_platform,
    now()
  )
  ON CONFLICT (resident_id, push_token)
  DO UPDATE SET
    device_name = EXCLUDED.device_name,
    platform = EXCLUDED.platform,
    last_active = EXCLUDED.last_active;
END;
$function$
;

-- ----------------------------------------
-- Function: validate_qr_code
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.validate_qr_code(p_qr_code text)
 RETURNS TABLE(is_valid boolean, resident_id integer, unit_id integer, visitor_name text, visitor_phone text, purpose text, notes text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_qr record;
  v_today_weekday text;
begin
  select * into v_qr
  from resident_qr_codes
  where qr_code = p_qr_code;

  if v_qr is null then
    return query
    select
      false::boolean,
      null::int4,
      null::int4,
      null::text,
      null::text,
      null::text,
      null::text,
      'QR code nÃƒÂ£o encontrado'::text;
    return;
  end if;

  if v_qr.status != 'active' then
    return query
    select
      false::boolean,
      v_qr.resident_id::int4,
      v_qr.unit_id::int4,
      v_qr.visitor_name,
      v_qr.visitor_phone,
      v_qr.purpose,
      v_qr.notes,
      ('QR code ÃƒÂ© ' || v_qr.status)::text;
    return;
  end if;

  -- Check if recurring or one-time
  if v_qr.is_recurring = true then
    -- Check start date
    if v_qr.start_date is not null and v_qr.start_date > current_date then
      return query
      select
        false::boolean,
        v_qr.resident_id::int4,
        v_qr.unit_id::int4,
        v_qr.visitor_name,
        v_qr.visitor_phone,
        v_qr.purpose,
        v_qr.notes,
        'QR code nÃƒÂ£o estÃƒÂ¡ activo'::text;
      return;
    end if;

    -- Check end date
    if v_qr.end_date is not null and v_qr.end_date < current_date then
      return query
      select
        false::boolean,
        v_qr.resident_id::int4,
        v_qr.unit_id::int4,
        v_qr.visitor_name,
        v_qr.visitor_phone,
        v_qr.purpose,
        v_qr.notes,
        'QR Code Recorrente terminou o prazo de validade'::text;
      return;
    end if;

    -- Check weekday for weekly pattern
    if v_qr.recurrence_pattern = 'WEEKLY' and v_qr.recurrence_days is not null then
      v_today_weekday := upper(to_char(current_date, 'DY'));
      if not (v_qr.recurrence_days::jsonb ? v_today_weekday) then
        return query
        select
          false::boolean,
          v_qr.resident_id::int4,
          v_qr.unit_id::int4,
          v_qr.visitor_name,
          v_qr.visitor_phone,
          v_qr.purpose,
          v_qr.notes,
          'Este QR code nÃƒÂ£o ÃƒÂ© vÃƒÂ¡lido neste dia da semana'::text;
        return;
      end if;
    end if;
  else
    -- One-time: check expires_at
    if v_qr.expires_at <= now() then
      return query
      select
        false::boolean,
        v_qr.resident_id::int4,
        v_qr.unit_id::int4,
        v_qr.visitor_name,
        v_qr.visitor_phone,
        v_qr.purpose,
        v_qr.notes,
        'QR code expirou'::text;
      return;
    end if;
  end if;

  return query
  select
    true::boolean,
    v_qr.resident_id::int4,
    v_qr.unit_id::int4,
    v_qr.visitor_name,
    v_qr.visitor_phone,
    v_qr.purpose,
    v_qr.notes,
    'QR code ÃƒÂ© vÃƒÂ¡lido'::text;
end;
$function$
;

-- ----------------------------------------
-- Function: verify_resident_login
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.verify_resident_login(p_phone text, p_pin_cleartext text, p_device_token text DEFAULT NULL::text)
 RETURNS TABLE(id integer, condominium_id integer, unit_id integer, name text, phone text, email text, has_app_installed boolean, pin_hash text, avatar_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_resident RECORD;
BEGIN
  -- ValidaÃƒÂ§ÃƒÂµes
  IF p_phone IS NULL OR LENGTH(TRIM(p_phone)) = 0 THEN
    RAISE EXCEPTION 'Telefone ÃƒÂ© obrigatÃƒÂ³rio';
  END IF;

  IF p_pin_cleartext IS NULL OR LENGTH(TRIM(p_pin_cleartext)) = 0 THEN
    RAISE EXCEPTION 'PIN ÃƒÂ© obrigatÃƒÂ³rio';
  END IF;

  -- Normaliza telefone
  p_phone := REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g');

  -- Busca residente por telefone
  SELECT * INTO v_resident
  FROM residents r
  WHERE r.phone = p_phone
  LIMIT 1;

  -- Verifica se residente existe
  IF v_resident.id IS NULL THEN
    RAISE EXCEPTION 'Telefone nÃƒÂ£o encontrado';
  END IF;

  -- Verifica se residente tem PIN cadastrado
  IF v_resident.pin_hash IS NULL OR v_resident.pin_hash = '' THEN
    RAISE EXCEPTION 'PIN nÃƒÂ£o cadastrado. Realize o primeiro acesso.';
  END IF;

  -- Verifica PIN usando bcrypt
  IF NOT (v_resident.pin_hash = crypt(p_pin_cleartext, v_resident.pin_hash)) THEN
    RAISE EXCEPTION 'PIN incorreto';
  END IF;

  -- Atualiza ÃƒÂºltimo acesso e device token (se fornecido)
  UPDATE residents
  SET 
    app_last_seen_at = NOW(),
    device_token = COALESCE(p_device_token, device_token)
  WHERE residents.id = v_resident.id;

  -- Retorna dados do residente (incluindo hash para cache offline)
  RETURN QUERY
  SELECT 
    v_resident.id,
    v_resident.condominium_id,
    v_resident.unit_id,
    v_resident.name,
    v_resident.phone,
    v_resident.email,
    v_resident.has_app_installed,
    v_resident.pin_hash,
    v_resident.avatar_url
  ;
END;
$function$
;

-- ----------------------------------------
-- Function: verify_staff_login
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.verify_staff_login(p_first_name text, p_last_name text, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$DECLARE
  found_staff record;
BEGIN
  SELECT s.*, c.latitude, c.longitude, c.gps_radius_meters 
  INTO found_staff
  FROM staff s
  left JOIN condominiums c ON s.condominium_id = c.id
  WHERE lower(s.first_name) = lower(p_first_name)
    AND lower(s.last_name) = lower(p_last_name)
    AND s.pin_hash = crypt(p_pin, s.pin_hash) -- ComparaÃƒÂ§ÃƒÂ£o segura
    AND
    ( 
      s.role = 'SUPER_ADMIN'
      or (c.id is not null and c.status = 'ACTIVE')
    );
    
  IF found_staff.id IS NOT NULL THEN
    RETURN json_build_object(
      'id', found_staff.id,
      'first_name', found_staff.first_name,
      'last_name', found_staff.last_name,
      'condominium_id', found_staff.condominium_id,
      'role', found_staff.role,
      'condominium', json_build_object(
          'id', found_staff.condominium_id,
          'latitude', found_staff.latitude,
          'longitude', found_staff.longitude,
          'gps_radius_meters', found_staff.gps_radius_meters
      )
    );
  ELSE
    RETURN NULL;
  END IF;
END;$function$
;

-- ----------------------------------------
-- Function: word_similarity
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$
;

-- ----------------------------------------
-- Function: word_similarity_commutator_op
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$
;

-- ----------------------------------------
-- Function: word_similarity_dist_commutator_op
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$
;

-- ----------------------------------------
-- Function: word_similarity_dist_op
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$
;

-- ----------------------------------------
-- Function: word_similarity_op
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.get_resident_stats(
  p_resident_id integer,
  p_unit_id integer,
  p_period text DEFAULT 'month'    -- 'week' | 'month' | 'year' | 'all'
)
 RETURNS TABLE(
   period_label text,
   visits_total integer,
   visits_approved integer,
   visits_denied integer,
   visits_by_type jsonb,
   qr_codes_generated integer,
   qr_codes_active integer,
   incidents_reported integer,
   top_visitors jsonb,
   busiest_day_of_week text,
   busiest_hour integer,
   prev_period_visits integer
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_end timestamptz := now();
  v_prev_start timestamptz;
  v_prev_end timestamptz;
BEGIN
  CASE p_period
    WHEN 'week' THEN
      v_start := date_trunc('week', now());
      v_prev_start := v_start - interval '1 week';
      v_prev_end := v_start;
    WHEN 'month' THEN
      v_start := date_trunc('month', now());
      v_prev_start := v_start - interval '1 month';
      v_prev_end := v_start;
    WHEN 'year' THEN
      v_start := date_trunc('year', now());
      v_prev_start := v_start - interval '1 year';
      v_prev_end := v_start;
    ELSE
      v_start := '1970-01-01'::timestamptz;
      v_prev_start := v_start;
      v_prev_end := v_start;
  END CASE;

  RETURN QUERY
  SELECT
    p_period,
    (SELECT COUNT(*)::integer FROM visits WHERE unit_id = p_unit_id AND created_at >= v_start),
    (SELECT COUNT(*)::integer FROM visits WHERE unit_id = p_unit_id AND created_at >= v_start AND status = 'AUTORIZADO'),
    (SELECT COUNT(*)::integer FROM visits WHERE unit_id = p_unit_id AND created_at >= v_start AND status = 'NEGADO'),
    (SELECT COALESCE(jsonb_object_agg(type_name, cnt), '{}'::jsonb) FROM
      (SELECT vt.name AS type_name, COUNT(*)::integer AS cnt
       FROM visits v
       LEFT JOIN visit_types vt ON v.visit_type_id = vt.id
       WHERE v.unit_id = p_unit_id AND v.created_at >= v_start
       GROUP BY vt.name) sub),
    (SELECT COUNT(*)::integer FROM resident_qr_codes WHERE resident_id = p_resident_id AND created_at >= v_start),
    (SELECT COUNT(*)::integer
     FROM resident_qr_codes
     WHERE resident_id = p_resident_id
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())),
    (SELECT COUNT(*)::integer FROM incidents WHERE resident_id = p_resident_id AND reported_at >= v_start),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', visitor_name, 'phone', visitor_phone, 'count', cnt)), '[]'::jsonb)
     FROM (SELECT visitor_name, visitor_phone, COUNT(*)::integer AS cnt
           FROM visits
           WHERE unit_id = p_unit_id AND created_at >= v_start AND visitor_name IS NOT NULL
           GROUP BY visitor_name, visitor_phone
           ORDER BY cnt DESC LIMIT 5) top),
    (SELECT TO_CHAR(created_at, 'FMDay') FROM visits
     WHERE unit_id = p_unit_id AND created_at >= v_start
     GROUP BY TO_CHAR(created_at, 'FMDay')
     ORDER BY COUNT(*) DESC LIMIT 1),
    (SELECT EXTRACT(HOUR FROM created_at)::integer FROM visits
     WHERE unit_id = p_unit_id AND created_at >= v_start
     GROUP BY EXTRACT(HOUR FROM created_at)
     ORDER BY COUNT(*) DESC LIMIT 1),
    (SELECT COUNT(*)::integer FROM visits
     WHERE unit_id = p_unit_id AND created_at >= v_prev_start AND created_at < v_prev_end);
END;
$function$;


CREATE INDEX IF NOT EXISTS idx_visits_unit_created_at
ON public.visits (unit_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_visits_unit_created_status
ON public.visits (unit_id, created_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_resident_qr_codes_resident_created_at
ON public.resident_qr_codes (resident_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resident_qr_codes_resident_status_expires
ON public.resident_qr_codes (resident_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_incidents_resident_reported_at
ON public.incidents (resident_id, reported_at DESC);


CREATE OR REPLACE FUNCTION public.upsert_frequent_visitor(
  p_resident_id integer,
  p_name text,
  p_phone text,
  p_purpose text DEFAULT 'guest',
  p_notes text DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.resident_frequent_visitors (resident_id, name, phone, purpose, notes)
  VALUES (p_resident_id, p_name, p_phone, p_purpose, p_notes)
  ON CONFLICT (resident_id, phone)
  DO UPDATE SET
    name = EXCLUDED.name,
    purpose = EXCLUDED.purpose,
    notes = COALESCE(EXCLUDED.notes, resident_frequent_visitors.notes),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_frequent_visitor_usage(
  p_resident_id integer,
  p_phone text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.resident_frequent_visitors
  SET use_count = use_count + 1,
      last_used_at = now(),
      updated_at = now()
  WHERE resident_id = p_resident_id AND phone = p_phone;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_frequent_visitor(
  p_id uuid,
  p_resident_id integer
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.resident_frequent_visitors
  WHERE id = p_id AND resident_id = p_resident_id;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_frequent_visitor(
  p_id uuid,
  p_resident_id integer,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_purpose text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
 RETURNS SETOF resident_frequent_visitors
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.resident_frequent_visitors
  SET
    name = COALESCE(p_name, name),
    phone = COALESCE(p_phone, phone),
    purpose = COALESCE(p_purpose, purpose),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_id AND resident_id = p_resident_id
  RETURNING *;
END;
$function$;

CREATE TABLE IF NOT EXISTS public.resident_frequent_visitors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  resident_id integer NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  purpose text DEFAULT 'guest' CHECK (purpose IN ('guest', 'delivery', 'service', 'other')),
  notes text,
  avatar_url text,
  use_count integer DEFAULT 0,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frequent_visitors_resident_id
  ON public.resident_frequent_visitors(resident_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frequent_visitors_unique
  ON public.resident_frequent_visitors(resident_id, phone);

CREATE OR REPLACE FUNCTION public.get_frequent_visitors(p_resident_id integer)
 RETURNS TABLE(
   id uuid,
   name text,
   phone text,
   purpose text,
   notes text,
   avatar_url text,
   use_count integer,
   last_used_at timestamptz,
   created_at timestamptz
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT fv.id, fv.name, fv.phone, fv.purpose, fv.notes, fv.avatar_url,
    fv.use_count, fv.last_used_at, fv.created_at
  FROM public.resident_frequent_visitors fv
  WHERE fv.resident_id = p_resident_id
  ORDER BY fv.use_count DESC, fv.last_used_at DESC NULLS LAST;
END;
$function$;
-- END CANONICAL RPC CATALOG
