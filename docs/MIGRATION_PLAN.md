# Migration Plan: Direct Database Access to RPC Functions

## Status: ✅ 99% Complete (March 2026)

All 68 direct `.from()` database calls in `Supabase.ts` have been migrated to `.rpc()`.

---

## ⚠️ Remaining: 1 Database `.from()` Call

| Line | Function | Table | Action Needed |
|------|----------|-------|---------------|
| 2515 | `adminGetDeviceRegistrationErrors()` | `device_registration_errors` | Create RPC `admin_get_device_registration_errors` |

**Solution**: Create a new RPC in Supabase:
```sql
CREATE OR REPLACE FUNCTION admin_get_device_registration_errors(
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_device_identifier text DEFAULT NULL,
  p_limit int4 DEFAULT 100,
  p_offset int4 DEFAULT 0
)
RETURNS TABLE(errors json, total bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- implementation
END;
$$;
```

---

## ✅ Intentional `.from()` Calls (Supabase Storage API)

These are **correct** — Supabase Storage SDK requires `.from(bucket)`:

| Lines | Bucket | Purpose |
|-------|--------|---------|
| 468, 477, 495 | `news` | News image upload/delete |
| 537 | `resident-photos` | Resident photo URL generation |
| 951, 971 | `visitor-photos` | Visitor photo upload/URL |
| 1013, 1023 | `(bucketName)` | Generic storage helper |
| 1075, 1095, 1125, 1146 | `staff-photos` | Staff photo upload/delete |

---

## Completed Migrations Summary

| Phase | Table | Migrations | Status |
|-------|-------|------------|--------|
| 1 | Condominiums | 7 | ✅ Done |
| 2 | Streets | 3 | ✅ Done |
| 3 | Staff | 4 | ✅ Done |
| 4 | Units | 4 | ✅ Done |
| 5 | Residents | 7 | ✅ Done |
| 6 | Visits | 6 | ✅ Done |
| 7 | Incidents | 8 | ✅ Done |
| 8 | Incident Lookups | 2 | ✅ Done |
| 9 | Devices | 10 | ✅ Done |
| 10 | Visit Types | 5 | ✅ Done |
| 11 | Service Types | 5 | ✅ Done |
| 12 | Restaurants | 5 | ✅ Done |
| 13 | Sports | 5 | ✅ Done |
| 14 | Audit Logs | 2 | ✅ Done |
| 15 | Notifications | 3 | ✅ Done |
| 16 | News | 9 | ✅ Done |
| **TOTAL** | | **85** | ✅ |
