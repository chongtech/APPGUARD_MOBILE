# EntryFlow - Architecture Assessment

**Assessment Date:** January 2026
**Assessed By:** Claude Code (code-architect agent)
**Application Version:** 0.0.0 (Alpha)
**Stack:** React 19 + TypeScript, Vite 6, Dexie.js, Supabase, Tailwind CSS, Google Gemini AI, Leaflet

---

## Executive Summary

EntryFlow is a well-architected offline-first Progressive Web App (PWA) designed for condominium security gate management. The application demonstrates mature architectural patterns including a robust service layer abstraction, multi-tier offline data synchronization, and thoughtful security considerations. The core architecture is sound and well-suited for the kiosk use case of security gate management with intermittent connectivity.

**Overall Assessment: SOLID FOUNDATION with room for modularization improvements**

---

## 1. Architectural Patterns Analysis

### 1.1 Service Layer Pattern (Facade)

**Location:** `services/dataService.ts:8-1949`

The `DataService` class acts as a facade that abstracts all data operations from components. Components never access Supabase or IndexedDB directly.

```typescript
class DataService {
  private isOnline: boolean = navigator.onLine;
  private backendHealthScore: number = 3;
  private currentCondoId: number | null = null;
  // ...
}
export const api = new DataService();
```

**Assessment:** Excellent pattern choice for offline-first apps. Single point of entry simplifies testing and maintenance.

### 1.2 Singleton Export Pattern

**Locations:**
- `services/dataService.ts:1948` - `export const api = new DataService()`
- `services/audioService.ts:263` - `export const audioService = new AudioService()`
- `services/db.ts:89` - `export const db = new CondoDatabase()`

**Assessment:** Appropriate for services that maintain state across the application lifecycle.

### 1.3 Cache-Then-Network Pattern

**Location:** `services/dataService.ts:647-698`

Configuration data uses cache-first with background refresh:

```typescript
async getVisitTypes(): Promise<VisitTypeConfig[]> {
  const local = await db.visitTypes.toArray();
  if (local.length > 0) {
    if (this.isBackendHealthy && this.currentCondoId) {
      this.refreshConfigs(this.currentCondoId); // Fire-and-forget
    }
    return local;
  }
  // Fetch from backend if cache empty...
}
```

**Assessment:** Perfect strategy for configuration data that changes infrequently but must be available offline.

### 1.4 Write-Through with Retry Pattern

**Location:** `services/dataService.ts:884-997`

User data writes save locally first, then attempt sync:

```typescript
if (this.isBackendHealthy) {
  try {
    const createdVisit = await SupabaseService.createVisit(visitPayload);
    createdVisit.sync_status = SyncStatus.SYNCED;
    await db.visits.put(createdVisit);
    return createdVisit;
  } catch (e) {
    this.backendHealthScore--;
    // Fallback to local save with PENDING_SYNC status
  }
}
```

**Assessment:** Robust pattern for user-generated data. Ensures no data loss during connectivity issues.

### 1.5 Health Score System

**Location:** `services/dataService.ts:10, 172-174`

Backend connectivity is tracked via a health score (0-3):

```typescript
private get isBackendHealthy(): boolean {
  return this.isOnline && this.backendHealthScore > 0;
}
```

**Assessment:** Elegant approach to handle flaky connections. Prevents repeated failed requests while allowing recovery.

### 1.6 Multi-Tier Storage Redundancy

**Location:** `services/dataService.ts:236-248`

Critical configuration is synced across three storage tiers:

```typescript
// SYNC: Update ALL storage layers
await db.settings.put({ key: 'device_condo_details', value: correctCondo }); // IndexedDB
localStorage.setItem('condo_guard_device_id', centralDeviceId);              // localStorage
localStorage.setItem('device_condo_backup', JSON.stringify(correctCondo));   // Backup
```

**Assessment:** Excellent redundancy for kiosk devices where data persistence is critical.

### 1.7 Route Guard Pattern

**Location:** `App.tsx:129-361`

Three nested guards protect routes:
- `ConfigGuard` - Ensures device is configured
- `ProtectedRoute` - Ensures user is authenticated
- `AdminRoute` - Ensures user has admin role

