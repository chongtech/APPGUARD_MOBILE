-- Add performance indexes for subscription and payment queries
-- These indexes will speed up the admin_get_condominium_subscriptions RPC
-- and general dashboard loading times.

-- 1. Index for querying subscriptions by condominium
CREATE INDEX IF NOT EXISTS idx_condominium_subscriptions_condo 
ON public.condominium_subscriptions(condominium_id);

-- 2. Index for querying payments by condominium and reference period
-- This is heavily used in the arrears calculation loop
CREATE INDEX IF NOT EXISTS idx_subscription_payments_condo_period 
ON public.subscription_payments(condominium_id, reference_period);

-- 3. Index for filtering payments by status (used to check PAID/PARTIAL)
CREATE INDEX IF NOT EXISTS idx_subscription_payments_status 
ON public.subscription_payments(status);

-- 4. Index for residents by condominium to speed up the resident counting 
-- (You might already have this, but CREATE INDEX IF NOT EXISTS is safe)
CREATE INDEX IF NOT EXISTS idx_residents_condominium_id 
ON public.residents(condominium_id);
