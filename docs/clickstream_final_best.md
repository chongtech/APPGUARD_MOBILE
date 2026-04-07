# Clickstream Final Best - The Ultimate Specification

**Project**: EntryFlow
**Date**: 2026-03-24
**Status**: Final Implementation Recommendation
**Supersedes**: All previous clickstream documents.

---

## 1. Executive Summary

This document presents the absolute best solution for clickstream tracking, synthesized from the Gemini, Clodex, and Claude Code proposals. It balances **security**, **offline resilience**, and **clean architecture**.

### The "Winning" Architecture
1.  **Transport**: **Supabase Edge Function Relay**. Do not send events directly to Kafka from the browser.
2.  **Integration**: **`useClickstream` React Hook**. Manages session lifecycle and abandonment automatically.
3.  **Persistence**: **Bounded `localStorage` buffer**. Vital for guard tablets with flaky connectivity.
4.  **Schema**: **Structured Explicit Fields** + **Automation Sanitization**. High queryability with built-in PII protection.
5.  **Instrumentation**: **Handler Wrapping**. Minimal impact on shared components (`CameraCapture`, etc.).

---

## 2. Infrastructure & Security

### 2.1 Server-Side Relay (Supabase Edge Function)
Instead of hardcoding Kafka credentials in the client bundle, events are sent to a Supabase Edge Function:
- **Client**: Calls `edge-functions/track-clickstream` with a JSON batch.
- **Server**: Adds server-side timestamp, validates auth, and publishes to Kafka using secrets stored in Supabase.
- **Benefits**: No Kafka credentials in browser, zero CORS issues, centralized validation.

### 2.2 Configuration (.env)
```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
# No VITE_KAFKA_* variables needed for the client
```

---

## 3. Data Contract (Explicit Schema)

We use the explicit field model for high-value metrics, backed by a `sanitizeProperties` blocklist.

| Field | Description |
|-------|-------------|
| `event_id` | UUID v4 |
| `event_type` | Descriptive name (e.g., `visit_type_select`) |
| `session_id` | UUID per mount; groups one visit flow |
| `flow_sequence`| Incremental counter |
| `device_id` | Persistent device UUID |
| `guard_id` | Logged-in staff ID |
| `page` | Always `new_entry` |
| `step` | 1, 2, or 3 |
| `flow_variant` | `qr_scan` | `normal` | `free_entry` |
| `duration_ms` | Time since flow start |
| `is_online` | Connectivity status |

---

## 4. Client Implementation

### 4.1 `ClickstreamService` (Singleton)
- **Buffer**: Max 200 events in `localStorage`.
- **Flush**: Every 5s or Batch Size 10.
- **Retry**: 3 attempts with exponential backoff.
- **PII Blocklist**: Automated sanitization layer that strips keys like `name`, `phone`, `doc`, `plate`.

### 4.2 `useClickstream` Hook
```typescript
const cs = useClickstream({ guardId, condoId });
// ...
cs.track('visit_type_select', { step: 1, properties: { type_id: 101 } });
```
- Automatically fires `flow_abandon` if the component unmounts without a success event.

---

## 5. PII Protection Rules

- **NEVER** track raw strings from user inputs.
- **TRACK** the "presence" of data (e.g., `{ visitor_name: "filled" }`).
- **SANITY CHECK**: A dedicated `sanitizeProperties` function runs before any event reaches the buffer.

---

## 6. Instrumentation Strategy (Zero Blast Radius)

Instead of modifying props on common components like `CameraCapture.tsx`, we wrap the callbacks in `NewEntry.tsx`:

```typescript
// Inside NewEntry.tsx
const handlePhotoCaptureWithTracking = (data: string) => {
  if (data) cs.track('photo_captured', { step: 3 });
  handlePhotoCapture(data); // Original call
};

return (
  <CameraCapture onCapture={handlePhotoCaptureWithTracking} ... />
);
```

---

## 7. Implementation Roadmap

1.  **Schema**: Define `ClickstreamEvent` in `src/types.ts`.
2.  **Relay**: Deploy Supabase Edge Function `track-clickstream`.
3.  **Service**: Implement `src/services/clickstreamService.ts` (with `localStorage` + sanitization).
4.  **Hook**: Implement `src/hooks/useClickstream.ts`.
5.  **UI**: Instrument `NewEntry.tsx` using the "Handler Wrapping" pattern.
