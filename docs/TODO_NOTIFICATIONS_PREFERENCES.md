# TODO: Notification Preferences Implementation

## Status: Not Implemented

**Created**: 2026-02-09

---

## Overview

The `residents` table in Supabase has a `notification_preferences` column that is not yet used in the application. This document outlines the implementation plan.

---

## Current State

### Database
- Column `notification_preferences` exists in `residents` table (type: JSONB)
- Not being inserted/updated from the application

### Frontend
- `Resident` interface in `types.ts` does not include `notification_preferences`
- `AdminResidents.tsx` form does not collect notification preferences
- No UI for residents to manage their preferences in the Resident App

---

## Implementation Plan

### 1. Update TypeScript Types

Add to `Resident` interface in `types.ts`:

```typescript
export interface NotificationPreferences {
  push?: boolean;      // Push notifications (app)
  email?: boolean;     // Email notifications
  sms?: boolean;       // SMS notifications
  // Granular preferences (optional)
  visit_alerts?: boolean;
  incident_alerts?: boolean;
  news_alerts?: boolean;
}

export interface Resident {
  // ... existing fields
  notification_preferences?: NotificationPreferences;
}
```

### 2. Update AdminResidents.tsx

Add form fields for notification preferences in create/edit modals:

```tsx
// Add to formData state
notification_preferences: {
  push: true,
  email: true,
  sms: false,
  visit_alerts: true,
  incident_alerts: true,
  news_alerts: true
}

// Add UI toggles in form
<div>
  <label>Notification Preferences</label>
  <div className="space-y-2">
    <label><input type="checkbox" /> Push Notifications</label>
    <label><input type="checkbox" /> Email Notifications</label>
    <label><input type="checkbox" /> SMS Notifications</label>
  </div>
</div>
```

### 3. Update Supabase RPCs

Ensure `admin_create_resident` and `admin_update_resident` handle the `notification_preferences` field in the JSONB payload.

### 4. Resident App Integration

- Add settings screen for residents to manage their preferences
- Store preferences via `admin_update_resident` or dedicated RPC
- Respect preferences when sending notifications

### 5. Notification Service Updates

When sending notifications, check resident preferences:

```typescript
async function sendNotification(residentId: number, type: string, payload: any) {
  const resident = await getResident(residentId);
  const prefs = resident.notification_preferences || {};

  if (prefs.push && prefs[`${type}_alerts`] !== false) {
    await sendPushNotification(resident, payload);
  }
  if (prefs.email && prefs[`${type}_alerts`] !== false) {
    await sendEmailNotification(resident, payload);
  }
  if (prefs.sms && prefs[`${type}_alerts`] !== false) {
    await sendSmsNotification(resident, payload);
  }
}
```

---

## Default Values

When creating a new resident, use these defaults:

```json
{
  "push": true,
  "email": true,
  "sms": false,
  "visit_alerts": true,
  "incident_alerts": true,
  "news_alerts": true
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `types.ts` | Add `NotificationPreferences` interface, update `Resident` |
| `pages/admin/AdminResidents.tsx` | Add form fields for preferences |
| `services/dataService.ts` | Pass preferences in create/update calls |
| `services/Supabase.ts` | Verify RPCs handle the field |
| Resident App | Add preferences settings screen |
| Notification service | Check preferences before sending |

---

## Priority

**Medium** - Feature enhancement for better user control over notifications.

---

## Related

- Push notifications system
- Email notification service (not yet implemented)
- SMS notification service (not yet implemented)