**Assessment:** Well-implemented authorization layer with clear separation of concerns.

---

## 2. Component Architecture

### 2.1 Directory Structure

```
src/
├── App.tsx                    # Root: Router + AuthContext + Guards (462 lines)
├── types.ts                   # All TypeScript interfaces/enums (239 lines)
├── components/                # Reusable UI components (9 components)
├── pages/                     # Page components (7 + 14 admin pages)
├── services/                  # Business logic layer (9 services)
├── config/                    # Environment configuration
├── utils/                     # Utility functions
└── docs/                      # Documentation
```

**Assessment:** Clear separation between UI components, pages, and services. Could benefit from feature-based organization for admin module.

### 2.2 Component Interaction Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        COMPONENT LAYER                          │
│  (Dashboard, NewEntry, DailyList, Incidents, Admin pages)      │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DataService (Facade)                       │
│  • Health Score Management    • Data Transformation             │
│  • Online/Offline Detection   • Sync Status Management          │
└─────────────────────────────────────────────────────────────────┘
                    │                           │
         ┌──────────┘                           └──────────┐
         ▼                                                 ▼
┌────────────────────┐                      ┌────────────────────┐
│   IndexedDB        │◄────Background───────│   Supabase         │
│   (Dexie.js)       │       Sync           │   (PostgreSQL)     │
└────────────────────┘                      └────────────────────┘
```

### 2.3 Page Complexity Analysis

| Component | Lines | Complexity | Notes |
|-----------|-------|------------|-------|
| `NewEntry.tsx` | 921 | HIGH | Multi-step wizard - candidate for splitting |
| `Dashboard.tsx` | ~400 | MEDIUM | AI assistant modal could be extracted |
| `DailyList.tsx` | ~350 | MEDIUM | Good separation of concerns |
| `Login.tsx` | ~300 | LOW | Well-structured |
| `Incidents.tsx` | ~400 | MEDIUM | Audio integration adds complexity |

---

## 3. Data Flow Architecture

### 3.1 Sync Status State Machine

```
                   ┌─────────────┐
                   │   CREATE    │
                   │   (Local)   │
                   └──────┬──────┘
                          │
                          ▼
                   ┌─────────────┐
        ┌──────────│PENDING_SYNC │──────────┐
        │          └─────────────┘          │
        │                                   │
   (Backend         (Offline or             │
    Healthy)         Backend Down)          │
        │                                   │
        ▼                                   │
