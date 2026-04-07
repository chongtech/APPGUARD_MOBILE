# System Observability

This document describes how observability is implemented in EntryFlow. Use it as a reference to replicate the observability stack in other projects.

## Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Observability Stack                    │
├─────────────┬───────────────────────────────────────────┤
│ Error Track │ Sentry (errors, performance, replay)      │
│ Logging     │ Custom Logger → Sentry breadcrumbs        │
│ Health      │ Backend health score (0-3) + heartbeat    │
│ Audit       │ Offline-first audit log queue → Supabase  │
│ Sync        │ Custom events → SyncOverlay UI            │
│ Performance │ Vercel Speed Insights (Web Vitals)        │
│ PWA         │ Lifecycle tracking (install/uninstall)    │
│ Network     │ Online/offline detection + duration       │
│ UI Errors   │ React ErrorBoundary → Sentry              │
└─────────────┴───────────────────────────────────────────┘
```

---

## 1. Sentry Integration

**File**: `config/sentry.ts`
**Called from**: `index.tsx` (before React mounts)

### Setup

```typescript
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.DEV ? 'development' : 'production',
  release: `entryflow@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,
  sendDefaultPii: true,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
      maskAllInputs: true, // Masks PIN keypad inputs
    }),
  ],

  tracesSampleRate: 1.0,                // 100% of transactions
  tracePropagationTargets: ['localhost', /^https:\/\/.*\.supabase\.co/],
  replaysSessionSampleRate: 0.1,         // 10% session replay in production
  replaysOnErrorSampleRate: 1.0,         // 100% replay on error sessions
  autoSessionTracking: true,
  attachStacktrace: true,
});
```

### PII Scrubbing

The `beforeSend` hook removes sensitive keys from events and breadcrumbs before they leave the browser:

```typescript
beforeSend(event) {
  const scrubKeys = ['pin', 'pin_hash', 'password', 'token', 'device_token'];

  if (event.extra) {
    for (const key of scrubKeys) delete event.extra[key];
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(crumb => {
      if (crumb.data) {
        for (const key of scrubKeys) delete crumb.data[key];
      }
      return crumb;
    });
  }
  return event;
}
```

### Network Status Tracking

Tracks offline/online transitions and measures offline duration:

```typescript
function setupNetworkTracking() {
  let offlineStartTime: number | null = null;

  window.addEventListener('offline', () => {
    offlineStartTime = Date.now();
    Sentry.setTag('network_status', 'offline');
  });

  window.addEventListener('online', () => {
    if (offlineStartTime) {
      const offlineDuration = Date.now() - offlineStartTime;
      Sentry.setMeasurement('offline_duration_ms', offlineDuration, 'millisecond');
      offlineStartTime = null;
    }
    Sentry.setTag('network_status', 'online');
  });
}
```

### Service Worker Error Tracking

Captures Service Worker errors and tags them as PWA category:

```typescript
function setupServiceWorkerTracking() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('error', (event) => {
      Sentry.captureException((event as ErrorEvent).error, {
        tags: { error_category: 'pwa' },
      });
    });
  }
}
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_SENTRY_DSN` | Sentry data source name (ingest endpoint) |
| `VITE_APP_VERSION` | Release version for tracking (e.g. `1.0.0`) |
| `VITE_SENTRY_ORG` | Sentry organization slug |
| `VITE_SENTRY_PROJECT` | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | Auth token for CLI/CI integrations |

---

## 2. Custom Logger Service

**File**: `services/logger.ts`
**Pattern**: Singleton exported as `logger`

The logger provides categorized logging with automatic Sentry breadcrumb creation. In development, it outputs to the console; in production, it only creates Sentry breadcrumbs.

### Error Categories

```typescript
enum ErrorCategory {
  AUTH    = 'auth',
  SYNC    = 'sync',
  DEVICE  = 'device',
  NETWORK = 'network',
  CAMERA  = 'camera',
  STORAGE = 'storage',
  PWA     = 'pwa',
  ADMIN   = 'admin',
}
```

