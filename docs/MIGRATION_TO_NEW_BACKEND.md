# Backend & Storage Abstraction Layer Plan

## Executive Summary

Create abstraction interfaces to enable future migration from Supabase to PostgreSQL/S3 while preserving the offline-first architecture. **No behavior change initially** - Supabase remains the default backend.

---

## Architecture Overview

### Current State (Tightly Coupled)
```
Component → DataService → SupabaseService (direct calls)
                       → Supabase Storage (hardcoded)
```

### Target State (Abstracted)
```
Component → DataService → BackendProvider → IRemoteBackend  → SupabaseBackend | PostgresBackend
                                          → IStorageBackend → SupabaseStorage | S3Storage
                                          → IAuthProvider   → SupabaseAuth    | JWTAuth
```

### Key Design Decisions

1. **Service Locator Pattern** - BackendProvider singleton with lazy initialization (no component changes needed)
2. **Grouped Interfaces** - 50+ methods organized into logical sub-interfaces (Condominium, Staff, Visit, etc.)
3. **Preserve Offline-First** - DataService remains the orchestrator; only remote backend is swapped
4. **Delegation Pattern** - Supabase adapters wrap existing SupabaseService (no rewrite)

---

## File Structure

```
src/services/backends/
├── index.ts                         # Main re-exports
├── BackendProvider.ts               # Factory/registry singleton
├── interfaces/
│   ├── index.ts                     # Interface re-exports
│   ├── IRemoteBackend.ts            # All data operation interfaces
│   ├── IStorageBackend.ts           # File upload/download interface
│   └── IAuthProvider.ts             # Authentication interface
├── supabase/
│   ├── index.ts                     # Supabase adapter re-exports
│   ├── SupabaseBackend.ts           # Delegates to existing SupabaseService
│   ├── SupabaseStorage.ts           # Wraps storage methods
│   └── SupabaseAuth.ts              # Wraps auth methods
├── postgres/
│   ├── index.ts
│   └── PostgresBackend.ts           # Stub with TODOs
└── s3/
    ├── index.ts
    └── S3Storage.ts                 # Stub with TODOs
```

---

## Implementation Steps

### Phase 1: Create Interfaces (~200 lines)

**File: `services/backends/interfaces/IRemoteBackend.ts`**

Group 50+ methods into logical sub-interfaces:
- `ICondominiumOperations` - 8 methods (CRUD, stats, streets)
- `IStaffOperations` - 7 methods (sync, admin CRUD, PIN management)
- `IUnitOperations` - 4 methods
- `IResidentOperations` - 4 methods
- `IVisitOperations` - 10 methods (CRUD, events, status updates)
- `IIncidentOperations` - 8 methods
- `IConfigOperations` - 12 methods (visit types, service types, restaurants, sports)
- `IDeviceOperations` - 6 methods (register, heartbeat, decommission)
- `IAuditOperations` - 3 methods
- `INotificationOperations` - 3 methods
- `IDashboardOperations` - 1 method

Composite: `IRemoteBackend extends all sub-interfaces`

**File: `services/backends/interfaces/IStorageBackend.ts`**
```typescript
interface IStorageBackend {
  uploadFile(options: UploadOptions): Promise<UploadResult>;
  getPublicUrl(bucket: StorageBucket, path: string): string;
  deleteFile(bucket: StorageBucket, pathOrUrl: string): Promise<boolean>;
  dataUrlToBlob(dataUrl: string): Blob;
}
```

**File: `services/backends/interfaces/IAuthProvider.ts`**
```typescript
interface IAuthProvider {
  verifyStaffLogin(firstName: string, lastName: string, pin: string): Promise<AuthResult>;
}
```

### Phase 2: Create Supabase Adapters (~400 lines)

**File: `services/backends/supabase/SupabaseBackend.ts`**
- Implements `IRemoteBackend`
- Delegates all methods to existing `SupabaseService`
- Example:
```typescript
async getCondominium(id: number) {
  return SupabaseService.getCondominium(id);
}
```

**File: `services/backends/supabase/SupabaseStorage.ts`**
- Implements `IStorageBackend`
- Wraps `uploadVisitorPhoto`, `uploadStaffPhoto`, `uploadCondoLogo`
- Normalizes return format to `UploadResult`

**File: `services/backends/supabase/SupabaseAuth.ts`**
- Implements `IAuthProvider`
- Wraps `SupabaseService.verifyStaffLogin`

### Phase 3: Create BackendProvider (~80 lines)

