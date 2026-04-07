# Clickstream v3 — Entry Registration Flow (Kafka via HTTP)

**Project**: EntryFlow
**Date**: 2026-03-24
**Author**: Claude Code (Chong Technologies)
**Supersedes**: clickstream1.md, clickstream2.md, clickstream3.md
**Status**: Final design — ready for implementation

---

## 1. Overview

The entry registration flow (`NewEntry.tsx`) has **16 distinct event types** across 3 wizard steps. This document defines the final clickstream design: the schema, the service architecture, the Kafka provider abstraction, and every tracking call to instrument in the UI.

Events are **analytics-only** — fire-and-forget, never block the UI. Offline events persist in localStorage and flush on reconnect.

### Design Philosophy

This version is a **hybrid of all three previous designs**, taking the best ideas from each:

| Aspect | Source | Decision |
|--------|--------|----------|
| Schema | v1 | Simple flat fields + `properties` map (flexible, low maintenance) |
| Event naming | v1 | Descriptive names (`visit_type_selected`) — self-documenting, easy to query |
| Architecture | v1 + existing codebase | Singleton service (matches `audioService.ts` pattern) — NOT a React hook |
| Offline persistence | v3 | localStorage buffer (max 200 events, ~60KB) |
| NoOp when disabled | v3 | When `VITE_KAFKA_REST_URL` absent, all calls are no-ops |
| Env var config | v2/v3 | No hardcoded credentials |
| Retry strategy | v3 | 2 retries with exponential backoff (1s, 2s) |
| PII protection | v2/v3 | Explicit blocklist sanitization layer |
| Component changes | None | Wrap existing handlers in NewEntry.tsx — no prop changes to CameraCapture or ApprovalModeSelector |

### What was rejected from previous designs

| Rejected | From | Why |
|----------|------|-----|
| `useClickstream` React hook | v3 | Over-engineered; singleton is simpler and consistent with existing patterns |
| 22 explicit schema fields | v2 | Analytics-query concerns belong in `properties` map, not fixed schema |
| Generic event names (`modal_item_select`) | v2 | Requires parsing properties to understand what happened; descriptive names are clearer |
| `form_field_focus` / `form_field_blur` | v2 | Too noisy; `input_started` (once per field) gives 80% of the insight |
| Avro schema file (`.avsc`) | v1/v2/v3 | Start with JSON; add Avro later if schema registry is adopted |
| IndexedDB for events | — | localStorage is sufficient for fire-and-forget analytics |
| Changes to CameraCapture.tsx props | v2 | Wrap `handlePhotoCapture` in NewEntry instead — zero blast radius |
| Changes to ApprovalModeSelector.tsx props | v2 | Wrap `onModeSelect` callback in NewEntry instead |
| 25-28 event types | v1/v2/v3 | 16 events cover the essential funnel analytics without noise |

---

## 2. Kafka Providers

### 2.1 Aiven (Active)

| Property | Value |
|----------|-------|
| Endpoint | `${VITE_KAFKA_REST_URL}/topics/${VITE_KAFKA_TOPIC}` |
| Method | POST |
| Content-Type | `application/vnd.kafka.json.v2+json` |
| Auth | Basic Auth — `${VITE_KAFKA_USER}:${VITE_KAFKA_PASSWORD}` |
| Payload | `{ "records": [{ "value": <ClickstreamEvent> }] }` |

Example curl:
```bash
curl -X POST \
  -H "Content-Type: application/vnd.kafka.json.v2+json" \
  -H "Authorization: Basic <BASE64_AUTH>" \
  -d '{"records": [{"value": {"event_id": "uuid", "event_name": "entry_started", "session_id": "uuid"}}]}' \
  'https://kafka-elite-access-control-elite-access-control.b.aivencloud.com:23834/topics/tp_clickstream_visits'
```

### 2.2 NoOp (Default when not configured)

When `VITE_KAFKA_REST_URL` is absent or empty, the service operates as a complete no-op. Zero network calls, zero overhead, zero console errors. This is the default in development.

### 2.3 Confluent Cloud (Future — stub only)

Prepared for future integration. Not implemented.

---

## 3. Event Schema

### 3.1 TypeScript Interface