### Context Management

```typescript
interface LogContext {
  service?: string;        // Service name (e.g., 'DataService')
  operation?: string;      // Current operation
  userId?: number;         // Staff member ID
  condominiumId?: number;  // Associated condominium
  deviceId?: string;       // Device identifier
  [key: string]: unknown;  // Custom fields
}

// Sets context and propagates to Sentry tags
logger.setContext({ service: 'DataService', userId: 42 });

// Clears context and removes Sentry user
logger.clearContext();
```

### Log Levels

| Method | Dev Console | Sentry Breadcrumb Level |
|--------|-------------|------------------------|
| `logger.debug(msg, data?)` | `console.log` | `debug` |
| `logger.info(msg, data?)` | `console.log` | `info` |
| `logger.warn(msg, data?)` | `console.warn` | `warning` |
| `logger.error(msg, err?, category?, data?)` | `console.error` | Captures exception with scope |

Console output format: `[ServiceName] message`

### Error Capture

Errors are captured with isolated Sentry scope, category tag, and additional context:

```typescript
logger.error('Failed to sync visits', error, ErrorCategory.SYNC, { visitCount: 5 });
// Creates Sentry exception with:
//   - scope.context: { service, operation, ...data }
//   - scope.tag: error_category = 'sync'
//   - extra: { message, ...data }
```

### Specialized Tracking Methods

```typescript
// Sync progress — creates breadcrumb + sets measurements
logger.trackSync('visits', 'progress', { total: 10, synced: 5 });
// Sentry measurements: sync_total_items=10, sync_completed_items=5

// Offline operations — captures message on failure
logger.trackOfflineOperation('createVisit', 'queued', { visitId: 123 });
logger.trackOfflineOperation('createVisit', 'failed', { error: '...' });
// On 'failed': also calls Sentry.captureMessage()

// User actions — breadcrumb trail
logger.trackAction('login_attempt', { staffId: 42 });

// Backend health — tag + measurement
logger.trackHealthScore(3);
// Sets tag: backend_health=3, measurement: backend_health_score=3
```

---

## 3. React Error Boundary

**File**: `components/ErrorBoundary.tsx`
**Wraps**: Root app component

Catches unhandled React rendering errors and reports them to Sentry:

```typescript
componentDidCatch(error: Error, errorInfo: ErrorInfo) {
  Sentry.withScope(scope => {
    scope.setExtra('componentStack', errorInfo.componentStack);
    scope.setTag('error_category', 'react');
    Sentry.captureException(error);
  });
}
```

**Fallback UI**: Displays error message in Portuguese with a "Tentar Novamente" (Try Again) button that resets the error state. Supports custom fallback via `fallback` prop.

---

## 4. Backend Health Monitoring

**File**: `services/dataService.ts`

### Health Score System

```
Score 3: Healthy — backend responsive
Score 1-2: Degraded — recent failures
Score 0: Offline/unreachable
```

```typescript
private backendHealthScore: number = 3;

private get isBackendHealthy(): boolean {
  return this.isOnline && this.backendHealthScore > 0;
}
```

### Startup Connectivity Verification

Runs on `DataService` construction, before any data operations:

```typescript
private async verifyConnectivity(): Promise<void> {
  if (!navigator.onLine) {
    this.isOnline = false;
    this.backendHealthScore = 0;
    return;
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 3000); // 3s timeout

  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'HEAD',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    signal: controller.signal,
  });

  // 200, 401, 404 all count as "reachable"
  if (response.ok || response.status === 401 || response.status === 404) {
    this.backendHealthScore = 3;
  }
}
```

### Periodic Health Check (60s interval)

```typescript
private startHealthCheck() {
  setInterval(async () => {
    if (this.isOnline) {
      const wasUnhealthy = this.backendHealthScore === 0;

      // Ping backend via RPC call
      const success = await SupabaseService.getServiceTypes()
        .then(res => res.length > 0).catch(() => false);

      if (success) {
        this.backendHealthScore = 3;

        // Auto-recovery: sync pending items when backend returns
        if (wasUnhealthy) {
          void this.flushPendingAuditLogs();
          this.syncPendingItems();
        }
      } else {
        this.backendHealthScore = Math.max(0, this.backendHealthScore - 1);
      }
    }
  }, 60000);
}
```