┌─────────────────┐                         │
│     SYNCED      │◄────────────────────────┘
│                 │     (Background Sync
└─────────────────┘      on reconnect)
```

### 3.2 Data Synchronization Strategies

| Data Type | Strategy | Direction | Rationale |
|-----------|----------|-----------|-----------|
| Configuration | Cache-Then-Network | Server → Client | Changes rarely, must work offline |
| User Data | Write-Through + Retry | Bidirectional | No data loss, eventual consistency |
| Staff Credentials | Sync on Login | Server → Client | Security + offline auth |
| Device Heartbeat | Periodic Push | Client → Server | Monitoring and audit |
| Today's Visits | Poll + Replace | Server → Client | Real-time display needs |

---

## 4. Security Architecture Assessment

### 4.1 Authentication

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| PIN Storage | bcrypt hashes (12 rounds) | SECURE |
| Online Auth | RPC `verify_staff_login()` | SECURE |
| Offline Auth | Local bcrypt comparison | SECURE |
| Session | localStorage + Context | ACCEPTABLE |

### 4.2 Device Security

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| Fingerprinting | UUID v4 in localStorage | GOOD |
| Condo Binding | Staff.condo_id === Device.condo_id | SECURE |
| Heartbeat | Every 5 minutes | GOOD for monitoring |

### 4.3 Data Protection

| Aspect | Implementation | Assessment |
|--------|----------------|------------|
| IndexedDB Encryption | NOT IMPLEMENTED | NEEDS IMPROVEMENT |
| Sensitive Field Encryption | NOT IMPLEMENTED | NEEDS IMPROVEMENT |
| Photo Storage | Supabase Storage | ACCEPTABLE |

---

## 5. PWA Architecture Assessment

### 5.1 Service Worker Strategy

| Feature | Implementation | Assessment |
|---------|----------------|------------|
| Registration | Prompt-based | GOOD UX |
| Skip Waiting | false | PREVENTS data loss |
| API Caching | NetworkFirst, 5min TTL | APPROPRIATE |
| Image Caching | CacheFirst, 7 days | OPTIMAL |

### 5.2 PWA Lifecycle Tracking

**Location:** `services/pwaLifecycleService.ts`

Tracked events:
- Installation detection (standalone mode)
- App launch counting
- Visibility changes
- Service worker unregistration
- Inactivity-based decommission (30+ days)

**Assessment:** Comprehensive tracking for kiosk management.

---

## 6. Strengths

### 6.1 Architectural Strengths

1. **Robust Offline-First Architecture**
   - Multi-tier storage redundancy
   - Graceful degradation with health score
   - Background sync with pending status tracking

2. **Clean Service Layer Abstraction**
   - Single point of entry for all data operations
   - Clear separation between offline logic and network calls

3. **Type Safety**
   - Comprehensive TypeScript interfaces
   - Enum-driven business logic reduces errors

4. **Security Considerations**
   - bcrypt hashing for PINs
   - Condominium-device binding
   - Device fingerprinting for audit trails

5. **PWA Excellence**
   - Installation tracking
   - Persistent storage requests
   - Camera access via HTTPS
   - Audio alerts with fallbacks

6. **Developer Experience**
   - Path aliases (`@/`) for clean imports
   - Detailed CLAUDE.md documentation
   - Consistent code patterns

---

## 7. Weaknesses & Technical Debt

### 7.1 Code Organization Issues

| Issue | Location | Impact | Priority |
|-------|----------|--------|----------|
| Large monolithic file | `dataService.ts` (1,949 lines) | Hard to maintain | HIGH |
| Large monolithic file | `Supabase.ts` (2,147 lines) | Hard to navigate | HIGH |
| Large component | `NewEntry.tsx` (921 lines) | Hard to test | MEDIUM |
| Mixed concerns | Admin + Guard ops in DataService | Confusing | MEDIUM |

### 7.2 Testing & Quality

| Issue | Current State | Impact | Priority |
|-------|---------------|--------|----------|
| No unit tests | Missing | Risk of regressions | HIGH |
| No integration tests | Missing | Risk of flow breaks | HIGH |
| No E2E tests | Missing | Risk of UX issues | MEDIUM |
| Console.log usage | ~50+ calls | Performance in prod | MEDIUM |

### 7.3 Type Safety Gaps

| Issue | Example | Impact | Priority |
|-------|---------|--------|----------|
| ID type inconsistency | `adminUpdateUnit(id: string)` vs `Unit.id: number` | Runtime errors | HIGH |
| `any` types | `metadata?: any` | Type safety loss | MEDIUM |

### 7.4 Error Handling

| Issue | Current State | Impact | Priority |
|-------|---------------|--------|----------|
| Silent failures | `backendHealthScore--` only | Users unaware | MEDIUM |
| No error monitoring | Missing Sentry/similar | Blind to prod issues | HIGH |

---

## 8. Recommendations

### 8.1 Immediate (Sprint 1-2)

#### 8.1.1 Split DataService into Domain Services

```
services/
├── core/
│   ├── offlineManager.ts    # Health score, online detection
│   ├── syncService.ts       # Background sync logic
│   └── storageService.ts    # Multi-tier storage helpers
├── domain/
│   ├── visitService.ts      # Visit CRUD
│   ├── incidentService.ts   # Incident CRUD
│   ├── configService.ts     # Visit types, service types
│   └── deviceService.ts     # Device registration
└── admin/
    └── adminService.ts      # All admin operations
```

#### 8.1.2 Add Logging Service

```typescript
// services/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel = import.meta.env.DEV ? 'debug' : 'warn';

  debug(msg: string, data?: unknown) { /* ... */ }
  info(msg: string, data?: unknown) { /* ... */ }
  warn(msg: string, data?: unknown) { /* ... */ }
  error(msg: string, error?: Error) { /* ... */ }
}

