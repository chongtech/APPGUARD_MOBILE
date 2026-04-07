-- Migration script for Custom Subscription Exceptions and Discounts
-- Please run this script in the Supabase SQL Editor.

ALTER TABLE public.condominium_subscriptions
ADD COLUMN IF NOT EXISTS custom_price_per_resident NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5, 2) DEFAULT 0;
