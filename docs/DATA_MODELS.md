# Detailed Data Models

## Enums

```typescript
enum UserRole { ADMIN, GUARD, SUPER_ADMIN }
enum VisitType { VISITOR, DELIVERY, SERVICE, STUDENT }
enum VisitStatus { PENDING, APPROVED | DENIED | INSIDE | LEFT }
enum SyncStatus { SYNCED, PENDING_SYNC }
enum ApprovalMode { APP, PHONE, INTERCOM, GUARD_MANUAL, QR_SCAN }
enum Theme { ELITE, MIDNIGHT }
enum PhotoQuality { HIGH, MEDIUM, LOW }
```

## Core Entities

### Condominium
```typescript
interface Condominium {
  id: number;
  name: string;
  address?: string;
  logo_url?: string;
  latitude?: number;
  longitude?: number;
  gps_radius_meters?: number;
  status?: 'ACTIVE' | 'INACTIVE';
  phone_number?: string;
  contact_person?: string;
  contact_email?: string;
  manager_name?: string;
  total_residents?: number;  // Fetched dynamically for Admin Panel
}
```

### Device
```typescript
interface Device {
  id?: string;               // UUID
  device_identifier: string;  // Unique fingerprint
  device_name?: string;
  condominium_id?: number;
  configured_at?: string;
  last_seen_at?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED';
  metadata?: any;
}
```

### Staff
```typescript
interface Staff {
  id: number;
  first_name: string;
  last_name: string;
  pin_hash?: string;          // bcrypt hash of PIN
  condominium_id: number;
  condominium?: Condominium;
  role: UserRole;
  photo_url?: string;         // URL da foto do staff (bucket: staff-photos)
}
```

### Visit
```typescript
interface Visit {
  id: number;
  condominium_id: number;
  visitor_name: string;
  visitor_doc?: string;
  visitor_phone?: string;
  visit_type?: string;         // Display name
  visit_type_id: number;       // References visit_types
  service_type?: string;       // Display name
  service_type_id?: number;
  restaurant_id?: number;
  restaurant_name?: string;
  sport_id?: number;
  sport_name?: string;
  unit_id?: number;
  unit_block?: string;
  unit_number?: string;
  reason?: string;
  photo_url?: string;
  qr_token?: string;
  qr_expires_at?: string;
  check_in_at: string;
  check_out_at?: string;
  status: VisitStatus;
  approval_mode?: ApprovalMode;
  guard_id: number;
  device_id?: string;          // Tracks which device registered
  vehicle_license_plate?: string; // Vehicle plate number
  approved_at?: string;        // When visit was approved
  denied_at?: string;          // When visit was denied
  sync_status: SyncStatus;
}
```

### Unit
```typescript
interface Unit {
  id: number;
  condominium_id: number;
  code_block?: string;
  number: string;
  floor?: string;
  building_name?: string;
  residents?: Resident[];
}
```

### Resident
```typescript
interface Resident {
  id: number;
  condominium_id: number;
  unit_id: number;
  name: string;
  phone?: string;
  email?: string;
  type?: 'OWNER' | 'TENANT';
  created_at?: string;
  pin_hash?: string;           // bcrypt hash for app login
  has_app_installed?: boolean;
  device_token?: string;       // Push notification token (legacy)
  push_token?: string;         // Push notification token
  photo_url?: string;          // Resident photo URL
  app_first_login_at?: string;
  app_last_seen_at?: string;
}
```

### Incident
```typescript
interface Incident {
  id: number;
  reported_at: string;
  resident_id: number;
  resident?: Resident;
  unit?: Unit;
  description: string;
  type: string;                // References incident_types.code
  type_label?: string;
  status: string;              // References incident_statuses.code
  status_label?: string;
  photo_path?: string;
  acknowledged_at?: string;
  acknowledged_by?: number;
  guard_notes?: string;
  resolved_at?: string;
  sync_status?: SyncStatus;
}
```

### Street
```typescript
interface Street {
  id: number;
  condominium_id: number;
  name: string;
}
```

### AuditLog
```typescript
interface AuditLog {
  id: number;
  created_at: string;
  condominium_id: number;
  condominium?: Condominium;     // Joined condominium data
  actor_id: number | null;
  actor?: Staff;                 // Joined staff data (who performed the action)
  action: string;
  target_table: string;
  target_id: number | null;
  details: any;  // JSON
}
```

