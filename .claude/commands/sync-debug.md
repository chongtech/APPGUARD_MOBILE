---
user-invocable: false
description: Debug offline sync issues in EntryFlow — checks health score, pending items, device heartbeat, and Supabase RPC failures. Triggered automatically when user reports sync or offline problems.
---

# Sync Issue Debugger

Use this when the user reports: visits not syncing, stuck in PENDING_SYNC, offline mode not working, or data not appearing in Supabase.

## Diagnostic Steps

### 1. Gather Console Logs
Ask the user to open DevTools console and filter by `[DataService]`. Look for:
- `backendHealthScore` value (0 = unhealthy, 3 = healthy)
- Failed RPC calls (network errors, 401s, 500s)
- `[PWA Update]` logs that might indicate a stale Service Worker

### 2. Check Pending Items
Use Supabase MCP to query for unsynced data:
```sql
-- Check visits stuck in PENDING_SYNC
SELECT id, visitor_name, check_in_at, sync_status, device_id
FROM visits
WHERE sync_status = 'PENDING_SYNC'
ORDER BY check_in_at DESC
LIMIT 20;
```

### 3. Verify Device Heartbeat
```sql
-- Check if device is sending heartbeats
SELECT device_identifier, device_name, condominium_id, last_seen_at, status
FROM devices
WHERE last_seen_at < NOW() - INTERVAL '10 minutes'
ORDER BY last_seen_at DESC;
```

### 4. Check RPC Health
Test key RPCs directly via Supabase MCP:
- `update_device_heartbeat` — if this fails, health score drops
- `create_visit` — if this fails, visits queue up locally

### 5. Common Root Causes & Fixes

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Health score = 0 | Supabase RLS blocking RPC | Check RLS policies on `visits` table |
| Heartbeat failing | Device identifier mismatch | Re-configure device at `/setup` |
| All RPCs failing | Anon key expired or wrong | Check `VITE_SUPABASE_ANON_KEY` in Vercel env vars |
| Old Service Worker | SW not updated | DevTools → Application → Service Workers → Update |
| IndexedDB cleared | Browser cleared site data | Device will need re-configuration |

### 6. Force Resync
If data is stuck, instruct user to:
1. Open Settings page → tap "Forçar Sincronização"
2. Or: Dashboard → sync button
3. Check console for `sync:start`, `sync:progress`, `sync:complete` events
