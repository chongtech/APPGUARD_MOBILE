# Architecture Deep Dive

## 1. Offline-First Data Flow

**ALL data operations go through `DataService`** (services/dataService.ts - 4,016 lines), which implements a Cache-Then-Network strategy and sentry for log:

```
Component → DataService → IndexedDB (primary) + Supabase (sync)
                       ↓
                Backend Health Check (score 0-3)
```

**Never bypass DataService** to access Supabase directly from components. DataService manages:
- Offline/online detection via health score system
- Automatic retry with exponential backoff
- Local-first writes with background sync
- Device fingerprinting and heartbeat
- Multi-layer storage sync (central DB → IndexedDB → localStorage)
- Persistent storage requests for PWA
- **Device tracking for visits** (see below)
- Always use Sentry for logging

### 1.1 Device Tracking for Visits

Every visit records `device_id` (UUID) to track which tablet registered it:

```typescript
// DataService tracks current device
private currentDeviceId: string | null = null;

// Automatically included when creating visits
device_id: this.currentDeviceId || undefined
```

**Benefits**:
- Audit trail: Know which device registered each visit
- Historical queries: Works even after device reassignment between condominiums
- Analytics: Device usage patterns and performance

**Example Query** (after device reassigned from Condo 1 to Condo 2):
```sql
-- All visits from Device X while at Condo 1
SELECT * FROM visits WHERE device_id = 'uuid' AND condominium_id = 1;
```

## 2. Data Synchronization Strategies

**Configuration Data (Cache-Then-Network)**:
- Return local data immediately if available
- Fire background refresh to update from backend
- Example: `getVisitTypes()`, `getServiceTypes()`

**User Data (Write-Through with Retry)**:
- Save to IndexedDB first (always succeeds)
- Attempt backend sync with `sync_status: PENDING_SYNC`
- Mark as `SYNCED` on success
- Example: `createVisit()`, `updateVisitStatus()`

**Background Sync**:
- `syncPendingItems()` automatically retries failed syncs
- Called on health check recovery and user-triggered sync

**Sync Event System**:
The `DataService` emits custom window events to notify the UI about sync progress:

```typescript
// Event types (dataService.ts)
type SyncEventType = 'sync:start' | 'sync:progress' | 'sync:complete' | 'sync:error';

// Event detail structure
interface SyncEventDetail {
  total?: number;    // Total items to sync
  synced?: number;   // Items synced so far
  message?: string;  // Status message
  error?: string;    // Error message (for sync:error)
}
```

**Sync Flow**:
```
1. syncPendingItems() called (manual or auto-recovery)
2. Emit 'sync:start' with total count
3. For each pending item:
   - Sync to Supabase
   - Emit 'sync:progress' with current count
4. Emit 'sync:complete' or 'sync:error'
```

**SyncOverlay Component** (components/SyncOverlay.tsx):
- Full-screen overlay shown during sync operations
- Displays progress bar with item count
- Shows success/error states
- Prevents user interaction during sync

**App.tsx Event Listeners**:
```typescript
// App.tsx listens to sync events and controls SyncOverlay visibility
window.addEventListener('sync:start', handleSyncStart);
window.addEventListener('sync:progress', handleSyncProgress);
window.addEventListener('sync:complete', handleSyncComplete);
window.addEventListener('sync:error', handleSyncError);
```

**Automatic Sync Triggers**:
1. Health check recovery (backend was down, now up) - every 60 seconds
2. Manual sync button on Dashboard
3. After creating/updating records when online

## 3. Device Configuration Flow

Each tablet must be configured before use:

```
1. Setup.tsx → configureDevice(condoId)
   - Generates unique device fingerprint (deviceUtils.ts)
   - Registers device in Supabase
   - Saves config to IndexedDB + localStorage

2. ConfigGuard checks if device configured
   - Redirects to /setup if not configured
   - Loads condominium details for display

3. Login requires staff.condominium_id === device.condominium_id
   - Guards can only login to their assigned condominium's devices
```

**Storage Layer Priorities**:
- **Online**: Central DB (source of truth) → IndexedDB → localStorage
- **Offline**: IndexedDB (primary cache) → localStorage (backup/fast access)
- Persistent Storage API (`navigator.storage.persist()`) requested on init to prevent browser auto-deletion on kiosk tablets

**localStorage Keys**:
- `condo_guard_device_id` — device_identifier UUID
- `device_condo_backup` — JSON stringified Condominium object
- `auth_user` — auth state persistence across PWA updates