**File: `services/backends/BackendProvider.ts`**
```typescript
class BackendProviderClass {
  private _backend: IRemoteBackend | null = null;
  private _storage: IStorageBackend | null = null;
  private _auth: IAuthProvider | null = null;

  get backend(): IRemoteBackend { /* lazy init based on VITE_BACKEND_TYPE */ }
  get storage(): IStorageBackend { /* lazy init based on VITE_STORAGE_TYPE */ }
  get auth(): IAuthProvider { /* lazy init based on VITE_BACKEND_TYPE */ }

  // For testing
  setBackend(backend: IRemoteBackend): void;
  setStorage(storage: IStorageBackend): void;
  reset(): void;
}

export const BackendProvider = new BackendProviderClass();
```

### Phase 4: Create Stub Implementations (~200 lines)

**File: `services/backends/postgres/PostgresBackend.ts`**
- Stub implementing `IRemoteBackend`
- All methods throw `Error('Not implemented')`
- TODO comments explaining migration path (REST API, PostgREST, etc.)

**File: `services/backends/s3/S3Storage.ts`**
- Stub implementing `IStorageBackend`
- TODO comments for AWS SDK integration, presigned URLs, etc.

### Phase 5: Update DataService (~100 changes)

**File: `services/dataService.ts`**

Replace all `SupabaseService.X` calls with `BackendProvider.backend.X`:

```typescript
// Before
const device = await SupabaseService.getDeviceByIdentifier(deviceIdentifier);

// After
const device = await BackendProvider.backend.getDeviceByIdentifier(deviceIdentifier);
```

Replace storage calls:
```typescript
// Before
const photoUrl = await SupabaseService.uploadVisitorPhoto(photoDataUrl, condoId, name);

// After
const result = await BackendProvider.storage.uploadFile({
  bucket: StorageBucket.VISITOR_PHOTOS,
  data: photoDataUrl,
  folder: String(condoId),
  fileName: name
});
const photoUrl = result.success ? result.publicUrl : null;
```

Replace auth calls:
```typescript
// Before
const staff = await SupabaseService.verifyStaffLogin(firstName, lastName, pin);

// After
const result = await BackendProvider.auth.verifyStaffLogin(firstName, lastName, pin);
const staff = result.success ? result.staff : null;
```

### Phase 6: Cleanup

**File: `pages/admin/AdminStaff.tsx`**
- Remove direct `SupabaseService` import
- Use `api.uploadStaffPhoto()` instead (add method to DataService if missing)

**File: `.env.local`**
- Add optional variables:
```env
VITE_BACKEND_TYPE=supabase   # or 'postgres'
VITE_STORAGE_TYPE=supabase   # or 's3'
```

---

## Critical Files to Modify

| File | Purpose |
|------|---------|
| `services/dataService.ts` | Replace 80+ SupabaseService calls with BackendProvider |
| `services/Supabase.ts` | Reference for interface definitions (keep for adapters) |
| `types.ts` | Import types for interfaces |
| `pages/admin/AdminStaff.tsx` | Remove direct SupabaseService import |

---

## Environment Configuration

```env
# .env.local (optional - defaults to supabase)
VITE_BACKEND_TYPE=supabase    # 'supabase' | 'postgres'
VITE_STORAGE_TYPE=supabase    # 'supabase' | 's3'

# Future PostgreSQL config
VITE_POSTGRES_API_URL=https://api.example.com
VITE_POSTGRES_API_KEY=xxx

# Future S3 config
VITE_S3_BUCKET=elite-accesscontrol
VITE_S3_REGION=us-east-1
VITE_S3_ACCESS_KEY=xxx
VITE_S3_SECRET_KEY=xxx
```

---

## Testing Strategy

### New Test Files to Create

```
src/services/backends/
├── __tests__/
│   ├── BackendProvider.test.ts      # Provider switching & injection
│   ├── SupabaseBackend.test.ts      # Delegation verification
│   ├── SupabaseStorage.test.ts      # Storage operations
│   ├── SupabaseAuth.test.ts         # Auth flow
│   └── mocks/
│       ├── MockBackend.ts           # Full IRemoteBackend mock
│       ├── MockStorage.ts           # Full IStorageBackend mock
│       └── MockAuth.ts              # Full IAuthProvider mock
```

### Phase 7: Unit Tests (~500 lines)