### Score Update Triggers

| Event | Effect |
|-------|--------|
| Browser `online` event | Score reset to 3, flush audit logs |
| Browser `offline` event | Score set to 0 |
| Failed RPC call (any operation) | `backendHealthScore--` |
| Health check success | Score reset to 3 |
| Health check failure | `Math.max(0, score - 1)` |

---

## 5. Device Heartbeat

**File**: `services/dataService.ts`
**Interval**: Every 5 minutes

```typescript
private startHeartbeat() {
  setInterval(async () => {
    if (this.isBackendHealthy && this.currentCondoId) {
      const deviceId = getDeviceIdentifier();
      await SupabaseService.updateDeviceHeartbeat(deviceId);
    }
  }, 300000);
}
```

Updates `device.last_seen_at` in the backend. The admin UI (`pages/admin/AdminDevices.tsx`) displays health badges based on a **7-minute threshold**:
- **Green**: last seen < 7 minutes ago
- **Red/Gray**: last seen > 7 minutes ago (device potentially offline)

---

## 6. Audit Logging

**Files**: `services/dataService.ts` (queue) + `services/Supabase.ts` (backend call)

### Offline-First Queue Pattern

```
Component → DataService.logAudit(entry)
                ↓
        isBackendHealthy?
       /                \
     YES                 NO
      ↓                   ↓
  SupabaseService     enqueueAuditLog()
  .logAudit()         → IndexedDB (settings table)
  (fire-and-forget)       ↓
                     flushPendingAuditLogs()
                     (on recovery/reconnect)
```

### Entry Structure

```typescript
await api.logAudit({
  condominium_id: number,     // Auto-filled from context if omitted
  actor_id: number,           // Auto-filled from stored user if omitted
  action: 'LOGIN',            // Action name
  target_table: 'staff',      // Target entity table
  target_id: 123,             // Target entity ID (optional)
  details: { ... },           // Additional JSON data (optional)
});
```

### Queue Implementation

```typescript
// Queue to IndexedDB when offline
private async enqueueAuditLog(entry: any): Promise<void> {
  const pending = await this.getPendingAuditLogs();
  pending.push(entry);
  await this.setPendingAuditLogs(pending);
}

// Flush queue when backend recovers
private async flushPendingAuditLogs(): Promise<void> {
  if (!this.isBackendHealthy) return;
  const pending = await this.getPendingAuditLogs();
  if (pending.length === 0) return;
  pending.forEach(entry => SupabaseService.logAudit(entry));
  await this.setPendingAuditLogs([]);
}
```

### Backend Call (Fire-and-Forget)

```typescript
// services/Supabase.ts
async logAudit(entry: any) {
  supabase
    .rpc('create_audit_log', { p_data: entry })
    .then(({ error }) => {
      if (error) logger.error('Audit Log Error', error, ErrorCategory.NETWORK);
    });
}
```

### Flush Triggers

- App startup (after connectivity verification)
- Browser `online` event
- Health check recovery (score transitions from 0 to 3)

### Tracked Actions

Visits, incidents, admin CRUD (condominiums, devices, staff, units, residents, restaurants, sports, visit types, service types), login/logout, CSV/PDF exports, device registration.

---

## 7. Sync Event Tracking

**File**: `services/dataService.ts`

### Event Types

```typescript
type SyncEventType = 'sync:start' | 'sync:progress' | 'sync:complete' | 'sync:error';

interface SyncEventDetail {
  total?: number;    // Total items to sync
  synced?: number;   // Items synced so far
  message?: string;  // Status message
  error?: string;    // Error message on failure
}
```

### Emission Pattern