**IndexedDB Settings Keys**:
- `device_condo_details` — Condominium object
- `device_id` — device_identifier string

**Configuration Check Priority (isDeviceConfigured)**:
1. **Online**: Query Central DB by `device_identifier` → if not found, fallback query by `condominium_id` from IndexedDB → sync all layers
2. **Offline**: Check IndexedDB `device_condo_details` → restore localStorage if missing
3. **Last resort**: Parse `device_condo_backup` from localStorage → restore to IndexedDB
4. **All empty + online**: Navigate to `/setup`
5. **All empty + offline**: Offline emergency configuration

**Scenario Matrix** (localStorage x IndexedDB x Online):

| localStorage | IndexedDB | Online | Action |
|---|---|---|---|
| Valid | Valid | Online | Sync from Central DB → update all layers |
| Valid | Valid | Offline | Use IndexedDB, restore localStorage if needed |
| Valid | Empty | Online | Query Central DB → populate IndexedDB |
| Valid | Empty | Offline | Restore IndexedDB from localStorage |
| Empty | Valid | Online | Sync from Central DB → restore localStorage |
| Empty | Valid | Offline | Restore localStorage from IndexedDB |
| Empty | Empty | Online | Navigate to /setup |
| Empty | Empty | Offline | **Offline emergency configuration** |

**Sync Validation Rules**:
- Central DB always wins when online (overwrites local data)
- IndexedDB has priority over localStorage when offline
- All writes must sync bidirectionally (IndexedDB ↔ localStorage)
- Never clear localStorage without also clearing IndexedDB

**Offline Emergency Configuration**:
- Admin can configure device manually without internet using `configureDeviceOffline()`
- Requires admin PIN verification (123456)
- Guard provides `device_identifier` to admin (copy button on screen)
- Admin checks Central DB: if device exists, provides condo ID/name; if new, creates record first
- Guard enters condo ID + name in manual config form
- Saves to IndexedDB (settings, devices, condominiums tables) + localStorage
- Will sync with Central DB when internet is restored

## 4. Authentication & Security

**PIN Authentication**:
- PINs stored as bcrypt hashes (never plaintext)
- Online: `verify_staff_login()` RPC validates PIN on backend
- Offline: Local bcrypt comparison against cached `staff.pin_hash`
- First login must be online to cache credentials

**AuthContext** (App.tsx):
- Global auth state: `{ user: Staff | null, login, logout }`
- ProtectedRoute guards authenticated pages
- ConfigGuard ensures device setup
- AdminRoute guards admin-only pages

**Role Hierarchy**:
- `GUARD` - Standard guard access by Condominium
- `ADMIN` - Administrative access to management pages by Condominium
- `SUPER_ADMIN` - Full system access

## 5. Audit Logging (App + Supabase)

**Client logging**:
- Visit creation logs on `NewEntry` (CREATE visits).
- Visit status changes log on guard updates and admin updates.
- Incident acknowledge/resolve/notes log for guard + admin flows.
- Admin CRUD for condominiums, devices, staff, units, residents, restaurants, sports, visit types, service types logs CREATE/UPDATE/DELETE.
- Login/Logout and login failures log with device identifier.
- CSV/PDF exports log (visits/incidents/audit logs).

**Backend**:
- RPCs `create_audit_log` and `admin_get_audit_logs` are expected to be deployed.
- Optional SQL scripts:
  - `database/audit_log_policies.sql` (retention + RLS)
  - `database/audit_log_hardening.sql` (revoke UPDATE/DELETE/TRUNCATE on `audit_logs`)

## 6. PWA Configuration (vite.config.ts)

**Service Worker** (VitePWA):
- Prompt-based registration (user controls updates)
- `skipWaiting: false` - prevents sudden reload
- Runtime caching for Supabase API (NetworkFirst, 5min TTL)
- Image caching (CacheFirst, 7 days)

**Caching Strategies**:
- **App Shell**: Cached on install (HTML, CSS, JS)
- **CDN Resources**: CacheFirst (Tailwind, fonts, AI Studio CDN)
- **Supabase API**: NetworkFirst with 10s timeout (5min cache)
- **Images**: CacheFirst (7 days cache)

**HTTPS Required**: `@vitejs/plugin-basic-ssl` enables camera access on tablets