**7.1 BackendProvider Tests** (`BackendProvider.test.ts`)
```typescript
describe('BackendProvider', () => {
  beforeEach(() => BackendProvider.reset());

  it('returns SupabaseBackend by default', () => {
    expect(BackendProvider.backend).toBeInstanceOf(SupabaseBackend);
  });

  it('allows injecting mock backend for testing', () => {
    const mockBackend = new MockBackend();
    BackendProvider.setBackend(mockBackend);
    expect(BackendProvider.backend).toBe(mockBackend);
  });

  it('throws for unimplemented postgres backend', () => {
    // With VITE_BACKEND_TYPE=postgres
    expect(() => BackendProvider.backend).toThrow('Not implemented');
  });

  it('lazily initializes backends only once', () => {
    const backend1 = BackendProvider.backend;
    const backend2 = BackendProvider.backend;
    expect(backend1).toBe(backend2);
  });
});
```

**7.2 SupabaseBackend Delegation Tests** (`SupabaseBackend.test.ts`)
```typescript
// Verify all 50+ methods delegate correctly to SupabaseService
describe('SupabaseBackend', () => {
  const backend = new SupabaseBackend();

  it('delegates getCondominium to SupabaseService', async () => {
    const spy = vi.spyOn(SupabaseService, 'getCondominium').mockResolvedValue(mockCondo);
    const result = await backend.getCondominium(1);
    expect(spy).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockCondo);
  });

  it('delegates createVisit to SupabaseService', async () => {
    const spy = vi.spyOn(SupabaseService, 'createVisit').mockResolvedValue(mockVisit);
    const result = await backend.createVisit(visitData);
    expect(spy).toHaveBeenCalledWith(visitData);
    expect(result).toEqual(mockVisit);
  });

  // ... test all 50+ methods
});
```

**7.3 SupabaseStorage Tests** (`SupabaseStorage.test.ts`)
```typescript
describe('SupabaseStorage', () => {
  const storage = new SupabaseStorage();

  it('uploads visitor photo and returns UploadResult', async () => {
    const spy = vi.spyOn(SupabaseService, 'uploadVisitorPhoto').mockResolvedValue('https://url');

    const result = await storage.uploadFile({
      bucket: StorageBucket.VISITOR_PHOTOS,
      data: 'data:image/jpeg;base64,abc123',
      folder: '1',
      fileName: 'visitor'
    });

    expect(result.success).toBe(true);
    expect(result.publicUrl).toBe('https://url');
  });

  it('returns error result on upload failure', async () => {
    vi.spyOn(SupabaseService, 'uploadVisitorPhoto').mockResolvedValue(null);

    const result = await storage.uploadFile({
      bucket: StorageBucket.VISITOR_PHOTOS,
      data: 'data:image/jpeg;base64,abc123',
      folder: '1'
    });

    expect(result.success).toBe(false);
  });

  it('converts base64 dataUrl to Blob correctly', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ';
    const blob = storage.dataUrlToBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
  });
});
```

**7.4 Mock Implementations** (`mocks/MockBackend.ts`)
```typescript
export class MockBackend implements IRemoteBackend {
  // Track all calls for verification
  calls: { method: string; args: any[] }[] = [];

  // Configurable return values
  returnValues: Map<string, any> = new Map();

  setReturnValue(method: string, value: any) {
    this.returnValues.set(method, value);
  }

  async getCondominium(id: number) {
    this.calls.push({ method: 'getCondominium', args: [id] });
    return this.returnValues.get('getCondominium') ?? null;
  }

  // ... implement all interface methods with tracking
}
```

### Phase 8: Integration Tests (~300 lines)

**8.1 DataService Integration** (`dataService.integration.test.ts`)
```typescript
describe('DataService with MockBackend', () => {
  let mockBackend: MockBackend;
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockBackend = new MockBackend();
    mockStorage = new MockStorage();
    BackendProvider.setBackend(mockBackend);
    BackendProvider.setStorage(mockStorage);
  });

  afterEach(() => BackendProvider.reset());

  it('createVisit uploads photo then creates visit', async () => {
    mockStorage.setReturnValue('uploadFile', { success: true, publicUrl: 'https://photo.url' });
    mockBackend.setReturnValue('createVisit', { id: 1, visitor_name: 'Test' });

    const result = await api.createVisit({
      visitor_name: 'Test',
      photo_data_url: 'data:image/jpeg;base64,abc'
    });

    // Verify storage called first
    expect(mockStorage.calls[0].method).toBe('uploadFile');
    // Verify backend called with photo_url
    expect(mockBackend.calls[0].args[0].photo_url).toBe('https://photo.url');
  });

  it('falls back to offline when backend unhealthy', async () => {
    mockBackend.setReturnValue('createVisit', Promise.reject(new Error('Network')));

    const result = await api.createVisit({ visitor_name: 'Test' });

    // Should save to IndexedDB with PENDING_SYNC
    const localVisit = await db.visits.get(result.id);
    expect(localVisit.sync_status).toBe(SyncStatus.PENDING_SYNC);
  });
});
```