```typescript
export interface ClickstreamEvent {
  event_id: string;           // UUID v4, unique per event
  event_name: string;         // Descriptive name (see catalogue)
  event_at: string;           // ISO 8601 UTC timestamp
  session_id: string;         // UUID per browser session (survives page navigations)
  device_id: string;          // From getDeviceIdentifier() in deviceUtils.ts
  condominium_id: number | null;
  guard_id: number | null;
  page: string;               // Always 'new_entry' for this flow
  step: number | null;        // Current wizard step: 1, 2, 3, or null
  flow_id: string | null;     // UUID per /new-entry visit (new each mount)
  duration_ms: number | null; // Milliseconds since flow started
  is_online: boolean;         // navigator.onLine at time of event
  app_version: string;        // From VITE_APP_VERSION
  properties: Record<string, string | number | boolean | null>;  // Event-specific data
}
```

### 3.2 Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `event_id` | string | UUID v4 — unique per event |
| `event_name` | string | Descriptive event identifier (see catalogue) |
| `event_at` | string | ISO 8601 UTC at time of interaction |
| `session_id` | string | UUID per browser session — persists across page navigations |
| `device_id` | string | Tablet device UUID from `getDeviceIdentifier()` |
| `condominium_id` | int? | Condominium the device belongs to |
| `guard_id` | int? | Staff ID of the logged-in guard |
| `page` | string | Page identifier (`new_entry` for this flow) |
| `step` | int? | Current wizard step: 1, 2, 3, or null |
| `flow_id` | string? | UUID generated per NewEntry mount — groups all events in one entry flow |
| `duration_ms` | int? | Time elapsed since `flow.start` — enables time-per-step analytics |
| `is_online` | boolean | Network status at time of event |
| `app_version` | string | App version for forward compatibility |
| `properties` | map | Flexible key-value map for event-specific data (never PII) |

### 3.3 Why `properties` map instead of explicit fields

The v2 design had 22 explicit fields (`component`, `action`, `element_id`, `value_selected`, `value_label`, `qr_result_valid`, `error_message`). These are analytics-query concerns that change over time. Using a generic `properties` map means:

- **No schema migrations** when adding new event-specific data
- **Smaller payload** — only populated fields are sent
- **Simpler TypeScript** — one interface covers all events
- **Query flexibility** — data warehouse can parse JSON properties as needed

---

## 4. Service Architecture

**File**: `src/services/clickstreamService.ts`

### 4.1 Constants

```typescript
const STORAGE_KEY = 'clickstream_buffer';
const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 5_000;
const MAX_BUFFER_SIZE = 200;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1_000;
```

### 4.2 Singleton Class

```typescript
class ClickstreamService {
  private buffer: ClickstreamEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private enabled: boolean;

  // Session state (persists across page navigations)
  private sessionId: string;

  // Flow state (resets per /new-entry mount)
  private flowId: string | null = null;
  private flowStartTime: number | null = null;
  private inputsTracked: Set<string> = new Set();

  // Kafka config
  private endpoint: string;
  private authHeader: string;

  constructor() {
    this.sessionId = generateUUID();
    this.enabled = !!import.meta.env.VITE_KAFKA_REST_URL;

    if (!this.enabled) return; // Full no-op

    const baseUrl = import.meta.env.VITE_KAFKA_REST_URL;
    const topic = import.meta.env.VITE_KAFKA_TOPIC || 'tp_clickstream_visits';
    const user = import.meta.env.VITE_KAFKA_USER || 'avnadmin';
    const pass = import.meta.env.VITE_KAFKA_PASSWORD || '';
    this.endpoint = `${baseUrl}/topics/${topic}`;
    this.authHeader = 'Basic ' + btoa(`${user}:${pass}`);

    this.restoreBuffer();
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    window.addEventListener('beforeunload', () => this.persistBuffer());
    window.addEventListener('online', () => this.flush());
  }

  // ── Public API ──

  startFlow(): string              // Generate flow UUID, reset timer + input tracker
  track(eventName, options): void  // Build event, push to buffer, auto-flush at BATCH_SIZE
  trackInputStart(field, options): void  // Fire only once per field per flow
  endFlow(outcome, options): void  // Track flow_submitted/flow_abandoned, force flush
  destroy(): void                  // Clear timer, persist buffer
}

export const clickstream = new ClickstreamService();
```

### 4.3 `track()` Method

The single entry point. Auto-fills metadata; callers provide only event-specific fields:

```typescript
track(
  eventName: string,
  options: {
    step?: number | null;
    page?: string;
    guardId?: number | null;
    condominiumId?: number | null;
    properties?: Record<string, any>;
  } = {}
): void {
  if (!this.enabled) return;

  const event: ClickstreamEvent = {
    event_id: generateUUID(),
    event_name: eventName,
    event_at: new Date().toISOString(),
    session_id: this.sessionId,
    device_id: getDeviceIdentifier(),
    condominium_id: options.condominiumId ?? null,
    guard_id: options.guardId ?? null,
    page: options.page || 'new_entry',
    step: options.step ?? null,
    flow_id: this.flowId,
    duration_ms: this.flowStartTime ? Date.now() - this.flowStartTime : null,
    is_online: navigator.onLine,
    app_version: import.meta.env.VITE_APP_VERSION || '0.0.0',
    properties: sanitizeProperties(options.properties || {}),
  };

  this.buffer.push(event);

  // Overflow protection: drop oldest
  if (this.buffer.length > MAX_BUFFER_SIZE) {
    this.buffer = this.buffer.slice(-MAX_BUFFER_SIZE);
  }

  // Auto-flush at batch size
  if (this.buffer.length >= BATCH_SIZE) {
    this.flush();
  }
}
```

### 4.4 `trackInputStart()` — Once-per-field tracking

Prevents firing events on every keystroke. Only the first focus per field per flow fires:

```typescript
trackInputStart(fieldName: string, options = {}): void {
  if (this.inputsTracked.has(fieldName)) return;
  this.inputsTracked.add(fieldName);
  this.track('input_started', { ...options, properties: { field: fieldName } });
}
```

### 4.5 PII Sanitization

Defense-in-depth: even if a developer accidentally passes PII, it gets stripped:

```typescript
const PII_BLOCKLIST = new Set([
  'visitor_name', 'visitor_doc', 'visitor_phone', 'vehicle_plate',
  'visitorName', 'visitorDoc', 'visitorPhone', 'vehiclePlate',
  'phone', 'name', 'document', 'plate', 'pin', 'password',
]);

function sanitizeProperties(props: Record<string, any>): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(props)) {
    if (PII_BLOCKLIST.has(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      result[key] = value;
    } else {
      result[key] = String(value); // Coerce objects to string safely
    }
  }
  return result;
}
```

### 4.6 Flush Logic

```typescript
private async flush(): Promise<void> {
  if (this.isFlushing || this.buffer.length === 0 || !this.enabled) return;
  this.isFlushing = true;

  const batch = this.buffer.splice(0, BATCH_SIZE);

  try {
    const success = await this.sendWithRetry(batch);
    if (!success) {
      // Re-queue failed batch at front
      this.buffer.unshift(...batch);
      this.persistBuffer();
    }
  } catch {
    this.buffer.unshift(...batch);
    this.persistBuffer();
  } finally {
    this.isFlushing = false;
  }
}

private async sendWithRetry(events: ClickstreamEvent[]): Promise<boolean> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.kafka.json.v2+json',
          'Authorization': this.authHeader,
        },
        body: JSON.stringify({ records: events.map(e => ({ value: e })) }),
      });

      if (response.ok) return true;
      if (response.status >= 400 && response.status < 500) return false; // Client error, don't retry
    } catch { /* network error, retry */ }

    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * (attempt + 1)));
    }
  }
  return false;
}
```

### 4.7 localStorage Persistence

```typescript
private persistBuffer(): void {
  if (this.buffer.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.buffer.slice(0, MAX_BUFFER_SIZE)));
  } catch { /* localStorage full — silently drop */ }
}

private restoreBuffer(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      this.buffer = JSON.parse(stored);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* corrupt data — ignore */ }
}
```

### 4.8 Batching & Flushing Rules

| Trigger | Action |
|---------|--------|
| Buffer reaches 10 events | Immediate flush |
| Every 5 seconds (timer) | Flush if buffer non-empty |
| `endFlow()` called | Force flush |
| `destroy()` called | Persist to localStorage |
| `beforeunload` event | Persist to localStorage |
| `online` event | Flush persisted buffer |
| Network error | Retry 2x (1s, 2s backoff), then re-queue + persist |
| Buffer overflow (200) | Drop oldest events |

---

## 5. Event Catalogue (16 events)

### Step 1 — Visit Type Selection

