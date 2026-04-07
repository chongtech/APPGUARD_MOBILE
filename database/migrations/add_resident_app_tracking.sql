

-- ============================================================================
-- 3. Create function to update resident last seen
-- ============================================================================

CREATE OR REPLACE FUNCTION update_resident_app_activity(
  p_resident_id INT4
)
RETURNS VOID AS $$
BEGIN
  UPDATE residents
  SET app_last_seen_at = NOW()
  WHERE id = p_resident_id AND has_app_installed = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. Create function to check if unit has app (for guard app)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_unit_has_app(
  p_unit_id INT4
)
RETURNS JSON AS $$
DECLARE
  v_has_app BOOLEAN;
  v_resident_count INT4;
  v_app_resident_count INT4;
  v_result JSON;
BEGIN
  -- Count total residents
  SELECT COUNT(*) INTO v_resident_count
  FROM residents
  WHERE unit_id = p_unit_id;

  -- Count residents with app
  SELECT COUNT(*) INTO v_app_resident_count
  FROM residents
  WHERE unit_id = p_unit_id AND has_app_installed = TRUE;

  -- Determine if unit has app (at least one resident)
  v_has_app := (v_app_resident_count > 0);

  -- Build result
  SELECT json_build_object(
    'unit_id', p_unit_id,
    'has_app', v_has_app,
    'total_residents', v_resident_count,
    'residents_with_app', v_app_resident_count,
    'coverage_percent',
      CASE
        WHEN v_resident_count > 0
        THEN ROUND((v_app_resident_count::NUMERIC / v_resident_count::NUMERIC) * 100, 1)
        ELSE 0
      END
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. Create view for app adoption statistics (admin dashboard)
-- ============================================================================

CREATE OR REPLACE VIEW v_app_adoption_stats AS
SELECT
  c.id AS condominium_id,
  c.name AS condominium_name,
  COUNT(DISTINCT u.id) AS total_units,
  COUNT(DISTINCT r.id) AS total_residents,
  COUNT(DISTINCT CASE WHEN r.has_app_installed THEN r.id END) AS residents_with_app,
  COUNT(DISTINCT CASE WHEN r.has_app_installed THEN u.id END) AS units_with_app,
  ROUND(
    (COUNT(DISTINCT CASE WHEN r.has_app_installed THEN r.id END)::NUMERIC /
     NULLIF(COUNT(DISTINCT r.id), 0)::NUMERIC) * 100,
    1
  ) AS resident_adoption_percent,
  ROUND(
    (COUNT(DISTINCT CASE WHEN r.has_app_installed THEN u.id END)::NUMERIC /
     NULLIF(COUNT(DISTINCT u.id), 0)::NUMERIC) * 100,
    1
  ) AS unit_coverage_percent
FROM condominiums c
LEFT JOIN units u ON u.condominium_id = c.id
LEFT JOIN residents r ON r.unit_id = u.id
GROUP BY c.id, c.name
ORDER BY condominium_name;

COMMENT ON VIEW v_app_adoption_stats IS 'Statistics on resident app adoption per condominium';

-- ============================================================================
-- 6. Grant permissions (adjust as needed for your security model)
-- ============================================================================

-- Allow authenticated users to call the functions
-- GRANT EXECUTE ON FUNCTION register_resident_app_login TO authenticated;
-- GRANT EXECUTE ON FUNCTION update_resident_app_activity TO authenticated;
-- GRANT EXECUTE ON FUNCTION check_unit_has_app TO authenticated;

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

/*
-- To rollback this migration:

DROP VIEW IF EXISTS v_app_adoption_stats;
DROP FUNCTION IF EXISTS check_unit_has_app(INT4);
DROP FUNCTION IF EXISTS update_resident_app_activity(INT4);
DROP FUNCTION IF EXISTS register_resident_app_login(INT4, TEXT, TEXT);
DROP INDEX IF EXISTS idx_residents_has_app;

ALTER TABLE residents
DROP COLUMN IF EXISTS has_app_installed,
DROP COLUMN IF EXISTS device_token,
DROP COLUMN IF EXISTS app_first_login_at,
DROP COLUMN IF EXISTS app_last_seen_at;
*/
