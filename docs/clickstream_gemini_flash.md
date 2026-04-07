# Clickstream Gemini Flash - Final Design Specification

**Project**: EntryFlow
**Date**: 2026-03-24
**Author**: Antigravity (Gemini Flash)
**Status**: Finalized Design (Ready for Implementation)

---

## 1. Overview

This document defines the final clickstream design, combining the best features of previous iterations (v1, v2, v3). It prioritizes **offline resilience**, **clean React integration**, and **structured analytics data**.

### Core Pillars
- **Architecture**: Hook-based (`useClickstream`) with a Singleton Service (`ClickstreamService`).
- **Persistence**: `localStorage` buffering for offline support (max 200 events).
- **Schema**: Explicit, queryable fields (v2 style) with a flexible `properties` map.
- **Privacy**: Strict PII protection (no harvesting of names, documents, or phones).
- **Reliability**: Exponential backoff retry logic (1s, 2s).

---

## 2. Data Schema (Avro-compatible)

**File**: `src/schemas/clickstreamEvent.avsc`

| Field | Type | Description |
|-------|------|-------------|
| `event_id` | string | UUID v4, unique per event |
| `event_type` | string | Action name (e.g., `step_view`, `form_submit`) |
| `event_at` | string | ISO 8601 UTC timestamp |
| `session_id` | string | UUID generated per `NewEntry` mount |
| `flow_sequence` | int | Incremental counter within a session |
| `device_identifier` | string | Persistent tablet/browser UUID |
| `condominium_id` | int | Contextual condo ID |
| `guard_id` | int | Contextual guard/staff ID |
| `page` | string | Source page (default: `new_entry`) |
| `step` | int? | Wizard step: 1, 2, or 3 |
| `component` | string | Logical UI component name |
| `action` | string | Verb: `select`, `focus`, `blur`, `open`, `view`, etc. |
| `element_id` | string? | DOM-like ID of the element |
| `flow_variant` | string? | `qr_scan` | `normal` | `free_entry` |
| `is_online` | boolean | `navigator.onLine` status at event time |
| `properties` | map<string> | Flexible key-value map for non-PII metrics |

---

## 3. Architecture

### 3.1 `ClickstreamService` (Singleton)
- **Queueing**: Internal array `buffer` + `localStorage` backup (`clickstream_queue`).
- **Flush Rules**: 
  - Immediate if buffer size >= 10.
  - Periodic every 5 seconds.
  - Final flush on `destroy()`.
  - Re-flush on `window.online`.
- **Providers**: Abstraction layer for `AivenProvider` (Active), `ConfluentProvider` (Stub), and `NoOpProvider` (Disabled).

### 3.2 `useClickstream` Hook
- **Session Lifecycle**: Initializes session on mount, triggers `flow.abandon` on unmount if not completed.
- **Convenience Methods**:
  - `track(params)`: Standard tracking.
  - `trackInput(field)`: Tracks initial interaction (focus/blur) without sensitive values.
  - `trackComplete(visitId)`: Marks session as successful.

---

## 4. Privacy & PII Rules

**NEVER** track the following values:
- Visitor Name, Document, Phone, Vehicle Plate.
- Resident Names or specific unit details (IDs are okay, labels are okay if non-identifying).

**INSTEAD** track:
- `value_status`: `'filled'` | `'empty'`.
- `char_count`: Length of the string (optional).

---

## 5. Event Catalogue (Summary)

| Event Type | Component | Action |
|------------|-----------|--------|
| `flow.start` | `page` | `mount` |
| `step_view` | `container` | `view` |
| `modal_open` | `unit_modal`, etc. | `open` |
| `field_blur` | `form_input` | `blur` (w/ value_status) |
| `qr_scan_result` | `camera` | `success` | `failure` |
| `form_submit` | `submit_btn` | `click` |
| `flow.complete` | `page` | `success` |
| `flow.abandon` | `page` | `unmount` |

---

## 6. Configuration (.env)

```env
VITE_KAFKA_PROVIDER=aiven
VITE_KAFKA_REST_URL=https://...aivencloud.com:23834
VITE_KAFKA_TOPIC=tp_clickstream_visits
VITE_KAFKA_USER=avnadmin
VITE_KAFKA_PASSWORD=*******
```

---

## 7. Implementation Sequence

1. Define types in `src/types.ts`.
2. Create `src/services/clickstreamService.ts`.
3. Create `src/hooks/useClickstream.ts`.
4. Update `NewEntry.tsx` and child components with tracking hooks.
5. Verify offline sync behavior.