| Event | Trigger | Properties |
|-------|---------|------------|
| `entry_started` | Component mounts | — |
| `visit_type_selected` | `handleTypeSelect()` | `{ visit_type_id, visit_type_name }` |
| `qr_question_answered` | `handleQrQuestionResponse()` | `{ has_qr: true/false }` |

### Step 2 — Visitor Details

| Event | Trigger | Properties |
|-------|---------|------------|
| `step_changed` | `setStep(2)` | `{ from_step: 1, to_step: 2 }` |
| `modal_opened` | Modal open click | `{ modal: 'unit'/'service'/'restaurant'/'sport' }` |
| `unit_selected` | Unit modal item click | `{ unit_id }` |
| `service_type_selected` | Service modal item click | `{ service_type_id }` |
| `restaurant_selected` | Restaurant modal item click | `{ restaurant_id }` |
| `sport_selected` | Sport modal item click | `{ sport_id }` |
| `input_started` | First focus on text field | `{ field: 'visitor_name'/'visitor_doc'/etc. }` |

### Step 3 — Photo & Approval

| Event | Trigger | Properties |
|-------|---------|------------|
| `step_changed` | `setStep(3)` | `{ from_step: 2, to_step: 3 }` |
| `photo_captured` | `handlePhotoCapture()` | — |
| `qr_scan_started` | `handlePerformScan()` | — |
| `qr_scanned` | `handleQrScanned()` | `{ qr_valid: true/false }` |
| `approval_mode_selected` | `onModeSelect` wrapper | `{ mode: 'APP'/'PHONE'/etc. }` |

### Flow Lifecycle (automatic)

| Event | Trigger | Properties |
|-------|---------|------------|
| `flow_submitted` | `handleSubmit()` via `endFlow('submitted')` | `{ visit_type_id, has_photo, approval_mode, has_unit, has_restaurant, has_sport }` |
| `flow_abandoned` | Unmount without submit via `endFlow('abandoned')` | `{ last_step }` |

**Total: 16 event types**

---

## 6. PII Protection Rules

| Data | Tracked? | How |
|------|----------|-----|
| Visitor name | **NO** | Blocklisted in `sanitizeProperties()` |
| Visitor document | **NO** | Blocklisted |
| Visitor phone | **NO** | Blocklisted |
| Vehicle plate | **NO** | Blocklisted |
| Photo data | **NO** | Never passed to track() |
| QR code content | **NO** | Only `qr_valid` boolean tracked |
| PIN codes | **NO** | Blocklisted |
| Guard ID | YES | Internal system identifier |
| Device ID | YES | Device identifier, not personal |
| Condominium ID | YES | Organizational unit |
| Visit type ID/name | YES | Category of visit |
| Unit ID | YES | Destination unit (no resident info) |
| Approval mode | YES | Process selection |

---

## 7. Integration in `NewEntry.tsx`

### 7.1 Import & Setup

```typescript
import { clickstream } from '@/services/clickstreamService';

// Inside component:
const submittedRef = useRef(false);
```

### 7.2 Flow Lifecycle (useEffect)

```typescript
useEffect(() => {
  clickstream.startFlow();
  clickstream.track('entry_started', {
    step: 1,
    guardId: user?.id,
    condominiumId: user?.condominium_id,
  });

  return () => {
    if (!submittedRef.current) {
      clickstream.endFlow('abandoned', {
        step,
        guardId: user?.id,
        condominiumId: user?.condominium_id,
        properties: { last_step: step },
      });
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

### 7.3 Visit Type Selection (~L131)

```typescript
function handleTypeSelect(typeConfig: VisitTypeConfig) {
  clickstream.track('visit_type_selected', {
    step: 1,
    guardId: user?.id,
    condominiumId: user?.condominium_id,
    properties: { visit_type_id: typeConfig.id, visit_type_name: typeConfig.name },
  });
  // ... existing logic unchanged
}
```

### 7.4 QR Question Response (~L150)

```typescript
function handleQrQuestionResponse(hasQr: boolean) {
  clickstream.track('qr_question_answered', {
    step: 1,
    guardId: user?.id,
    condominiumId: user?.condominium_id,
    properties: { has_qr: hasQr },
  });
  // ... existing logic unchanged
}
```

### 7.5 Step Changes

```typescript
// When advancing to step 2 (inside "Seguinte" button handler):
clickstream.track('step_changed', {
  step: 2,
  guardId: user?.id,
  condominiumId: user?.condominium_id,
  properties: { from_step: 1, to_step: 2 },
});
setStep(2);