**PWA Update Flow**:
- Update check interval: 60s (dev), recommended 5min for production
- `PWAUpdateNotification.tsx` shows update prompt with `[PWA Update]` log prefix
- Auth state persists across updates via `localStorage` (`auth_user` key)
- Known config conflict: `skipWaiting: true` + `registerType: 'prompt'` — consider setting `skipWaiting: false` for controlled updates

**Tablet-Specific Optimizations**:
- Viewport fit for notched devices
- Prevents accidental zoom/pull-to-refresh
- Kiosk mode styles (no text selection on UI)
- Standalone display mode

---

## 7. Backend Integration (Supabase)

**RPC Migration Status**: 99% Complete (February 2026)
- 111 RPC functions implemented and in use
- 1 remaining `.from()` call (`device_registration_errors` table)
- 10 storage bucket `.from()` calls (correct - Supabase Storage API)

### RPC Functions (services/Supabase.ts - 2,907 lines)

111+ functions total, grouped by domain:

**Authentication (3)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `verify_staff_login` | p_first_name, p_last_name, p_pin (TEXT) | Guard/admin PIN login |
| `verify_resident_login` | p_phone, p_pin_cleartext, p_device_token (TEXT) | Resident app login |
| `register_resident_pin` | p_phone, p_pin_cleartext, p_device_token (TEXT) | Register resident PIN |

**Device Management (7)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `register_device` | p_data (JSONB) | Register new tablet device |
| `get_device` | p_identifier (TEXT) | Get device by fingerprint |
| `update_device_heartbeat` | p_identifier (TEXT) | Update last_seen_at |
| `update_device_status` | p_id (INT), p_status (TEXT) | Change device status |
| `deactivate_condo_devices` | p_condominium_id (INT) | Deactivate all devices for a condo |
| `get_devices_by_condominium` | p_condominium_id (INT) | List devices per condo |
| `admin_get_all_devices` | (none) | List all devices |

**Visits (8)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `create_visit` | p_data (JSONB) | Create new visit record |
| `update_visit_status` | p_id (INT), p_status (TEXT) | Update visit status |
| `checkout_visit` | p_id (INT) | Check out visitor |
| `create_visit_event` | p_data (JSONB) | Log visit status change |
| `get_visit_events` | p_visit_id (INT) | Get visit event history |
| `admin_get_all_visits` | p_condominium_id (INT), p_start_date, p_end_date (DATE) | List visits (date range) |
| `admin_get_all_visits_filtered` | p_condominium_id, p_start_date, p_end_date, p_status, p_visit_type, p_service_type | Filtered visit query |
| `admin_update_visit` | p_id (INT), p_data (JSONB) | Update visit record |

**Condominiums (7)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `get_condominiums` | (none) | List all condominiums |
| `get_condominium` | p_id (INT) | Get single condominium |
| `get_available_condominiums_for_setup` | (none) | Active condos for device setup |
| `admin_create_condominium` | p_data (JSONB) | Create condominium |
| `admin_update_condominium` | p_id (INT), p_data (JSONB) | Update condominium |
| `admin_delete_condominium` | p_id (INT) | Delete condominium |
| `admin_get_condominiums_with_stats` | (none) | Condos with visit/incident stats |

**Staff (6)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `get_staff_by_condominium` | p_condominium_id (INT) | Staff list per condo |
| `admin_get_all_staff` | p_condominium_id (INT) | All staff for admin |
| `admin_create_staff_with_pin` | p_first_name, p_last_name (TEXT), p_condominium_id (INT), p_role, p_pin_cleartext, p_photo_url (TEXT) | Create staff with PIN |
| `admin_update_staff` | p_id (INT), p_data (JSONB) | Update staff |
| `admin_delete_staff` | p_id (INT) | Delete staff |
| `admin_update_staff_pin` | p_staff_id (INT), p_pin_cleartext (TEXT) | Reset staff PIN |

**Units (4)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `get_units` | p_condominium_id (INT) | Units per condo |
| `admin_get_all_units` | p_condominium_id (INT) | All units for admin |
| `admin_create_unit` | p_data (JSONB) | Create unit |
| `admin_delete_unit` | p_id (INT) | Delete unit |

**Residents (5)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `get_resident` | p_id (INT) | Get single resident |
| `admin_get_residents` | p_condominium_id, p_search, p_limit, p_after_id, p_after_name | Paginated resident search |
| `admin_create_resident` | p_data (JSONB) | Create resident |
| `admin_update_resident` | p_id (INT), p_data (JSONB) | Update resident |
| `admin_get_resident_qr_codes` | p_resident_id (INT) | Get all QR codes for a resident |

