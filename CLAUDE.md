# CLAUDE.md — APPGUARD_MOBILE (EntryFlow Guard)

> **Sync rule:** This file and [AGENTS.md](AGENTS.md) are co-authoritative and must stay aligned. If one is updated, reconcile the other — discrepancies must be fixed in both.

## Project Overview

**EntryFlow Guard** is a React Native mobile app for condominium security guard kiosks.
Guards use it to register visitors, report incidents, manage daily entry lists, and communicate with residents.
It runs as a dedicated kiosk device (tablet) per condominium, using PIN-based authentication — no username/password flow.

This app shares a Supabase backend with:
- **APPGUARD** (PWA admin dashboard)
- **APPRESIDENT** (resident-facing app)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo ~54 / React Native 0.81 |
| Language | TypeScript (strict mode) |
| Navigation | React Navigation 7 (native stack + bottom tabs) |
| State | React Context API (Auth, Theme, Toast) |
| Local DB | expo-sqlite (offline-first) |
| Session/Device state | AsyncStorage |
| Remote DB | Supabase JS v2 (PostgreSQL + Realtime) |
| Auth | PIN-based, bcryptjs hashing, no persistent sessions |
| Error Tracking | Sentry |
| Camera / QR | expo-camera |
| Build / CI | EAS (Expo Application Services) |
| Path Alias | `@/` → project root |

---

## Architecture

### Offline-First Data Flow

```
User Action → DataService (singleton)
                  ├── SQLite (immediate write, sync_status = PENDING_SYNC)
                  └── Supabase RPC (if online)
                             └── On reconnect: flush PENDING_SYNC queue
```

- `services/dataService.ts` is the single entry point for all data operations — never call Supabase directly from screens.
- SQLite stores: visits, visit events, staff, units, residents, incidents, config data, devices, and news.
- `AsyncStorage` stores device/session/bootstrap state.
- Connectivity detected via `@react-native-community/netinfo`.
- Health score (0–3) tracks backend reliability.

**When changing data flows, preserve both:**
1. the online path
2. the offline/cache/sync behavior

Guard flows must continue to degrade gracefully when the backend is unavailable.

### Authentication

- Device must first be registered to a condominium (setup flow).
- Guards log in with First Name + Last Name + 4-digit PIN.
- PIN is hashed with bcryptjs; verified by Supabase RPC `verify_staff_login`.
- Session stored in `AuthContext`; no persistent token between app restarts.
- Roles: `GUARD`, `ADMIN`, `SUPER_ADMIN`.

### Navigation Tree

```
AppContent
├── AuthNavigator       ← device not configured or no session
│   ├── Login
│   ├── DeviceSetup
│   └── CondominiumSelect
└── GuardTabNavigator   ← active session
    ├── Dashboard
    ├── DailyList
    ├── NewEntry (primary CTA)
    ├── Incidents
    ├── News
    ├── Settings
    └── AdminStackNavigator (ADMIN / SUPER_ADMIN only)
        ├── AdminAnalytics
        ├── AdminAuditLogs
        ├── AdminCondominiums
        ├── AdminDevices
        ├── AdminResidents
        ├── AdminStaff
        ├── AdminSubscriptions
        └── ...
```

---

## Directory Map

```
APPGUARD_MOBILE/
├── App.tsx                     Root component; wraps providers + Sentry init
├── index.js                    Expo entry point
├── types.ts                    Cross-app domain contracts (enums & interfaces)
├── app.json / app.config.js    Expo config (plugins, permissions, EAS)
├── eas.json                    Build profiles (development / preview / production)
│
├── constants/
│   └── theme.ts                BrandColors, spacing, typography tokens
│
├── contexts/                   Auth, theme, toast
│   ├── AuthContext.tsx          staff, login(), logout(), hasRole()
│   ├── ThemeContext.tsx         ELITE (light) / MIDNIGHT (dark), persisted
│   └── ToastContext.tsx         showToast() helper
│
├── navigation/                 Auth/admin/tab navigators
│   ├── AuthNavigator.tsx
│   ├── GuardTabNavigator.tsx
│   ├── AdminStackNavigator.tsx
│   └── screenOptions.ts        Shared screen header styles
│
├── screens/                    User-facing screens, grouped by domain
│                               (auth/, visits/, incidents/, admin/, dashboard/, news/, settings/, setup/)
│
├── components/                 Reusable UI building blocks
│                               (Button, PINPad, QRScanner, CameraCapture, ErrorBoundary, ...)
│
├── services/                   App services and facade layer
│   ├── dataService.ts          ★ Core data layer — all reads/writes go here
│   ├── audioService.ts         Alert sounds
│   ├── deviceUtils.ts          Device ID & metadata
│   ├── logger.ts               Categorised logging
│   └── pdfService.ts           Report PDF generation
│
├── lib/                        Backend adapters and integration helpers
│   ├── supabase.ts             Supabase client (persistSession: false)
│   └── data/
│       ├── auth.ts             Auth RPC calls
│       ├── devices.ts          Device registration RPC
│       └── rpc.ts              Generic RPC handler
│
├── database/                   SQLite adapter, schema, and SQL migrations
│   ├── db.ts                   SQLite init + migration runner (PRAGMA user_version)
│   ├── schema.ts               Table definitions & indexes
│   ├── adapter.ts              Dexie-like compatibility adapter
│   └── migrations/             SQL migration files (numbered)
│
├── hooks/                      Shared React hooks (useTheme, useColorScheme, useScreenInsets, useNetInfo)
│
└── config/
    └── sentry.ts               Sentry initialization and PII scrubbing
```

---

## Environment Variables