### DeviceRegistrationError
```typescript
interface DeviceRegistrationError {
  id: number;
  created_at: string;
  device_identifier?: string | null;
  error_message: string;
  payload?: any;  // JSON - original registration payload
}
```

### CondominiumStats
```typescript
interface CondominiumStats {
  id: number;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  total_visits_today: number;
  total_incidents_open: number;
  status: 'ACTIVE' | 'INACTIVE';
}
```

### VisitEvent
```typescript
interface VisitEvent {
  id?: number;                   // SERIAL in Supabase (auto-increment local)
  created_at?: string;           // timestamptz
  visit_id: number;              // INT4 (references visits)
  status: VisitStatus;           // Status recorded at this event
  event_at: string;              // timestamptz - when the status change occurred
  actor_id?: number;             // INT4 (references staff) - who made the change
  actor_name?: string;           // Resolved display name for the acting guard
  device_id?: string;            // UUID (references devices) - device used
  sync_status: SyncStatus;       // 'SINCRONIZADO' or 'PENDENTE_ENVIO'
}
```

**Purpose**: Tracks visit status changes over time for audit trail and history display.

### ResidentDevice
```typescript
interface ResidentDevice {
  id: number;
  resident_id: number;
  push_token: string;
  device_name?: string;
  platform?: string;           // 'ios' | 'android' | 'web'
  last_active?: string;
  created_at?: string;
}
```

### ResidentQrCode
```typescript
interface ResidentQrCode {
  id: string;                  // UUID
  resident_id: number;
  condominium_id: number;
  unit_id: number;
  purpose?: string;
  visitor_name?: string;
  visitor_phone?: string;
  notes?: string;
  qr_code: string;             // Unique QR code string
  is_recurring?: boolean;
  recurrence_pattern?: string;
  recurrence_days?: string[];
  start_date?: string;
  end_date?: string;
  expires_at?: string;
  status?: string;             // 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'USED'
  created_at?: string;
  updated_at?: string;
}
```

### QrValidationResult
```typescript
interface QrValidationResult {
  is_valid: boolean;
  resident_id: number | null;
  unit_id: number | null;
  visitor_name: string | null;
  visitor_phone: string | null;
  purpose: string | null;
  notes: string | null;
  message: string;
}
```

**Purpose**: Result returned by `validate_qr_code` RPC for guard QR scanning at the gatehouse.

### Notification
```typescript
interface Notification {
  id: number;
  resident_id: number;
  condominium_id: number;
  unit_id?: number;
  title: string;
  body: string;
  type?: string;               // 'VISIT_APPROVAL' | 'INCIDENT' | 'NEWS' etc.
  data?: any;                  // JSON payload
  read?: boolean;
  created_at?: string;
  updated_at?: string;
}
```

### CondominiumNews
```typescript
interface CondominiumNews {
  id: number;
  condominium_id: number;
  title: string;
  description?: string;
  content?: string;
  image_url?: string;
  category_id?: number;
  category_name?: string;
  category_label?: string;
  created_at?: string;
  updated_at?: string;
}
```

### AppPricingRule
```typescript
interface AppPricingRule {
  id: number;
  min_residents: number;
  max_residents: number | null;
  price_per_resident: number;
  currency: string;
  created_at?: string;
  updated_at?: string;
}
```

### CondominiumSubscription
```typescript
interface CondominiumSubscription {
  id: number;
  condominium_id: number;
  condominium_name?: string;
  current_residents_count?: number;
  status: 'ACTIVE' | 'INACTIVE' | 'TRIAL';
  custom_price_per_resident?: number | null;
  discount_percentage?: number;
  last_payment_date?: string;
  next_due_date?: string;
  payment_status?: 'PAID' | 'PARTIAL' | 'PENDING';
  months_in_arrears?: number;
  missing_months_list?: string;
  arrears_details?: any[];
  alerts_sent?: number;
  created_at?: string;
  updated_at?: string;
}
```

