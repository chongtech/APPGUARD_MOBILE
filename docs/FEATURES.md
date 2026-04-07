# Key Features

## Audio Alert System (audioService.ts)

The app includes an audio alert system for incident notifications:

```typescript
// Initialize audio (requests permission)
AudioService.initialize()

// Play alert sound (4 cycles of BIP-bip-BIP, ~6 seconds)
AudioService.playAlertSound()

// Test sound manually
AudioService.testSound()
```

**Features**:
- AudioContext singleton with HTML5 Audio fallback
- Data URI beep tone (no external files needed)
- **4 cycles of BIP-bip-BIP** pattern (~6 seconds total)
- **Volume: 60%** for audibility
- Device vibration integration (200ms, pause, 200ms pattern)
- Permission storage in localStorage (`audio_permission_enabled` key)
- Auto-initialization on login if previously granted

**"Testar Som" Button States**:
- Orange (pulsing): Sound not yet activated - guard must click once
- Green: Sound activated - alerts will play automatically

**Console Log Prefixes** (for debugging):
- `[AudioService]` - Audio system logs
- `[Incidents]` - Realtime subscription and incident detection logs

## Incident Realtime Alerts (Incidents.tsx)

Real-time incident detection via Supabase Realtime:

**How it works**:
1. Subscribes to `incidents` table INSERT events via WebSocket
2. Client-side filtering by `resident.condominium_id` (matches guard's condo)
3. On new incident from same condominium:
   - Plays alert sound (4 cycles)
   - Vibrates device (if mobile)
   - Shows red banner (auto-dismisses after 10 seconds)
   - Refreshes incident list

**Realtime Subscription Logs**:
```
[Incidents] Setting up realtime subscription for condo: X
[Incidents] Subscription status: SUBSCRIBED
[Incidents] New incident received via realtime
[Incidents] Incident belongs to this condominium - triggering alert
```

**Troubleshooting**:
- If `CHANNEL_ERROR` appears: Realtime not enabled in Supabase Dashboard → Database → Replication
- If sound doesn't play: Guard must click "Testar Som" button once (browser autoplay policy)

## PWA Lifecycle Tracking (pwaLifecycleService.ts)

Tracks PWA installation and usage:
- Installation detection (standalone mode + iOS)
- Installation event listeners
- Uninstallation detection heuristics
- Service Worker monitoring
- Visibility tracking
- Inactivity decommissioning checks

## Deployment Configuration (config/deployment.ts)

Environment-aware configuration for different deployment targets:

```typescript
import { config } from '@/config/deployment';

config.appUrl          // Base URL for the app
config.supabaseUrl     // Supabase project URL
config.supabaseAnonKey // Supabase anonymous key
config.geminiApiKey    // Google Gemini API key
```

**Features**:
- Automatic environment detection (development/staging/production)
- Centralized configuration management
- Type-safe configuration access

## Approval Modes Configuration (utils/approvalModes.ts)

Centralized UI configuration for all visit approval modes:

```typescript
import { APPROVAL_MODE_CONFIGS, getApprovalModeConfig } from '@/utils/approvalModes';

const config = getApprovalModeConfig(ApprovalMode.APP);
// { label: 'App', icon: '📱', color: 'blue', requiresOnline: true, ... }
```

**Features**:
- Maps ApprovalMode enum to UI properties (label, icon, color)
- Tracks which modes require online connectivity
- Used by ApprovalModeSelector component

## Sentry Error Tracking (config/sentry.ts + services/logger.ts)

**Sentry** is integrated for error tracking, performance monitoring, and session replay:

```typescript
import { logger } from '@/services/logger';

logger.setContext({ service: 'DataService', userId: 1, condominiumId: 5 });
logger.debug('Loading data', { table: 'visits' });
logger.info('Visit created', { visitId: 42 });
logger.warn('Backend slow', { latency: 5000 });
logger.error('Sync failed', error, ErrorCategory.SYNC);

// Specialized tracking
logger.trackSync('visits', 'start', { total: 10 });
logger.trackOfflineOperation('createVisit', 'queued');
logger.trackAction('login_attempt');
logger.trackHealthScore(2);
```

**Features**:
- Browser tracing (100% sample rate)
- Session replay (10% normal, 100% on error) with PII masking
- PII scrubbing for sensitive data (PIN, tokens, passwords)
- Network status tracking (offline duration measurement)
- Service Worker error tracking
- Error categories: AUTH, SYNC, DEVICE, NETWORK, CAMERA, STORAGE, PWA, ADMIN

## Theme System (context/ThemeContext.tsx)

Two themes managed via CSS custom properties:

```typescript
import { useTheme } from '@/context/ThemeContext';

const { theme, setTheme } = useTheme();
setTheme(Theme.MIDNIGHT); // Switch to dark theme
```

**Themes**:
- **ELITE** (default): Light theme - slate/sky blue palette
- **MIDNIGHT**: Dark theme - deep navy/blue with premium blue accent

**CSS Variables**: `--color-primary`, `--color-secondary`, `--color-accent`, `--color-success`, `--color-warning`, `--color-danger`, `--color-bg-root`, `--color-bg-surface`, `--color-text-main`, `--color-text-dim`, `--color-border-main`

Theme persisted in `localStorage` (`app_theme` key). Adds `dark` class to body for MIDNIGHT theme.

## CSV Export Utilities (utils/csvExport.ts)

Data export functionality for admin reports:

```typescript
import { exportToCSV, downloadCSV } from '@/utils/csvExport';

const csv = exportToCSV(visits, ['visitor_name', 'check_in_at', 'status']);
downloadCSV(csv, 'visits-report.csv');
```

**Features**:
- Generic CSV conversion with column selection
- Proper escaping for special characters
- Browser download trigger
- Supports visits, incidents, and other data exports

## Resident App Status Filter (AdminResidents.tsx)

Filter and select residents by app installation status for future bulk SMS/email invitations:

```typescript
type AppStatusFilter = 'ALL' | 'WITH_APP' | 'WITHOUT_APP';

const filteredResidents = useMemo(() => {
  if (filterAppStatus === 'ALL') return residents;
  return residents.filter(r =>
    filterAppStatus === 'WITH_APP' ? r.has_app_installed === true : r.has_app_installed !== true
  );
}, [residents, filterAppStatus]);
```

**Features**:
- 3-column filter layout (search, condominium, app status)
- Client-side filtering on `has_app_installed` field
- Bulk selection with "Select All" when filtering "Sem App"
- Disabled "Enviar Convite" button (future SMS/email integration)
- Selection state cleared on filter/data changes

**Future Work**:
- SMS/email invitation sending to selected residents without app
- Backend integration for bulk messaging

## Resident App Integration

The Guard App integrates with the external Resident App for visit approval via push notifications.

**How it works**:
1. Guard registers visit and selects "Aplicativo" approval mode
2. System checks if unit has residents with `has_app_installed = true`
3. Push notification sent to resident's device
4. Resident approves/denies in their app
5. Visit status updated in real-time

**Available RPCs for Resident App**:
| Function | Purpose |
|----------|---------|
| `register_resident_app_login(p_resident_id, p_device_token, p_platform)` | First login - marks `has_app_installed = true` |
| `update_resident_app_activity(p_resident_id)` | Heartbeat - updates `app_last_seen_at` |
| `check_unit_has_app(p_unit_id)` | Check if any resident in unit has app |

**Push Notification Payload** (sent to Resident App):
```typescript
interface VisitApprovalNotification {
  type: 'VISIT_APPROVAL_REQUEST';
  visit_id: number;
  visitor_name: string;
  visitor_photo_url?: string;
  visit_type: string;
  guard_name: string;
}
```

**App Adoption Statistics**:
```sql
SELECT * FROM v_app_adoption_stats;
-- Returns: condominium_name, total_residents, residents_with_app, adoption_percent
```

**Auto-selection Logic** (approvalModes.ts):
- If `has_app_installed = true` → "Aplicativo" mode available
- If no app → Falls back to "Telefone" or "Interfone"