Copy `.env.example` → `.env.local` and fill in:

```bash
EXPO_PUBLIC_SUPABASE_URL=          # Supabase project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon key
EXPO_PUBLIC_SENTRY_DSN=            # Sentry DSN for entryflow-guard-mobile
EXPO_PUBLIC_GEMINI_API_KEY=        # Gemini API key (Phase 2 — leave empty for now)
EXPO_PUBLIC_SENTRY_ENABLE_DEV=false
```

> If Supabase env vars are missing, `lib/supabase.ts` falls back to a mock client for development. Do not assume the real backend is always available locally.

> **Note:** A hook in `.claude/settings.json` blocks any Claude tool from modifying `.env` files.

---

## Common Commands

```bash
# Development
npm start                          # Start Expo dev server
npm run android                    # Run on Android emulator/device
npm run ios                        # Run on iOS simulator
npm run web                        # Run web build

# Linting & Formatting
npm run lint                       # ESLint check (main verification command — no test suite)
npm run check:rpcs                 # Verify app RPC calls against all_rpcs.sql
npm run check:format               # Check Prettier formatting
npm run format                     # Apply Prettier formatting

# EAS Builds
eas build --profile development    # Dev client build
eas build --profile preview        # Internal testing build
eas build --profile production     # Production release
```

> There is no dedicated automated test suite. `npm run lint` is the main repository-level verification command.

---

## Key Patterns

### Calling the Data Layer

Always go through `DataService`, never raw Supabase:

```ts
import { api } from '@/services/dataService';

const visits = await api.getVisits();
await api.createVisit(visitData);
```

For auth/device/visit flows, inspect `DataService` before adding new APIs elsewhere.
For database functions, keep `.rpc(...)` usage inside `lib/data/rpc.ts`, `lib/data/*`, or `services/dataService.ts`.

### Using Theme

```ts
import { useTheme } from '@/hooks/useTheme';

const { colors, spacing } = useTheme();
```

### Showing Toasts

```ts
import { useToast } from '@/contexts/ToastContext';

const { showToast } = useToast();
showToast('Visita registada com sucesso', 'success');
```

### Adding a Database Migration

1. Create a new SQL file in `database/migrations/` (e.g., `015_add_column.sql`)
2. Increment the version in `database/db.ts` migration runner
3. If offline storage is impacted, update `database/schema.ts`
4. Update shared types in `types.ts`
5. Update service wrappers in `lib/data/*` or `services/dataService.ts`
6. Test with `/db-migrate` command or via `DataService` init

### Backend Schema / RPC Changes

If a backend schema or RPC changes, update all affected layers together:
- SQL migration under `database/migrations/`
- Local SQLite schema in `database/schema.ts` (if offline storage is impacted)
- Shared types in `types.ts`
- Service wrappers in `lib/data/*` or `services/dataService.ts`
- Admin screens if the change affects management workflows

---

## Logging, Security, and Privacy

- Do not log PINs, tokens, hashes, or raw sensitive payloads.
- Respect the PII scrubbing patterns already present in `config/sentry.ts`.
- If you touch error reporting or telemetry, maintain the existing sanitization behavior.
- Treat this app as kiosk/guard software: reliability and predictable failure modes matter more than clever abstractions.

---

## UI Guidance

- Check existing providers and hooks before adding new global state.
- Prefer incremental UI changes over broad visual rewrites.
- Keep mobile ergonomics in mind: large touch targets, readable forms, and clear loading/error states.
- If a screen depends on backend data, ensure the empty, loading, offline, and error states are handled explicitly.
- UI language is **Portuguese (pt-BR)** — keep all user-facing strings in Portuguese.
- App is **portrait-only** — do not add landscape layout code.

---

## Conventions

- Use the `@/` import alias instead of deep relative imports.
- Keep domain model changes in sync with `types.ts`.
- Preserve existing screen/domain folder organisation — do not introduce random top-level folders.
- Reuse existing themed components and providers where practical.
- Keep changes narrow and consistent with the current Expo/React Native style used in the repo.

---

## Change Checklist

Before finishing any change, verify:

- [ ] Types still match the changed payloads and tables.
- [ ] Offline behavior still makes sense for the modified flow (both online and offline/sync paths preserved).
- [ ] New Supabase or RPC usage does not bypass existing abstractions without a good reason.
- [ ] `npm run check:rpcs` passes when RPC code or SQL signatures change.
- [ ] `npm run lint` passes when code changes are made.
- [ ] Formatting is consistent (`npm run check:format`).

---

## Custom Claude Commands

| Command | Purpose |
|---|---|
| `/db-migrate` | Apply a SQL migration to Supabase and verify |
| `/deploy-test` | Deploy to Vercel preview for testing |
| `/sync-debug` | Debug offline sync issues (health score, pending queue) |
| `/create-commit-push-pr` | Full git workflow: commit → push → open PR |
| `/create-new-branch` | Create a new feature branch |
| `/notion-task` | Start work from a Notion task |

Additional agent resources under `.claude/agents/` and `.claude/commands/` — treat the actual source code as the final authority.

---

## Hard Constraints

- **Do not** modify `.env` or `.env.local` directly — the pre-tool hook will block it.
- **Do not** bypass the `DataService` singleton to call Supabase directly from screens or components.
- **Do not** remove `sync_status` tracking from SQLite writes — it powers the offline sync queue.
- **Do not** store PINs in plaintext — always hash with bcryptjs before any persistence.
- **Do not** introduce new global state without checking if an existing context/hook already covers it.
- Backend is shared — schema changes in Supabase affect APPGUARD and APPRESIDENT as well.