### SubscriptionPayment
```typescript
interface SubscriptionPayment {
  id: number;
  condominium_id: number;
  condominium_name?: string;
  amount: number;
  currency: string;
  payment_date: string;
  reference_period?: string;
  status: 'PAID' | 'PENDING' | 'FAILED' | 'PARTIAL';
  notes?: string;
  created_at?: string;
  updated_at?: string;
}
```

### SubscriptionAlert
```typescript
interface SubscriptionAlert {
  id: number;
  condominium_id: number;
  alert_date: string;
  reference_month: string;
  sent_by: number;
  created_at?: string;
}
```

### NewsCategory
```typescript
interface NewsCategory {
  id: number;
  name: string;
  label?: string;
  created_at?: string;
}
```

---

## PostgreSQL Database Schema (Supabase)

**Source**: Supabase REST API (OpenAPI spec) — queried live from the project.

### Core Tables

| Table | Columns | Description |
|-------|---------|-------------|
| `condominiums` | id, created_at, name, address, logo_url, latitude, longitude, gps_radius_meters, status, phone_number | Condominium/building registry |
| `units` | id, condominium_id, code_block, number, floor, building_name, created_at | Apartment/unit registry |
| `residents` | id, condominium_id, unit_id, name, phone, email, created_at, pin_hash, has_app_installed, device_token, app_first_login_at, app_last_seen_at, avatar_url, push_token, type | Resident directory |
| `staff` | id, created_at, first_name, last_name, pin_hash, condominium_id, role, photo_url | Guard/admin staff |
| `devices` | id (UUID), created_at, device_identifier, device_name, condominium_id, configured_at, last_seen_at, status, metadata | Registered tablet devices |
| `visits` | id, created_at, condominium_id, visitor_name, visitor_doc, visitor_phone, visit_type_id, service_type_id, unit_id, reason, photo_url, qr_token, qr_expires_at, check_in_at, check_out_at, status, approval_mode, guard_id, sync_status, restaurant_id, sport_id, approved_at, denied_at, device_id, vehicle_license_plate | Visit/delivery records |
| `visit_events` | id, created_at, visit_id, status, event_at, actor_id, device_id | Visit status change audit trail |
| `incidents` | id, reported_at, resident_id, description, type, status, photo_path, acknowledged_at, acknowledged_by, guard_notes, resolved_at | Security incident reports |
| `audit_logs` | id, created_at, condominium_id, actor_id, action, target_table, target_id, details, ip_address, user_agent | Audit trail for all actions |

### Reference/Config Tables

| Table | Columns | Description |
|-------|---------|-------------|
| `visit_types` | id, name, icon_key, requires_service_type, requires_restaurant, requires_sport | Visit type configuration |
| `service_types` | id, name | Service type lookup |
| `incident_types` | code, label, sort_order | Incident type lookup |
| `incident_statuses` | code, label, sort_order | Incident status lookup |
| `restaurants` | id, created_at, condominium_id, name, description, status | Restaurant directory |
| `sports` | id, created_at, condominium_id, name, description, status | Sports facility directory |
| `streets` | id, condominium_id, name, created_at | Street/location management |
| `news_categories` | id, name, label, created_at | News category lookup |

### Resident App Tables

| Table | Columns | Description |
|-------|---------|-------------|
| `resident_devices` | id, resident_id, push_token, device_name, platform, last_active, created_at | Resident mobile devices for push notifications |
| `resident_qr_codes` | id, resident_id, condominium_id, unit_id, purpose, visitor_name, visitor_phone, notes, qr_code, is_recurring, recurrence_pattern, recurrence_days, start_date, end_date, expires_at, status, created_at, updated_at | Visitor QR code invitations |
| `notifications` | id, resident_id, condominium_id, unit_id, title, body, type, data, read, created_at, updated_at | Push notifications for residents |
| `condominium_news` | id, condominium_id, title, description, content, image_url, category_id, created_at, updated_at | News articles per condominium |

### Error Tracking

| Table | Columns | Description |
|-------|---------|-------------|
| `device_registration_errors` | id, created_at, device_identifier, error_message, payload | Device registration error log |

### Views

| View | Columns | Description |
|------|---------|-------------|
| `v_app_adoption_stats` | condominium_id, condominium_name, total_units, total_residents, residents_with_app, units_with_app, resident_adoption_percent, unit_coverage_percent | Resident app adoption metrics per condominium |
