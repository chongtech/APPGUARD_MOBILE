# AGENTS.md - APPGUARD_MOBILE (EntryFlow Guard)

## Synchronization

This file is the agent-oriented operational companion to `CLAUDE.md`.

`AGENTS.md` and `CLAUDE.md` are co-authoritative and must stay aligned.
If one is updated, reconcile the other. Discrepancies in either must be fixed in both.

## Project Overview

**EntryFlow Guard** is a React Native mobile app for condominium security guard kiosks.
Guards use it to register visitors, report incidents, manage daily entry lists, and communicate with residents.
It runs as a dedicated kiosk device (tablet) per condominium, using PIN-based authentication and no username/password flow.

This app shares a Supabase backend with:

- **APPGUARD** (PWA admin dashboard)
- **APPRESIDENT** (resident-facing app)

Agent implication:

- treat backend schema and RPC changes as cross-application changes, not mobile-only changes
- preserve kiosk reliability and offline behavior over convenience refactors

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo ~54 / React Native 0.81.5 |
| Language | TypeScript 5.9.2 (strict mode) |
| Navigation | React Navigation 7 (native stack + bottom tabs) |
| State | React Context API (Auth, Theme, Toast) |
| Local DB | expo-sqlite (offline-first) |
| Remote DB | Supabase (PostgreSQL + Realtime) |
| Auth | PIN-based, bcryptjs hashing, no persistent sessions |
| Error Tracking | Sentry ~7.2.0 |
| Camera / QR | expo-camera |
| Build / CI | EAS (Expo Application Services) |
| Path Alias | `@/` -> project root |

## Architecture

### Offline-First Data Flow

```text
User Action -> DataService (singleton)
                  |- SQLite (immediate write, sync_status = PENDING_SYNC)
                  '- Supabase RPC (if online)
                             '- On reconnect: flush PENDING_SYNC queue
```

- `services/dataService.ts` is the single entry point for all data operations.
- Never call Supabase directly from screens or components.
- Connectivity is detected via `@react-native-community/netinfo`.
- Health score `0-3` tracks backend reliability.
- When changing write flows, preserve `sync_status` behavior and reconnect flush behavior.

### Authentication

- Device must first be registered to a condominium through the setup flow.
- Guards log in with First Name + Last Name + 4-digit PIN.
- PIN is hashed with `bcryptjs` and verified by Supabase RPC `verify_staff_login`.
- Session is stored in `AuthContext`.
- There is no persistent token between app restarts.
- Supabase client config uses `persistSession: false`.
- Roles are `GUARD`, `ADMIN`, and `SUPER_ADMIN`.

Agent implication:

- do not introduce email/password auth flows
- do not persist auth sessions outside the established local session model
- do not store plaintext PIN values anywhere

### Navigation Tree

```text
AppContent
|- AuthNavigator       <- device not configured or no session
|  |- Login
|  |- DeviceSetup
|  '- CondominiumSelect
'- GuardTabNavigator   <- active session
   |- Dashboard
   |- DailyList
   |- NewEntry (primary CTA)
   |- Incidents
   |- News
   |- Settings
   '- AdminStackNavigator (ADMIN / SUPER_ADMIN only)
      |- AdminAnalytics
      |- AdminAuditLogs
      |- AdminCondominiums
      |- AdminDevices
      |- AdminResidents
      |- AdminStaff
      |- AdminSubscriptions
      '- ...
```

Agent implication:

- preserve role-gated admin navigation
- keep `NewEntry` as the primary guard action when adjusting tab flows

## Directory Map

```text
APPGUARD_MOBILE/
|- App.tsx                     Root component; wraps providers + Sentry init
|- index.js                    Expo entry point
|- types.ts                    All enums & shared interfaces
|- app.json / app.config.js    Expo config (plugins, permissions, EAS)
|- eas.json                    Build profiles (development / preview / production)
|
|- constants/
|  '- theme.ts                 Brand colors, spacing, typography tokens
|
|- contexts/
|  |- AuthContext.tsx          staff, login(), logout(), hasRole()
|  |- ThemeContext.tsx         ELITE (light) / MIDNIGHT (dark), persisted
|  '- ToastContext.tsx         showToast() helper
|
|- navigation/
|  |- AuthNavigator.tsx
|  |- GuardTabNavigator.tsx
|  |- AdminStackNavigator.tsx
|  '- screenOptions.ts         Shared screen header styles
|
|- screens/                    Organized by feature (auth/, visits/, incidents/, ...)
|
|- components/                 Reusable UI (Button, PINPad, QRScanner, CameraCapture, ...)
|
|- services/
|  |- dataService.ts           Core data layer; all reads/writes go here
|  |- audioService.ts          Alert sounds
|  |- deviceUtils.ts           Device ID & metadata
|  |- logger.ts                Categorized logging
|  '- pdfService.ts            Report PDF generation
|
|- lib/
|  |- supabase.ts              Supabase client (persistSession: false)
|  '- data/
|     |- auth.ts               Auth RPC calls
|     |- devices.ts            Device registration RPC
|     '- rpc.ts                Generic RPC handler
|
|- database/
|  |- db.ts                    SQLite init + migration runner (PRAGMA user_version)
|  |- schema.ts                Table definitions & indexes
|  |- adapter.ts               Dexie-like compatibility adapter
|  '- migrations/              SQL migration files
|
|- hooks/                      useTheme, useColorScheme, useScreenInsets, useNetInfo
|
'- config/
   '- sentry.ts                Sentry configuration
```

