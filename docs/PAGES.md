# Page Descriptions

## Guard Pages

### Setup (/setup)
**Purpose**: Configure tablet by associating it with a condominium.

**Flow**:
1. Lists all active condominiums
2. User selects condominium
3. Registers device in backend
4. Saves configuration to IndexedDB
5. Redirects to /login

**Features**:
- Replace device option (admin PIN required)
- Offline emergency configuration

### Login (/login)
**Purpose**: PIN-based authentication for guards/staff.

**Features**:
- Numeric keypad UI
- First Name, Last Name, PIN (4-6 digits)
- Online/Offline auth support
- Role-based redirects (ADMIN → /admin, GUARD → /)
- Secret admin access (5 taps on logo)
- Audio service initialization on login

### Dashboard (/)
**Purpose**: Main menu with quick access to all features.

**Features**:
- Condominium name and logo
- Online/offline status indicator
- Real-time visit list (actionable items)
- Incident detection with audio alerts
- AI Assistant modal ("Ask Concierge")
- Manual audio test button
- Sync functionality
- Navigation menu

### NewEntry (/new-entry)
**Purpose**: Register new visit/delivery.

**Features**:
- Multi-step form (3 steps)
- Visit type selection (Visitor, Delivery, Service, Student)
- Service type selection (if Service)
- Restaurant/Sport facility selection
- Visitor data input (name, document, phone)
- Unit/Block selection
- Camera photo capture
- Approval mode selector
- QR code support
- Reason/notes field

### DailyList (/day-list)
**Purpose**: View all visits for current day.

**Features**:
- Responsive design (mobile cards + desktop table)
- Status filtering
- Check-in/Check-out actions
- Call resident functionality
- Status badges with color coding

### Incidents (/incidents)
**Purpose**: Report and manage security incidents.

**Features**:
- Incident list display
- New incident detection with audio alerts
- Device vibration on new incidents
- Guard notes and acknowledgment
- Status updates (in-progress/resolved)

### News (/news)
**Purpose**: View condominium news from the last 7 days.

**Features**:
- News cards with title, description, category, and date
- Modal for full article view
- Auto-refresh every 60 seconds
- Offline support with cached news
- Empty state when no news available
- Relative time display (e.g., "ha 2 horas")

### Settings (/settings)
**Purpose**: Device settings and information.

**Features**:
- Device identifier display
- Condominium name
- Storage quota monitoring
- Online/offline status
- Uninstall confirmation

## Admin Pages (/admin/*)

17 pages for full administrative management:

| Page | Purpose |
|------|---------|
| AdminDashboard | Admin overview and quick stats |
| AdminCondominiums | CRUD for condominiums |
| AdminDevices | Device registry and status management |
| AdminDeviceRegistrationErrors | View and troubleshoot device registration errors |
| AdminStaff | Staff management with PIN reset |
| AdminUnits | Unit/Block management |
| AdminResidents | Resident directory with QR codes viewer, app status filter, bulk CSV import, bulk selection for future SMS/email invitations |
| AdminRestaurants | Restaurant configuration |
| AdminSports | Sports facility configuration |
| AdminNews | News article management with categories, image upload, pagination, and filters |
| AdminSubscriptions | Subscription & payment management, pricing rules, payment alerts |
| AdminVisits | Visit history and management |
| AdminIncidents | Incident oversight |
| AdminVisitTypes | Visit type configuration |
| AdminServiceTypes | Service type configuration |
| AdminAnalytics | Statistics and reporting |
| AdminAuditLogs | Audit trail viewing |
