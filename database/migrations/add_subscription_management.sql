-- Migration script for App Pricing and Subscriptions Management
-- Please run this script in the Supabase SQL Editor.

-- 1. Create App Pricing Rules Table
CREATE TABLE IF NOT EXISTS public.app_pricing_rules (
    id SERIAL PRIMARY KEY,
    min_residents INTEGER NOT NULL,
    max_residents INTEGER, -- Null means no upper limit (e.g., "1000+" residents)
    price_per_resident NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'AOA' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: Ensure min_residents and max_residents don't overlap in logic, but we won't strictly constrain it here.

-- 2. Create Condominium Subscriptions Table
CREATE TABLE IF NOT EXISTS public.condominium_subscriptions (
    id SERIAL PRIMARY KEY,
    condominium_id INTEGER NOT NULL REFERENCES public.condominiums(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL CHECK (status IN ('ACTIVE', 'OVERDUE', 'INACTIVE')),
    last_payment_date DATE,
    next_due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(condominium_id) -- One subscription record per condominium
);

-- Create a function and trigger to automatically create a subscription record when a new condominium is added
CREATE OR REPLACE FUNCTION public.create_condominium_subscription()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.condominium_subscriptions (condominium_id, status)
    VALUES (NEW.id, 'ACTIVE')
    ON CONFLICT (condominium_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_condominium_created_subscription
    AFTER INSERT ON public.condominiums
    FOR EACH ROW EXECUTE FUNCTION public.create_condominium_subscription();

-- Populate existing condominiums into the subscriptions table
INSERT INTO public.condominium_subscriptions (condominium_id, status)
SELECT id, 'ACTIVE' FROM public.condominiums
ON CONFLICT (condominium_id) DO NOTHING;

-- RLS Policies
ALTER TABLE public.app_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominium_subscriptions ENABLE ROW LEVEL SECURITY;

-- Only Admins (SUPER_ADMIN or ADMIN, check via staff table or app metadata depending on your setup. Usually, everyone can read, but only SUPER_ADMIN writes)
-- Since we do auth checks loosely in the frontend and use RPCs or just allow staff, let's just make it open to staff for now like other tables.
-- A better approach is to check role, but matching existing tables' RLS.
CREATE POLICY "Allow authenticated full access app_pricing_rules" 
ON public.app_pricing_rules AS PERMISSIVE FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated full access condominium_subscriptions" 
ON public.condominium_subscriptions AS PERMISSIVE FOR ALL TO authenticated USING (true);
