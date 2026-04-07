-- Update Subscription Status Constraint to allow 'TRIAL'
ALTER TABLE public.condominium_subscriptions 
DROP CONSTRAINT IF EXISTS condominium_subscriptions_status_check;

ALTER TABLE public.condominium_subscriptions 
ADD CONSTRAINT condominium_subscriptions_status_check 
CHECK (status IN ('ACTIVE', 'OVERDUE', 'INACTIVE', 'TRIAL', 'SUSPENDED'));

-- Refine admin_update_subscription_details to be more robust
CREATE OR REPLACE FUNCTION public.admin_update_subscription_details(
  p_id INTEGER,
  p_condominium_id INTEGER,
  p_status VARCHAR DEFAULT NULL,
  p_custom_price_per_resident NUMERIC DEFAULT NULL,
  p_discount_percentage NUMERIC DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;
