-- "Master" Version of admin_get_condominium_subscriptions
-- Returns detailed arrears as a JSON array [ { period, expected, paid }, ... ]

DROP FUNCTION IF EXISTS public.admin_get_condominium_subscriptions();

CREATE OR REPLACE FUNCTION public.admin_get_condominium_subscriptions()
RETURNS TABLE (
  id BIGINT,
  condominium_id BIGINT,
  status TEXT,
  custom_price_per_resident NUMERIC,
  discount_percentage NUMERIC,
  last_payment_date DATE,
  next_due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  condominium_name TEXT,
  current_residents_count BIGINT,
  payment_status TEXT,
  months_in_arrears BIGINT,
  missing_months_list TEXT,
  arrears_details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_current_period TEXT := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
  v_global_start DATE := '2025-01-01'::DATE;
BEGIN
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
    -- Analyze every month for every condo
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
      DATE_TRUNC('month', v_today),
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
$$;
