-- Migration script for Subscription Payments and Reporting
-- Please run this script in the Supabase SQL Editor.

-- 1. Create Subscription Payments Table
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id SERIAL PRIMARY KEY,
    condominium_id INTEGER NOT NULL REFERENCES public.condominiums(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'AOA' NOT NULL,
    payment_date DATE NOT NULL,
    reference_period VARCHAR(20), -- e.g., '2026-03' or 'Março 2026'
    status VARCHAR(20) DEFAULT 'PAID' NOT NULL CHECK (status IN ('PAID', 'PENDING', 'FAILED', 'PARTIAL')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access subscription_payments" 
ON public.subscription_payments AS PERMISSIVE FOR ALL TO authenticated USING (true);