export const logger = new Logger();
```

#### 8.1.3 Fix Type Inconsistencies

- Audit all ID parameters: standardize on `number` for entity IDs
- Replace `any` types with proper interfaces
- Add strict TypeScript checks

### 8.2 Short-Term (Sprint 3-4)

#### 8.2.1 Add Testing Infrastructure

```
tests/
├── unit/
│   ├── services/
│   │   ├── visitService.test.ts
│   │   └── authUtils.test.ts
│   └── utils/
│       └── csvExport.test.ts
└── integration/
    ├── visitFlow.test.tsx
    └── loginFlow.test.tsx
```

#### 8.2.2 Implement Error Monitoring

- Integrate Sentry for production error tracking
- Add error boundaries with user-facing messages
- Create error toast notifications for failed operations

#### 8.2.3 Refactor NewEntry Component

Extract into smaller components:
- `VisitTypeSelector.tsx`
- `VisitorInfoForm.tsx`
- `UnitSelector.tsx`
- `ApprovalStep.tsx`

### 8.3 Medium-Term (Next Quarter)

#### 8.3.1 Form State Management

- Implement `react-hook-form` for complex forms
- Or use `useReducer` with typed actions for state machines

#### 8.3.2 Background Sync API

- Implement Web Background Sync API for reliable offline sync
- Currently sync only happens when app is open

#### 8.3.3 IndexedDB Encryption

- Encrypt sensitive fields before storage
- Consider `crypto-js` or Web Crypto API

### 8.4 Long-Term (Future Releases)

1. **Extract Shared Types Package** - For resident app sharing
2. **State Machine for Complex Flows** - XState for visit registration
3. **API Versioning** - RPC version parameters for migrations
4. **E2E Encryption** - For visitor personal data

---

## 9. Key Metrics

### 9.1 Codebase Statistics

| Metric | Value |
|--------|-------|
| Total TypeScript Files | ~35 |
| Total Lines of Code | ~15,000 |
| Service Layer Lines | ~4,500 |
| Component Lines | ~5,000 |
| Type Definitions | 239 lines |
| Admin Pages | 14 |
| Guard Pages | 7 |

### 9.2 Architecture Health Scores

| Category | Score | Notes |
|----------|-------|-------|
| Offline Support | 9/10 | Excellent multi-tier strategy |
| Type Safety | 7/10 | Good coverage, some gaps |
| Security | 7/10 | bcrypt + binding, needs encryption |
| Testability | 4/10 | No tests, good service abstraction |
| Maintainability | 6/10 | Large files need splitting |
| Documentation | 8/10 | CLAUDE.md is comprehensive |
| PWA Features | 9/10 | Full PWA implementation |

**Overall Architecture Score: 7.1/10**

---

## 10. Conclusion

EntryFlow has a solid architectural foundation built on proven patterns for offline-first PWAs. The service layer abstraction and multi-tier storage strategy are particularly well-implemented.

The main areas requiring attention are:
1. **Code organization** - Large files need modularization
2. **Testing infrastructure** - Critical gap for production readiness
3. **Error visibility** - Users need to know when things fail
4. **Data encryption** - IndexedDB contains sensitive data

The architecture successfully achieves its primary goal: reliable security gate management with intermittent connectivity. With the recommended improvements, it will be well-positioned for long-term maintenance and feature expansion.

---

## Appendix: Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `App.tsx` | 462 | Root component, routing, auth context |
| `types.ts` | 239 | TypeScript interfaces and enums |
| `services/dataService.ts` | 1,949 | Primary data facade |
| `services/Supabase.ts` | 2,147 | Backend communication |
| `services/db.ts` | 89 | IndexedDB schema |
| `services/deviceUtils.ts` | 60 | Device fingerprinting |
| `services/audioService.ts` | 264 | Audio alerts |
| `services/pwaLifecycleService.ts` | 232 | PWA tracking |
| `pages/NewEntry.tsx` | 921 | Visit registration |
| `components/Toast.tsx` | 158 | Notifications |

---

*This assessment was generated by the code-architect agent analyzing the EntryFlow codebase.*