**Incidents (7)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `create_incident` | p_resident_id (INT), p_description, p_type, p_photo_path (TEXT) | Create incident |
| `get_incidents` | p_condominium_id (INT) | Incidents per condo |
| `get_resident_incidents` | p_resident_id (INT) | Incidents per resident |
| `acknowledge_incident` | p_id (UUID), p_guard_id (INT) | Guard acknowledges incident |
| `admin_get_all_incidents` | p_condominium_id (INT) | All incidents for admin |
| `admin_update_incident` | p_id (UUID), p_data (JSONB) | Update incident |
| `admin_delete_incident` | p_id (UUID) | Delete incident |

**Configuration (11)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `get_visit_types` | p_condominium_id (INT) | Visit types per condo |
| `get_service_types` | (none) | All service types |
| `get_incident_types` | (none) | Incident type lookup |
| `get_incident_statuses` | (none) | Incident status lookup |
| `admin_get_visit_types` | (none) | All visit types for admin |
| `admin_get_service_types` | (none) | All service types for admin |
| `admin_create_visit_type` | p_data (JSONB) | Create visit type |
| `admin_delete_visit_type` | p_id (INT) | Delete visit type |
| `admin_create_service_type` | p_data (JSONB) | Create service type |
| `admin_update_service_type` | p_id (INT), p_data (JSONB) | Update service type |
| `admin_delete_service_type` | p_id (INT) | Delete service type |

**Restaurants & Sports (10)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `get_restaurants` | p_condominium_id (INT) | Restaurants per condo |
| `get_sports` | p_condominium_id (INT) | Sports per condo |
| `admin_get_restaurants` | (none) | All restaurants |
| `admin_get_sports` | (none) | All sports |
| `admin_create_restaurant` | p_data (JSONB) | Create restaurant |
| `admin_update_restaurant` | p_id (INT), p_data (JSONB) | Update restaurant |
| `admin_delete_restaurant` | p_id (INT) | Delete restaurant |
| `admin_create_sport` | p_data (JSONB) | Create sport |
| `admin_update_sport` | p_id (INT), p_data (JSONB) | Update sport |
| `admin_delete_sport` | p_id (INT) | Delete sport |

**News (9)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `get_news` | p_condominium_id (INT), p_days (INT DEFAULT 7) | Get news from last N days |
| `admin_get_all_news` | p_condominium_id, p_limit, p_search, p_category_id, p_date_from, p_date_to, p_after_created_at, p_after_id | Paginated/filtered news |
| `admin_create_news` | p_data (JSONB) | Create news article |
| `admin_update_news` | p_id (INT), p_data (JSONB) | Update news article |
| `admin_delete_news` | p_id (INT) | Delete news article |
| `get_news_categories` | (none) | Get all news categories |
| `admin_create_news_category` | p_data (JSONB) | Create news category |
| `admin_update_news_category` | p_id (INT), p_data (JSONB) | Update news category |
| `admin_delete_news_category` | p_id (INT) | Delete news category |

**QR Codes (5)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `create_visitor_qr_code` | p_resident_id, p_condominium_id, p_unit_id (INT), p_purpose, p_visitor_name, p_visitor_phone (TEXT), p_expires_at (TIMESTAMP), p_notes (TEXT) | Create visitor QR invitation |
| `validate_qr_code` | p_qr_code (TEXT) | Validate QR at gate |
| `revoke_qr_code` | p_qr_code_id (UUID) | Revoke QR code |
| `get_active_qr_codes` | p_resident_id (INT) | Active QR codes per resident |
| `expire_qr_codes` | (none) | Expire outdated QR codes |

**Notifications (6)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `create_notification` | p_resident_id, p_condominium_id, p_unit_id (INT), p_title, p_body, p_type (TEXT), p_data (JSONB) | Create push notification |
| `get_notifications` | p_resident_id (INT) | All notifications |
| `get_resident_notifications` | p_resident_id, p_offset, p_limit (INT), p_unread_only (BOOL) | Paginated notifications |
| `get_unread_notification_count` | p_resident_id (INT) | Unread count |
| `mark_notification_read` | p_notification_id, p_resident_id (INT) | Mark one as read |
| `mark_all_notifications_read` | p_resident_id (INT) | Mark all as read |