// Same pattern for step 2→3 and back buttons
```

### 7.6 Modal Tracking (Step 2)

```typescript
// Open modal — add alongside existing setState(true):
onClick={() => {
  clickstream.track('modal_opened', {
    step: 2,
    guardId: user?.id,
    condominiumId: user?.condominium_id,
    properties: { modal: 'unit' },
  });
  setShowUnitModal(true);
}}

// Select item — add alongside existing setState + close:
onClick={() => {
  clickstream.track('unit_selected', {
    step: 2,
    guardId: user?.id,
    condominiumId: user?.condominium_id,
    properties: { unit_id: u.id },
  });
  setUnitId(String(u.id));
  setShowUnitModal(false);
}}
```

Same pattern for `service_type_selected`, `restaurant_selected`, `sport_selected`.

### 7.7 Input Focus Tracking (Step 2)

```typescript
// Add onFocus to each text input:
<input
  // ... existing props
  onFocus={() => clickstream.trackInputStart('visitor_name', {
    step: 2,
    guardId: user?.id,
    condominiumId: user?.condominium_id,
  })}
/>
```

Apply to: `visitor_name`, `visitor_doc`, `visitor_phone`, `vehicle_plate`, `reason` (5 fields).

### 7.8 Photo Capture (~L49)

```typescript
const handlePhotoCapture = (base64Image: string) => {
  setPhoto(base64Image);
  if (base64Image) {
    clickstream.track('photo_captured', {
      step: 3,
      guardId: user?.id,
      condominiumId: user?.condominium_id,
    });
  }
};
```

### 7.9 QR Scan (~L181, ~L186)

```typescript
// Start scan
function handlePerformScan() {
  clickstream.track('qr_scan_started', {
    step: 3,
    guardId: user?.id,
    condominiumId: user?.condominium_id,
  });
  setIsScanningQr(true);
}

// Scan result (inside handleQrScanned, after validation)
clickstream.track('qr_scanned', {
  step: 3,
  guardId: user?.id,
  condominiumId: user?.condominium_id,
  properties: { qr_valid: result?.is_valid ?? false },
});
```

### 7.10 Approval Mode Selection (~L770)

```typescript
<ApprovalModeSelector
  selectedMode={approvalMode}
  onModeSelect={(mode) => {
    clickstream.track('approval_mode_selected', {
      step: 3,
      guardId: user?.id,
      condominiumId: user?.condominium_id,
      properties: { mode },
    });
    setApprovalMode(mode);
  }}
  isOnline={!isOffline}
  unit={selectedUnit}
  visitorPhone={visitorPhone}
