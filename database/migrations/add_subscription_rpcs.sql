-- RPCs for Subscription Management (Bypassing RLS with SECURITY DEFINER)
-- Run this in the Supabase SQL Editor

-- Pricing Rules
CREATE OR REPLACE FUNCTION public.admin_get_app_pricing_rules()
RETURNS SETOF public.app_pricing_rules
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.app_pricing_rules ORDER BY min_residents ASC;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_app_pricing_rule(
  p_min_residents INTEGER,
  p_max_residents INTEGER,
  p_price_per_resident NUMERIC,
  p_currency VARCHAR
)
RETURNS public.app_pricing_rules
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule public.app_pricing_rules;
BEGIN
  INSERT INTO public.app_pricing_rules (min_residents, max_residents, price_per_resident, currency)
  VALUES (p_min_residents, p_max_residents, p_price_per_resident, p_currency)
  RETURNING * INTO v_rule;
  
  RETURN v_rule;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_app_pricing_rule(
  p_id INTEGER,
  p_min_residents INTEGER,
  p_max_residents INTEGER,
  p_price_per_resident NUMERIC,
  p_currency VARCHAR
)
RETURNS public.app_pricing_rules
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_app_pricing_rule(
  p_id INTEGER
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.app_pricing_rules WHERE id = p_id;
  RETURN FOUND;
END;
$$;


-- Subscriptions
CREATE OR REPLACE FUNCTION public.admin_get_condominium_subscriptions()
RETURNS TABLE (
  id INTEGER,
  condominium_id INTEGER,
  status VARCHAR,
  custom_price_per_resident NUMERIC,
  discount_percentage NUMERIC,
  last_payment_date DATE,
  next_due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  condominium_name VARCHAR
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    s.id, 
    s.condominium_id, 
    s.status, 
    s.custom_price_per_resident, 
    s.discount_percentage,
    s.last_payment_date, 
    s.next_due_date, 
    s.created_at, 
    s.updated_at,
    c.name as condominium_name
  FROM public.condominium_subscriptions s
  JOIN public.condominiums c ON s.condominium_id = c.id;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_subscription_status(
  p_id INTEGER,
  p_condominium_id INTEGER,
  p_status VARCHAR
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_update_subscription_details(
  p_id INTEGER,
  p_condominium_id INTEGER,
  p_status VARCHAR,
  p_custom_price_per_resident NUMERIC,
  p_discount_percentage NUMERIC
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_id < 0 THEN
    INSERT INTO public.condominium_subscriptions (condominium_id, status, custom_price_per_resident, discount_percentage)
    VALUES (p_condominium_id, p_status, p_custom_price_per_resident, COALESCE(p_discount_percentage, 0))
    ON CONFLICT (condominium_id) DO UPDATE SET 
      status = EXCLUDED.status,
      custom_price_per_resident = EXCLUDED.custom_price_per_resident,
      discount_percentage = EXCLUDED.discount_percentage,
      updated_at = NOW();
  ELSE
    UPDATE public.condominium_subscriptions
    SET 
      status = COALESCE(p_status, status),
      custom_price_per_resident = p_custom_price_per_resident,
      discount_percentage = COALESCE(p_discount_percentage, discount_percentage),
      updated_at = NOW()
    WHERE id = p_id;
  END IF;
  RETURN TRUE;
END;
$$;


-- Payments
-- NOTE: We must DROP it first because the return type is changing from SETOF to TABLE
DROP FUNCTION IF EXISTS public.admin_get_subscription_payments(integer, integer, integer);
DROP FUNCTION IF EXISTS public.admin_get_subscription_payments(bigint, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_get_subscription_payments(
  p_condominium_id BIGINT,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS TABLE (
  id BIGINT,
  condominium_id BIGINT,
  amount NUMERIC,
  currency TEXT,
  payment_date DATE,
  reference_period TEXT,
  status TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  condominium_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_create_subscription_payment(
  p_condominium_id INTEGER,
  p_amount NUMERIC,
  p_currency VARCHAR,
  p_payment_date DATE,
  p_reference_period VARCHAR,
  p_status VARCHAR,
  p_notes TEXT
)
RETURNS public.subscription_payments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;
