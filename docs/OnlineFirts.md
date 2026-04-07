# Online-First Migration Tracker

**Location:** `docs/OnlineFirts.md`
**Date:** 2026-02-07

## Scope
- All non-admin data flows should be **online-first** with **offline fallback** using IndexedDB.
- Admin screens remain **online-only** (no offline fallback).

## Goals
- Always attempt network first when connectivity is available.
- If network fails or times out, fall back to local cache.
- Keep sync and offline write flows intact (pending items still sync when online returns).
- Preserve existing offline-only constraints (e.g., QR validation stays online-only).

## Non-Goals
- No schema changes to Supabase or IndexedDB.
- No offline support added to admin pages.
- No changes to authentication rules (first login still online).

## Policy (Target Behavior)
- If `navigator.onLine === false`, go offline immediately and use local cache.
- If `navigator.onLine === true`, try backend first with a timeout.
- On backend failure, decrement health and fall back to local cache.
- Health should recover quickly when backend responds again.

## Step Tracker (Approval Required Per Step)
- [ ] **Step 1:** Create this tracker document. **Approval required**
- [ ] **Step 2:** Audit current read paths in `services/dataService.ts` and list changes. **Approval required**
- [ ] **Step 3:** Define concrete online-first rules and timeouts (health gating). **Approval required**
- [ ] **Step 4:** Implement online-first changes across read paths (admin unchanged). **Approval required**
- [ ] **Step 5:** Update tracker with results + verification checklist. **Approval required**

## Notes / Risks
- More network calls may increase latency on first load.
- Some screens will need clearer loading states if they previously returned cache instantly.
- Must ensure local pending records are not hidden after switching to online-first.