```typescript
private emitSyncEvent(type: SyncEventType, detail: SyncEventDetail = {}) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

// Usage within syncPendingItems():
this.emitSyncEvent('sync:start', { total: 10, message: 'A sincronizar 10 items...' });
this.emitSyncEvent('sync:progress', { synced: 3, total: 10, message: 'Visita sincronizada (3/10)' });
this.emitSyncEvent('sync:complete', { synced: 10, total: 10, message: '10 items sincronizados' });
this.emitSyncEvent('sync:error', { error: 'Erro ao sincronizar visita: timeout' });
```

### UI Integration

`App.tsx` listens to these events and renders a `<SyncOverlay>` component:

```typescript
window.addEventListener('sync:start', handleSyncStart);
window.addEventListener('sync:progress', handleSyncProgress);
window.addEventListener('sync:complete', handleSyncComplete);
window.addEventListener('sync:error', handleSyncError);
```

The overlay shows a progress bar with synced/total counts and auto-hides after 1.5s (success) or 3s (error).

---

## 8. Performance Monitoring

### Vercel Speed Insights

**File**: `App.tsx`
**Package**: `@vercel/speed-insights/react`

```typescript
import { SpeedInsights } from '@vercel/speed-insights/react';

// In root component JSX:
<SpeedInsights />
```

Automatically tracks Core Web Vitals (LCP, FID, CLS) and sends metrics to the Vercel dashboard. No configuration required beyond the import.

### Sentry Performance

- **Trace sample rate**: 100% (`tracesSampleRate: 1.0`)
- **Propagation targets**: `localhost` and `*.supabase.co`
- **Custom measurements**: `offline_duration_ms`, `backend_health_score`, `sync_total_items`, `sync_completed_items`

---

## 9. PWA Lifecycle Tracking

**File**: `services/pwaLifecycleService.ts`
**Initialized in**: `App.tsx` via `pwaLifecycleService.init()`

### Installation Detection

```typescript
detectInstallation():
- window.matchMedia('(display-mode: standalone)').matches
- (window.navigator as any).standalone === true  // iOS
```

### Tracked State (localStorage)

| Key | Value | Purpose |
|-----|-------|---------|
| `pwa_installed` | `'true'` / null | Installation flag |
| `pwa_install_date` | ISO timestamp | When installed |
| `pwa_launch_count` | Integer | Total launches |
| `pwa_last_launch` | ISO timestamp | Last launch time |
| `pwa_last_active` | ISO timestamp | Updated on visibility change |
| `pwa_potential_uninstall` | ISO timestamp | Uninstall detection marker |
| `pwa_decommissioned` | `'true'` / null | Decommission flag |

### Monitored Events

- `appinstalled` — user installs PWA
- `display-mode` media query change — enter/exit standalone
- `visibilitychange` — app visibility, updates `last_active`
- Service Worker unregistration check (every 60s)

### Uninstall Detection & Decommission

Heuristic-based detection using:
1. Service Worker unregistration polling
2. App inactivity > 30 days + potential uninstall flag
3. Display mode exit from standalone

On decommission: calls `SupabaseService.decommissionDevice(deviceId)` and clears local data.

---

## 10. Network & Connectivity Detection

**File**: `services/dataService.ts`

### Multi-Layer Detection

```
Layer 1: navigator.onLine (browser API)
Layer 2: window 'online'/'offline' events
Layer 3: Backend ping (HEAD request with 3s timeout)
Layer 4: Health check RPC call every 60s
```

### UI Integration

Layout components poll `api.checkOnline()` every 2 seconds and display a Wifi/WifiOff icon with a colored status badge. Network state changes trigger immediate visual feedback.

---

## 11. Persistent Storage

**File**: `services/dataService.ts`

Requests persistent storage on startup to prevent browser auto-deletion of IndexedDB on kiosk tablets:

```typescript
const granted = await navigator.storage.persist();
```

Logs storage quota usage (used MB / quota MB / percentage) for monitoring disk space.

---

## Summary: Replication Checklist

To replicate this observability stack in another project:

