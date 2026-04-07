-- Migration: Add visitor_photo_enabled to condominiums
-- Apply manually via Supabase SQL Editor

-- 1. Add column (DEFAULT true preserves existing condominiums behaviour)
ALTER TABLE condominiums
  ADD COLUMN IF NOT EXISTS visitor_photo_enabled BOOLEAN NOT NULL DEFAULT true;

-- 2. RPC callable during device setup
--    SECURITY DEFINER: allows the unauthenticated setup screen to write to
--    condominiums without triggering RLS, while still being a named, auditable operation.
CREATE OR REPLACE FUNCTION set_condo_visitor_photo_setting(
  p_condo_id INTEGER,
  p_enabled   BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE condominiums
  SET visitor_photo_enabled = p_enabled
  WHERE id = p_condo_id;
END;
$$;
