# Clickstream Clodex

## Purpose

This document is the final implementation recommendation for clickstream tracking in the entry registration flow. It consolidates the ideas from `src/docs/clickstream1.md`, `src/docs/clickstream2.md`, and `src/docs/clickstream3.md` into one version that fits the current codebase.

The target flow is `src/pages/NewEntry.tsx`.

## Final Decision

The best implementation is:

1. Use the richer event model from `clickstream2`.
2. Use the client integration style from `clickstream3`: a small service and a small React hook.
3. Do not send events directly from the browser to Kafka.
4. Send events to a server-side relay first, preferably a Supabase Edge Function, and publish to Kafka from there.

This keeps the feature aligned with the app's current architecture, reduces CORS risk, avoids exposing Kafka credentials in the browser bundle, and keeps the `NewEntry` changes manageable.

## Why This Version

### 1. It matches the current architecture

The application already routes important writes through `dataService` and Supabase RPC-backed services. Clickstream should follow the same shape instead of introducing a separate browser-to-Kafka path.

### 2. It minimizes risk

Direct browser access to Kafka requires:

- exposing write credentials through `VITE_*`
- relying on CORS support from the Kafka REST endpoint
- handling transport failures in an environment that should stay UI-first

That is avoidable. A relay removes the weakest parts of the earlier proposals.

### 3. It fits the current `NewEntry` code

`NewEntry.tsx` is a large stateful page with clear handler seams for instrumentation:

- visit type selection
- QR question response
- modal open/select/close
- QR scan lifecycle
- photo capture / retake
- approval mode selection
- submit success / failure

This makes a thin `useClickstream()` hook and `clickstreamService` the least invasive implementation.

### 4. It preserves the best event semantics

`clickstream2` has the strongest event catalogue and PII guidance. It is more implementation-ready than `clickstream1` and more analytically useful than the simpler event naming in `clickstream3`.

## Recommended Architecture

### Client Flow

`NewEntry` -> `useClickstream` -> `clickstreamService` -> `dataService.trackClickstreamBatch()` -> Supabase Edge Function -> Kafka

### Server Flow

Supabase Edge Function:

1. receives a batch of clickstream events
2. validates the payload shape
3. adds any server-side metadata if needed
4. forwards the batch to Kafka
5. returns success or a non-blocking failure response

## Transport Decision

### Use

- client-side batching
- fire-and-forget behavior
- bounded retry
- best-effort flush on unmount / page hide
- server-side Kafka publish

### Do Not Use

- browser -> Kafka direct publish
- Kafka credentials in `VITE_*`
- analytics failures that surface to the user
- Sentry error reporting for routine clickstream transport failures

## Event Model

Use the `clickstream2` structure as the base because it is explicit and analytics-friendly.

Recommended event envelope:

```ts
type ClickstreamEventType =
  | 'step_view'
  | 'visit_type_select'
  | 'qr_question_shown'
  | 'qr_question_response'
  | 'form_field_focus'
  | 'form_field_blur'
  | 'modal_open'
  | 'modal_close'
  | 'modal_item_select'
  | 'step2_next'
  | 'photo_capture'
  | 'photo_retake'
  | 'qr_scan_start'
  | 'qr_scan_result'
  | 'approval_mode_select'
  | 'phone_call_initiate'
  | 'intercom_call_initiate'
  | 'form_submit'
  | 'form_submit_success'
  | 'form_submit_error'
  | 'navigation_back'
  | 'flow_abandon';

type VisitFlowVariant = 'qr_scan' | 'normal' | 'free_entry';

interface ClickstreamEvent {
  event_id: string;
  event_type: ClickstreamEventType;
  event_at: string;
  session_id: string;
  flow_sequence: number;
  device_identifier: string;
  condominium_id: number;
  guard_id: number;
  guard_role: string;
  page: 'new_entry';
  step: 1 | 2 | 3 | null;
  component: string;
  flow_variant: VisitFlowVariant | null;
  visit_type_id: string | null;
  visit_type_name: string | null;
  action: string;
  element_id: string | null;
  value_selected: string | null;
  value_label: string | null;
  qr_result_valid: boolean | null;
  is_online: boolean;
  error_message: string | null;
  attributes?: Record<string, string>;
}
```

### Why Keep `attributes`

The earlier docs conflict between explicit fields and a generic properties map.

Recommended compromise:

- keep the explicit `clickstream2` fields as the main contract
- allow an optional, tightly controlled `attributes` map for low-risk future additions

This avoids schema churn for minor analytics additions while keeping the main payload structured.

## PII Rules

Never send:

- visitor name
- visitor document number
- visitor phone number
- vehicle plate
- QR raw token
- photo data
- resident phone numbers

Allowed:

- guard ID
- guard role
- device identifier
- condominium ID
- visit type ID and name
- restaurant / sport / service / unit identifiers
- approval mode
- filled vs empty state for text inputs
- QR validity boolean

## Reliability Rules

### Phase 1

Use:

- in-memory queue
- flush every 5 seconds
- immediate flush when batch size threshold is reached
- max buffer size cap
- retry up to 3 attempts with short backoff
- best-effort final flush on unmount / page hide

### Phase 1 Non-Goal

Do not add `localStorage` or IndexedDB persistence for clickstream yet.

Reason:

- this feature is analytics-only
- persistent replay increases complexity and duplicate-event risk
- session semantics become weaker when events survive across app restarts
- the app already has more important offline responsibilities than analytics

If later analysis proves event loss is unacceptable, add persistence in phase 2 with dedupe keys.

## Client Structure

### 1. `src/services/clickstreamService.ts`

Responsibilities:

- own session ID
- own flow sequence counter
- hold identity context
- buffer events
- flush batches
- never throw to UI callers
- log warnings or debug messages only

### 2. `src/hooks/useClickstream.ts`

Responsibilities:

- initialize clickstream for `NewEntry`
- set identity from current user and device
- track initial step view
- expose a small `track()` API
- handle `flow_abandon` on unmount if no success event was recorded

### 3. `src/services/dataService.ts`

Add a method like:

```ts
trackClickstreamBatch(events: ClickstreamEvent[]): Promise<void>
```

Responsibilities:

- call the server-side relay
- keep the rest of the app unaware of Kafka details

### 4. Server Relay

Preferred option:

- Supabase Edge Function

Responsibilities:

- validate auth if required
- validate payload size and shape
- forward to Kafka
- keep Kafka credentials server-side

## Instrumentation Scope

Implement the `clickstream2` event catalogue for `NewEntry`.

Main capture points:

- mount and step views
- visit type selection
- QR decision modal open and response
- field focus and blur with `filled` or `empty` only
- unit / service / restaurant / sport modal open, close, select
- photo capture and retake
- QR scan start and result
- approval mode select
- phone and intercom initiation
- submit start, success, error
- back navigation
- flow abandon

## Component Changes

### `src/components/CameraCapture.tsx`

Add an optional callback:

```ts
onPhotoRetaken?: () => void
```

This avoids putting retake tracking logic in DOM-specific code outside the component.

### `src/components/ApprovalModeSelector.tsx`

Add optional callbacks:

```ts
onPhoneCallInitiated?: () => void
onIntercomCallInitiated?: () => void
```

This keeps clickstream tracking close to the actual action without mixing transport logic into the component internals.

## File Plan

### Create

- `src/services/clickstreamService.ts`
- `src/hooks/useClickstream.ts`
- `src/schemas/clickstreamEvent.avsc`

### Modify

- `src/pages/NewEntry.tsx`
- `src/components/CameraCapture.tsx`
- `src/components/ApprovalModeSelector.tsx`
- `src/services/dataService.ts`

### Optional

- `src/config/deployment.ts`

Only add relay endpoint config here if the chosen server-side route needs it.

Do not add Kafka secrets to browser config.

## Logging Rules

Clickstream transport failures should:

- use `logger.warn()` for send failures
- use `logger.debug()` for queue and flush traces in development

Clickstream transport failures should not:

- call `logger.error()`
- create Sentry exception noise
- show blocking UI errors

## Topic Strategy

Use a dedicated topic:

- `tp_clickstream_visits`

Do not mix clickstream analytics events into the operational visits topic.

## Phased Implementation Plan

### Phase 1

1. create event types and schema
2. create `clickstreamService`
3. create `useClickstream`
4. add relay method in `dataService`
5. instrument `NewEntry`
6. add optional callbacks to shared components

### Phase 2

1. add dashboard-side consumption and analytics pipelines
2. decide whether persistent offline replay is actually needed
3. add dedupe safeguards if persistent replay is introduced

## Verification Checklist

- step 1 initial view sends exactly one `step_view`
- all events in one flow share the same `session_id`
- `flow_sequence` increases monotonically
- form fields never send raw values
- modal events include correct selected IDs and labels
- QR scan result distinguishes valid vs invalid
- submit success includes created visit ID
- submit error includes sanitized error text only
- leaving the flow before success emits `flow_abandon`
- analytics transport failure does not block registration
- no Kafka credentials are exposed in the browser bundle

## Final Recommendation Summary

Use `clickstream2` for the event contract, `clickstream3` for the client integration shape, and replace direct browser-to-Kafka transport with a server-side relay.

That is the cleanest implementation for this codebase, the safest operationally, and the easiest version to maintain after the initial rollout.