**8.2 Offline Sync Integration** (`sync.integration.test.ts`)
```typescript
describe('Offline Sync with Backend Abstraction', () => {
  it('syncs pending visits through BackendProvider', async () => {
    // Setup: Create offline visit
    await db.visits.add({
      id: -1,
      visitor_name: 'Offline Test',
      sync_status: SyncStatus.PENDING_SYNC
    });

    const mockBackend = new MockBackend();
    mockBackend.setReturnValue('createVisit', { id: 100, visitor_name: 'Offline Test' });
    BackendProvider.setBackend(mockBackend);

    // Act
    const synced = await api.syncPendingItems();

    // Assert
    expect(synced).toBe(1);
    expect(mockBackend.calls).toContainEqual({
      method: 'createVisit',
      args: [expect.objectContaining({ visitor_name: 'Offline Test' })]
    });
  });
});
```

### Phase 9: E2E Verification (~Manual)

**Pre-deployment Checklist**:

| Test Case | Steps | Expected |
|-----------|-------|----------|
| **Build** | `npm run build` | No errors |
| **Type Check** | `npx tsc --noEmit` | No TypeScript errors |
| **Unit Tests** | `npm test` | All pass |
| **Login Flow** | Login as guard | Authenticates via BackendProvider.auth |
| **Create Visit** | New entry with photo | Photo uploads via BackendProvider.storage |
| **Offline Mode** | Disable network, create visit | Saves locally with PENDING_SYNC |
| **Sync** | Re-enable network, trigger sync | Visit syncs via BackendProvider.backend |
| **Admin Pages** | Browse all admin pages | Data loads correctly |
| **Photo Display** | View visit with photo | Photo URL resolves |

### Test Configuration

**vitest.config.ts** (if not exists):
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/services/backends/**'],
      exclude: ['**/*.test.ts', '**/mocks/**']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
```

**Test Setup** (`src/test/setup.ts`):
```typescript
import { beforeEach, vi } from 'vitest';
import { BackendProvider } from '@/services/backends';

// Reset BackendProvider before each test
beforeEach(() => {
  BackendProvider.reset();
});

// Mock IndexedDB for tests
vi.mock('@/services/db', () => ({
  db: {
    visits: { add: vi.fn(), get: vi.fn(), put: vi.fn(), toArray: vi.fn() },
    // ... other tables
  }
}));
```

---

## Estimated Effort

| Phase | Files | Lines | Complexity |
|-------|-------|-------|------------|
| Interfaces | 4 | ~275 | Low |
| Supabase Adapters | 4 | ~410 | Medium |
| BackendProvider | 1 | ~80 | Low |
| Stubs | 2 | ~200 | Low |
| DataService Update | 1 | ~100 changes | Medium |
| Cleanup | 2 | ~10 | Low |
| **Unit Tests** | 4 | ~500 | Medium |
| **Mock Implementations** | 3 | ~200 | Low |
| **Integration Tests** | 2 | ~300 | Medium |
| **Test Config** | 2 | ~50 | Low |
| **Total** | **25 files** | **~2100 lines** | **Medium** |

---

## Benefits

1. **Smooth Migration Path** - Can switch backends via env variable
2. **Testability** - Can inject mock backends for testing
3. **Separation of Concerns** - Backend logic isolated from business logic
4. **No Breaking Changes** - Existing behavior preserved
5. **Future-Proof** - Ready for PostgreSQL/S3 when needed

---

## Future Migration Guide

### When Ready to Migrate to PostgreSQL

1. **Set up REST API** (PostgREST or custom Express/Fastify):
   - Create endpoints that mirror Supabase RPC functions
   - Implement authentication middleware (JWT)

2. **Implement PostgresBackend**:
   - Map each interface method to REST API calls
   - Handle error responses appropriately

3. **Configure environment**:
   ```env
   VITE_BACKEND_TYPE=postgres
   VITE_POSTGRES_API_URL=https://api.example.com
   ```

### When Ready to Migrate to S3

1. **Set up S3 bucket**:
   - Create bucket with appropriate permissions
   - Configure CORS for browser uploads
   - Set up CloudFront for public URLs (optional)

2. **Implement S3Storage**:
   - Use AWS SDK or presigned URLs
   - Map bucket names to S3 paths

3. **Configure environment**:
   ```env
   VITE_STORAGE_TYPE=s3
   VITE_S3_BUCKET=elite-accesscontrol
   VITE_S3_REGION=us-east-1
   ```

---

*Document created: 2026-01-29*
*Author: Senior Software Architect Review*
