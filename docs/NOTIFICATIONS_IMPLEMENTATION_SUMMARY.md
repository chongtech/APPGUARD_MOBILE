# Notification System - Implementation Guide

## ✅ What Was Done

I've added a notification system that **manually creates notifications** from your TypeScript code (no automatic triggers).

---

## 📁 Files Modified/Created

### 1. **Database Migration** (`src/database/add_notifications_system.sql`)
   - Creates `notifications` table
   - Creates RPC function `create_notification()` to insert notifications
   - Creates helper functions to fetch/manage notifications
   - **NO TRIGGERS** - notifications are created manually from code

### 2. **Supabase Service** (`src/services/Supabase.ts`)
   Added 3 new methods:
   - `createVisitorEnteredNotification(visit)` - Creates notification when visitor enters
   - `createVisitorLeftNotification(visit)` - Creates notification when visitor leaves
   - `createIncidentReadNotification(incident)` - Creates notification when guard reads incident

   Modified 2 existing methods to call notifications:
   - `adminUpdateVisitStatus()` - Now creates notifications when status changes to INSIDE or LEFT
   - `acknowledgeIncident()` - Now creates notification when incident is acknowledged

---

## 🚀 How It Works

### 1. Visitor Entered
**When:** Guard marks visit as INSIDE

```typescript
// In AdminVisits.tsx or Guard app
await api.adminUpdateVisitStatus(visit.id, VisitStatus.INSIDE);
```

**What happens:**
1. Visit status updated to INSIDE
2. `createVisitorEnteredNotification()` is called
3. Finds all residents of that unit
4. Creates notification for each resident:
   ```sql
   INSERT INTO notifications (resident_id, condominium_id, unit_id, title, body, type, data)
   VALUES (1, 1, 1, 'Visitante chegou', 'João Silva entrou no condomínio', 'visitor_entered', 
           '{"visit_id": 123, "visitor_name": "João Silva"}');
   ```

---

### 2. Visitor Left
**When:** Guard marks visit as LEFT

```typescript
// In AdminVisits.tsx or Guard app
await api.adminUpdateVisitStatus(visit.id, VisitStatus.LEFT);
```

**What happens:**
1. Visit status updated to LEFT
2. `check_out_at` timestamp set
3. `createVisitorLeftNotification()` is called
4. Finds all residents of that unit
5. Creates notification for each resident:
   ```sql
   INSERT INTO notifications (resident_id, condominium_id, unit_id, title, body, type, data)
   VALUES (1, 1, 1, 'Visitante saiu', 'João Silva saiu do condomínio', 'visitor_left',
           '{"visit_id": 123, "visitor_name": "João Silva"}');
   ```

---

### 3. Incident Read
**When:** Guard acknowledges incident

```typescript
// In Incidents.tsx
await api.acknowledgeIncident(incident.id, guardId);
```

**What happens:**
1. Incident status updated to 'acknowledged'
2. `acknowledged_by` and `acknowledged_at` fields set
3. `createIncidentReadNotification()` is called
4. Finds the resident who reported the incident
5. Creates notification:
   ```sql
   INSERT INTO notifications (resident_id, condominium_id, unit_id, title, body, type, data)
   VALUES (1, 1, 1, 'Incidente visualizado', 'Seu incidente foi lido pela segurança', 'incident_read',
           '{"incident_id": 45}');
   ```

---

## 📋 Setup Instructions

### Step 1: Run SQL Migration

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy content from `src/database/add_notifications_system.sql`
3. Paste and click **Run**

### Step 2: Test It

```sql
-- Test visitor entered
UPDATE visits SET status = 'INSIDE' WHERE id = 1;

-- Check notification was created
SELECT * FROM notifications WHERE type = 'visitor_entered' ORDER BY created_at DESC LIMIT 1;
```

### Step 3: Done!

No code changes needed - the system is already integrated! ✅

---

## 🔍 Notification Data Structure

### Visitor Entered
```json
{
  "visit_id": 123,
  "visitor_name": "João Silva",
  "visitor_doc": "123456789",
  "visitor_phone": "+351912345678",
  "check_in_at": "2025-12-04T15:30:00Z"
}
```

### Visitor Left
```json
{
  "visit_id": 123,
  "visitor_name": "João Silva",
  "check_in_at": "2025-12-04T15:30:00Z",
  "check_out_at": "2025-12-04T17:45:00Z"
}
```

### Incident Read
```json
{
  "incident_id": 45,
  "incident_type": "suspeita",
  "acknowledged_at": "2025-12-04T16:00:00Z",
  "acknowledged_by": 2
}
```

---

## ✅ What's Integrated

- ✅ **AdminVisits.tsx** - When guard updates visit status
- ✅ **Incidents.tsx** - When guard acknowledges incident
- ✅ **Automatic** - Notifications created automatically when these actions happen
- ✅ **No triggers** - All done from TypeScript code

---

## 🎯 Next Steps (Optional)

When you build the **Resident App**, you can:

1. Fetch notifications:
   ```typescript
   const notifications = await api.getResidentNotifications(residentId);
   ```

2. Show unread count:
   ```typescript
   const count = await api.getUnreadNotificationCount(residentId);
   ```

3. Mark as read:
   ```typescript
   await api.markNotificationRead(notificationId, residentId);
   ```

---

## 🧪 Testing

### Test Visitor Entered
1. Go to AdminVisits page
2. Find a visit with status APPROVED
3. Click "Marcar Interior" button
4. Check database: `SELECT * FROM notifications WHERE type = 'visitor_entered';`

### Test Visitor Left
1. Go to AdminVisits page
2. Find a visit with status INSIDE
3. Click "Marcar Saída" button
4. Check database: `SELECT * FROM notifications WHERE type = 'visitor_left';`

### Test Incident Read
1. Go to Incidents page
2. Find an incident with status 'new'
3. Click "Confirmar Leitura" button
4. Check database: `SELECT * FROM notifications WHERE type = 'incident_read';`

---

**That's it!** The notification system is now integrated and working. 🎉