Agent implication:

- prefer `@/` imports instead of deep relative paths
- keep changes inside the existing domain structure
- if a data shape changes, check `types.ts`, `services/dataService.ts`, `lib/data/*`, and local SQLite implications together

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_SENTRY_DSN=
EXPO_PUBLIC_GEMINI_API_KEY=
EXPO_PUBLIC_SENTRY_ENABLE_DEV=false
```

Notes for agents:

- do not modify `.env` or `.env.local` directly
- a hook in `.claude/settings.json` blocks Claude tooling from modifying `.env` files
- if Supabase env vars are missing, `lib/supabase.ts` falls back to a mock client for development

## Common Commands

```bash
# Development
npm start
npm run android
npm run ios
npm run web

# Linting / formatting
npm run lint
npm run check:format
npm run format

# EAS builds
eas build --profile development
eas build --profile preview
eas build --profile production
```

Notes for agents:

- `npm run lint` is the main repository-level verification command
- there is no dedicated automated test script in `package.json` at the moment

## Key Patterns

### Calling the Data Layer

Always go through `DataService`, never raw Supabase from UI code:

```ts
import { api } from "@/services/dataService";

const visits = await api.getTodaysVisits();
await api.createVisit(visitData);
```

### Using Theme

Use the existing theme hook and preserve `ELITE` / `MIDNIGHT` behavior:

```ts
import { useTheme } from "@/hooks/useTheme";

const { theme, themeName, isDark, setTheme } = useTheme();
```

### Showing Toasts

Use the existing toast context for user feedback:

```ts
import { useToast } from "@/contexts/ToastContext";

const { showToast } = useToast();
showToast("Visita registada com sucesso", "success");
```

### Adding a Database Migration

1. Create a new SQL file in `database/migrations/` such as `015_add_column.sql`
2. Increment the version in the `database/db.ts` migration runner
3. Test with `/db-migrate` or through `DataService` init

Agent implication:

- if a Supabase schema or RPC changes, review whether local SQLite schema, shared types, and mobile flows must also change
- remember the backend is shared with `APPGUARD` and `APPRESIDENT`

## Custom Claude Commands

| Command | Purpose |
|---|---|
| `/db-migrate` | Apply a SQL migration to Supabase and verify |
| `/deploy-test` | Deploy to Vercel preview for testing |
| `/sync-debug` | Debug offline sync issues (health score, pending queue) |
| `/create-commit-push-pr` | Full git workflow: commit -> push -> open PR |
| `/create-new-branch` | Create a new feature branch |
| `/notion-task` | Start work from a Notion task |

## Important Constraints

- Do not modify `.env` or `.env.local` directly.
- Do not bypass the `DataService` singleton to call Supabase directly from screens or components.
- Do not remove `sync_status` tracking from SQLite writes; it powers the offline sync queue.
- Do not store PINs in plaintext; always hash with `bcryptjs` before any persistence.
- UI language is Portuguese (`pt-BR`); keep all user-facing strings in Portuguese.
- App is portrait-only; do not add landscape layout code.
- Backend is shared; schema changes in Supabase affect `APPGUARD` and `APPRESIDENT`.
- Keep Sentry sanitization behavior intact when touching telemetry or logging.

## Agent Checklist

Before finishing work in this repository, verify the relevant items:

- `CLAUDE.md` and this file are still aligned after any documentation change.
- New data flows still respect offline-first behavior and `sync_status`.
- New backend usage still goes through `services/dataService.ts` or `lib/data/*`.
- User-facing text remains in Portuguese.
- Auth changes still respect PIN-based kiosk behavior and `persistSession: false`.
- `npm run lint` passes when code changes are made.