**OTP / PIN Reset (3)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `request_pin_reset_otp` | p_phone (TEXT) | Send OTP via SMS |
| `check_otp_validity` | p_phone (TEXT) | Check if OTP is still valid |
| `reset_pin_with_otp` | p_phone, p_otp_code, p_new_pin (TEXT) | Reset PIN using OTP |

**Streets (3)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `create_street` | p_data (JSONB) | Create street |
| `get_streets` | p_condominium_id (INT) | Streets per condo |
| `delete_street` | p_id (INT) | Delete street |

**Audit (3)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `create_audit_log` | p_data (JSONB) | Create audit log entry |
| `log_audit` | p_condominium_id, p_actor_id (INT), p_action, p_target_table (TEXT), p_target_id (INT), p_details (JSONB) | Log audit with params |
| `admin_get_audit_logs` | p_condominium_id, p_actor_id (INT), p_action, p_target_table (TEXT), p_start_date, p_end_date (TIMESTAMP), p_offset, p_limit (INT) | Filtered audit query |

**Dashboard & App Tracking (3)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `admin_get_dashboard_stats` | (none) | Admin dashboard statistics |
| `update_resident_app_activity` | p_resident_id (INT) | Update resident last seen |
| `check_unit_has_app` | p_unit_id (INT) | Check if unit has app installed |

**Subscriptions & Pricing (9)**:
| Function | Parameters | Description |
|----------|-----------|-------------|
| `admin_get_app_pricing_rules` | (none) | Get all pricing tiers |
| `admin_create_app_pricing_rule` | p_data (JSONB) | Create pricing tier |
| `admin_update_app_pricing_rule` | p_id (INT), p_data (JSONB) | Update pricing tier |
| `admin_delete_app_pricing_rule` | p_id (INT) | Delete pricing tier |
| `admin_get_condominium_subscriptions` | p_year, p_month (INT) | Get subscriptions with arrears |
| `admin_update_subscription_status` | p_id (INT), p_condominium_id (INT), p_status (TEXT) | Update subscription status |
| `admin_update_subscription_details` | p_id (INT), p_data (JSONB) | Update subscription details |
| `admin_get_subscription_payments` | p_condominium_id, p_year, p_month (INT) | Get payment records |
| `admin_create_subscription_payment` | p_condominium_id (INT), p_amount, p_currency, p_payment_date, p_reference_period, p_status, p_notes (TEXT) | Create payment |
| `admin_send_subscription_alert` | p_condominium_id, p_staff_id (INT) | Send payment alert |

**Storage Buckets** (Supabase Storage):
```
visitor-photos     // Visitor photos taken during check-in
staff-photos       // Staff profile photos
logo_condominio    // Condominium logos
news-images        // News article images (5MB limit, public read)
```

All buckets are public for read access. Setup via `setup_storage_buckets.sql`.

---

## 8. Services Deep Dive

### DataService Methods (dataService.ts)

**Device Setup**:
```typescript
isDeviceConfigured(): Promise<boolean>
getDeviceCondoDetails(): Promise<Condominium | null>
configureDevice(condoId: number): Promise<boolean>
configureDeviceOffline(condoId: number, condoDetails: Condominium): Promise<boolean>
resetDevice(): Promise<void>
```

**Authentication**:
```typescript
login(firstName: string, lastName: string, pin: string): Promise<Staff | null>
```

**QR Code Validation** (Online Only):
```typescript
validateQrCode(qrCode: string): Promise<QrValidationResult | null>
```

**Configuration Data**:
```typescript
getVisitTypes(): Promise<VisitTypeConfig[]>
getServiceTypes(): Promise<ServiceTypeConfig[]>
getRestaurants(): Promise<Restaurant[]>
getSports(): Promise<Sport[]>
getNews(): Promise<CondominiumNews[]>
```

**Visits**:
```typescript
getTodaysVisits(): Promise<Visit[]>
createVisit(visitData: Partial<Visit>): Promise<Visit>
updateVisitStatus(visitId: number, status: VisitStatus): Promise<void>
checkOutVisit(visitId: number): Promise<void>
```

**Incidents**:
```typescript
getIncidents(): Promise<Incident[]>
createIncident(incidentData: Partial<Incident>): Promise<Incident>
updateIncidentStatus(incidentId: number, status: string): Promise<void>
```

**Units & Residents**:
```typescript
getUnits(): Promise<Unit[]>
getResidents(unitId: number): Promise<Resident[]>
```

**Synchronization**:
```typescript
syncPendingItems(): Promise<number>
checkOnline(): boolean
```
