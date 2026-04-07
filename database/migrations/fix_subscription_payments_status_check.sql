-- Fix for Subscription Payments Status Check
-- Run this in the Supabase SQL Editor to allow 'PARTIAL' status

ALTER TABLE public.subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_status_check;
ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_status_check CHECK (status IN ('PAID', 'PENDING', 'FAILED', 'PARTIAL'));

-- Update RPC to return condominium name
-- NOTE: We must DROP it first because the return type is changing
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