/>
```

### 7.11 Submit (~L220)

```typescript
async function handleSubmit() {
  // ... existing validation ...

  try {
    const visit = await api.createVisit(visitData);
    // ... existing logAudit ...

    submittedRef.current = true;
    clickstream.endFlow('submitted', {
      step: 3,
      guardId: user?.id,
      condominiumId: user?.condominium_id,
      properties: {
        visit_type_id: selectedType,
        has_photo: !!photo,
        has_qr: !!qrToken,
        approval_mode: isFreeEntry ? 'ENTRADA_LIVRE' : approvalMode,
        has_unit: !!unitId,
        has_restaurant: !!restaurantId,
        has_sport: !!sportId,
      },
    });

    navigate('/day-list');
  } catch (err) {
    // Don't mark as submitted on error
  }
}
```

---

## 8. Files Summary

| Action | File | Description |
|--------|------|-------------|
| Modify | `src/types.ts` | Add `ClickstreamEvent` interface (~20 lines at end) |
| Modify | `src/config/deployment.ts` | Add Kafka config fields to `DeploymentConfig` |
| Create | `src/services/clickstreamService.ts` | Singleton service (~200 lines) |
| Modify | `src/pages/NewEntry.tsx` | Add ~35 tracking calls (additive only, no structural changes) |

**No new directories needed.** No changes to CameraCapture.tsx or ApprovalModeSelector.tsx.

---

## 9. Environment Variables

Add to `.env.local`:

```env
VITE_KAFKA_REST_URL=https://kafka-elite-access-control-elite-access-control.b.aivencloud.com:23834
VITE_KAFKA_USER=avnadmin
VITE_KAFKA_PASSWORD=<AIVEN_PASSWORD>
VITE_KAFKA_TOPIC=tp_clickstream_visits
```

When `VITE_KAFKA_REST_URL` is absent, the entire service is a no-op.

---

## 10. Implementation Sequence

1. Add `ClickstreamEvent` interface to `src/types.ts`
2. Add Kafka config fields to `src/config/deployment.ts`
3. Create `src/services/clickstreamService.ts`
4. Add env vars to `.env.local`
5. Instrument `src/pages/NewEntry.tsx` (~35 additive lines)
6. Run `npm run lint` — verify zero warnings
7. Test no-op mode (no env vars) — verify zero network calls
8. Test with Kafka configured — verify events flow

---

## 11. Reusable Patterns from Codebase

| Pattern | Source File | What to Reuse |
|---------|------------|---------------|
| Singleton service export | `src/services/audioService.ts` | `export const clickstream = new ClickstreamService()` |
| UUID generation | `src/services/deviceUtils.ts` | `generateUUID()` function |
| Device identifier | `src/services/deviceUtils.ts` | `getDeviceIdentifier()` |
| Config from env vars | `src/config/deployment.ts` | `import.meta.env.VITE_*` pattern |
| Logger (warn only) | `src/services/logger.ts` | `logger.warn()` for flush failures |

---

## 12. Security Notes

- Kafka credentials are in env vars (`VITE_KAFKA_*`) but embedded in browser bundle via Vite's `import.meta.env`. Acceptable if:
  - The Aiven user has **write-only** permissions (no read/admin on topic)
  - Or Aiven has **IP filtering** or **rate limiting** configured
- If stricter security is needed, proxy through a **Supabase Edge Function**
- The `NoOp` mode ensures zero network calls when not configured

---

## 13. CORS Consideration

The Aiven Kafka REST Proxy may not have CORS headers configured for browser-origin requests. If blocked during testing:
- **Option A**: Configure CORS on Aiven REST Proxy
- **Option B**: Route through a Supabase Edge Function proxy
- Events will fail silently (caught by retry logic, re-persisted to localStorage)

---

## 14. Kafka Topic Strategy

| Topic | Purpose | Retention |
|-------|---------|-----------|
| `tp_clickstream_visits` | All clickstream events from entry flow | 30 days |
| `tp_visits` | Operational visit data (existing, unchanged) | as configured |

Separate topics prevent mixing analytics and operational data.

---

## 15. Verification Checklist

- [ ] **No-op mode**: Remove `VITE_KAFKA_REST_URL` → zero network calls, zero console errors
- [ ] **Lint**: `npm run lint` passes with zero warnings
- [ ] **Entry flow**: Complete full flow → check Network tab for POST to Kafka REST
- [ ] **Event payload**: Inspect Kafka payload → confirm no PII (names, docs, phones, plates)
- [ ] **Session grouping**: All events in one flow share same `session_id` and `flow_id`
- [ ] **Duration**: `duration_ms` increases monotonically through the flow
- [ ] **Abandon detection**: Start flow, navigate away → `flow_abandoned` event queued
- [ ] **Offline**: Go offline, complete flow → events persist in localStorage
- [ ] **Reconnect**: Come back online → persisted events flush automatically
- [ ] **Buffer overflow**: Generate >200 events → oldest dropped, no memory growth
- [ ] **Retry**: Kill Kafka mid-flow → events retry 2x, then re-persist
- [ ] **PII blocklist**: Pass `visitor_name` in properties → stripped from payload

---

## 16. Analytics Use Cases Enabled

| Use Case | Events Used |
|----------|-------------|
| **Funnel drop-off** | `entry_started` → `visit_type_selected` → `step_changed` → `flow_submitted` / `flow_abandoned` |
| **Time per step** | `duration_ms` on `step_changed` events |
| **QR adoption rate** | `qr_question_answered { has_qr: true }` / total entries |
| **Approval mode distribution** | `approval_mode_selected { mode }` |
| **Photo completion rate** | `photo_captured` / total entries reaching step 3 |
| **Most used visit types** | `visit_type_selected { visit_type_id }` |
| **Guard activity** | Events grouped by `guard_id` |
| **Device usage** | Events grouped by `device_id` |
| **Offline usage** | Events with `is_online: false` |
| **Average flow duration** | `duration_ms` on `flow_submitted` |
| **Abandonment reasons** | `flow_abandoned { last_step }` — which step loses users |
