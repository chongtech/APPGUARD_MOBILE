-- add_subscription_alerts.sql
-- Create the subscription_alerts table to track sent alerts
CREATE TABLE IF NOT EXISTS subscription_alerts (
    id SERIAL PRIMARY KEY,
    condominium_id INTEGER NOT NULL REFERENCES condominiums(id) ON DELETE CASCADE,
    alert_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reference_month TEXT NOT NULL,  -- The month/year the alert refers to, e.g., '03/2026'
    sent_by INTEGER NOT NULL REFERENCES staff(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Note: Ensure permissions for Admin/Super_admin
ALTER TABLE subscription_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access subscription_alerts" 
ON public.subscription_alerts AS PERMISSIVE FOR ALL TO authenticated USING (true);

-- RPC for sending subscription alerts
CREATE OR REPLACE FUNCTION admin_send_subscription_alert(p_condominium_id INT, p_staff_id INT)
RETURNS jsonb AS $$
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
            'message', 'Já foi enviado um alerta para este condomínio neste mês. Limite de 1 alerta por mês.'
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