1. **Install packages**: `@sentry/react`, `@vercel/speed-insights`
2. **Create `config/sentry.ts`**: Copy `initSentry()` with PII scrubbing, network tracking, SW error tracking
3. **Create `services/logger.ts`**: Singleton logger with `ErrorCategory` enum, context management, Sentry breadcrumbs
4. **Create `components/ErrorBoundary.tsx`**: React error boundary with `Sentry.captureException`
5. **Add health score to data service**: `backendHealthScore` (0-3), 60s health check, gradual degradation
6. **Add heartbeat to data service**: 5-minute interval updating `last_seen_at` in backend
7. **Add audit log queue**: `enqueueAuditLog()` → IndexedDB, `flushPendingAuditLogs()` on recovery
8. **Add sync events**: `CustomEvent` dispatch for `sync:start/progress/complete/error`
9. **Add `<SpeedInsights />`** in root component
10. **Add PWA lifecycle service** if building a PWA
11. **Set environment variables**: `VITE_SENTRY_DSN`, `VITE_APP_VERSION`, `VITE_SENTRY_ORG`, `VITE_SENTRY_PROJECT`

---

## React Native Adaptation (APPGUARD_MOBILE)

This document was originally written for the PWA (APPGUARD). Below describes what was adapted, replaced, or skipped for the React Native migration.

### What was adapted

| PWA | React Native | File |
|---|---|---|
| `@sentry/react` | `@sentry/react-native` | `config/sentry.ts` |
| `navigator.onLine` + `window.online/offline` | `NetInfo.addEventListener` + `NetInfo.fetch()` | `services/dataService.ts` |
| `window.dispatchEvent(CustomEvent)` | Callback registration pattern | `services/dataService.ts` |
| `navigator.storage.persist()` | Not needed — SQLite is natively persistent | — |
| `localStorage` | `AsyncStorage` | `services/dataService.ts` |
| `Dexie` (IndexedDB) | `expo-sqlite` adapter | `database/adapter.ts` |
| `Sentry.browserTracingIntegration()` | `Sentry.reactNavigationIntegration()` | `config/sentry.ts` |
| `Sentry.replayIntegration()` | Not available in React Native | — |

### What was NOT implemented (PWA-only, not applicable)

- **Vercel Speed Insights** — no React Native equivalent
- **PWA lifecycle tracking** — no service worker, no `display-mode` media query
- **Service Worker error tracking** — does not exist in React Native
- **`navigator.storage.persist()`** — SQLite handles persistence natively
- **`window.CustomEvent` sync events** — replaced by callback pattern already in place

### What was implemented in React Native

**`services/logger.ts`**
- `logger.setUser({ id, name, role, condominiumId })` → `Sentry.setUser()` — called on login and session restore
- `logger.clearUser()` → `Sentry.setUser(null)` — called on logout
- `logger.trackHealthScore(score)` → `Sentry.setTag('backend_health', score)`
- `logger.setNetworkStatus(isOnline)` → `Sentry.setTag('network_status', 'online'|'offline')`

**`services/dataService.ts`**
- NetInfo listener calls `logger.setNetworkStatus()` on every connectivity change
- `verifyConnectivity()` calls `logger.setNetworkStatus()` + `logger.trackHealthScore()` after each health check

**`contexts/AuthContext.tsx`**
- `login()` calls `logger.setUser()` on success
- `logout()` calls `logger.clearUser()`
- `refreshSession()` calls `logger.setUser()` when session is restored from AsyncStorage

**All screens and components**
- Every `catch` block now calls `logger.error()` or `logger.warn()` before any Alert or fallback
- `load()` failures → `logger.warn()` (non-critical, data may be stale)
- `save()` / action failures → `logger.error()` (user action failed, needs investigation)
- `CameraCapture.tsx` → `logger.warn(LogCategory.MEDIA, ...)` on photo capture failure

### Environment variables (React Native)

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry ingest endpoint |
| `EXPO_PUBLIC_SENTRY_ENABLE_DEV` | Set `true` to send events in development mode |
| `SENTRY_AUTH_TOKEN` | For EAS build source map upload |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project slug |
