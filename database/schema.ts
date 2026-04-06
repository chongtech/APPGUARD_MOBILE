// SQLite schema — mirrors Dexie schema in APPGUARD/src/services/db.ts (version 12)
// Applied via PRAGMA user_version migrations in db.ts

export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  condominium_id INTEGER NOT NULL,
  visitor_name TEXT NOT NULL,
  visitor_doc TEXT,
  visitor_phone TEXT,
  vehicle_license_plate TEXT,
  visit_type TEXT,
  visit_type_id INTEGER NOT NULL,
  service_type TEXT,
  service_type_id INTEGER,
  restaurant_id TEXT,
  restaurant_name TEXT,
  sport_id TEXT,
  sport_name TEXT,
  unit_id INTEGER,
  unit_block TEXT,
  unit_number TEXT,
  reason TEXT,
  photo_url TEXT,
  qr_token TEXT,
  qr_expires_at TEXT,
  check_in_at TEXT NOT NULL,
  check_out_at TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  approval_mode TEXT,
  guard_id INTEGER NOT NULL,
  device_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'PENDENTE_ENVIO',
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_visits_condominium_id ON visits(condominium_id);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_sync_status ON visits(sync_status);
CREATE INDEX IF NOT EXISTS idx_visits_check_in_at ON visits(check_in_at);
CREATE INDEX IF NOT EXISTS idx_visits_device_id ON visits(device_id);

CREATE TABLE IF NOT EXISTS visit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  event_at TEXT NOT NULL,
  actor_id INTEGER,
  actor_name TEXT,
  device_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'PENDENTE_ENVIO',
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_visit_events_visit_id ON visit_events(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_events_sync_status ON visit_events(sync_status);
CREATE INDEX IF NOT EXISTS idx_visit_events_event_at ON visit_events(event_at);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY,
  condominium_id INTEGER NOT NULL,
  code_block TEXT,
  number TEXT NOT NULL,
  floor TEXT,
  building_name TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_units_condominium_id ON units(condominium_id);
CREATE INDEX IF NOT EXISTS idx_units_code_block ON units(code_block);

CREATE TABLE IF NOT EXISTS visit_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  icon_key TEXT,
  requires_service_type INTEGER DEFAULT 0,
  requires_restaurant INTEGER DEFAULT 0,
  requires_sport INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS service_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY,
  condominium_id INTEGER NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  pin_hash TEXT,
  role TEXT NOT NULL DEFAULT 'GUARD',
  photo_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_staff_condominium_id ON staff(condominium_id);
CREATE INDEX IF NOT EXISTS idx_staff_name ON staff(first_name, last_name);

CREATE TABLE IF NOT EXISTS condominiums (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  logo_url TEXT,
  latitude REAL,
  longitude REAL,
  gps_radius_meters REAL,
  status TEXT DEFAULT 'ACTIVE',
  phone_number TEXT,
  contact_person TEXT,
  contact_email TEXT,
  manager_name TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  condominium_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'ACTIVE',
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_restaurants_condominium_id ON restaurants(condominium_id);

CREATE TABLE IF NOT EXISTS sports (
  id TEXT PRIMARY KEY,
  condominium_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'ACTIVE',
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sports_condominium_id ON sports(condominium_id);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  reported_at TEXT NOT NULL,
  resident_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  type_label TEXT,
  status TEXT NOT NULL,
  status_label TEXT,
  photo_path TEXT,
  acknowledged_at TEXT,
  acknowledged_by INTEGER,
  guard_notes TEXT,
  resolved_at TEXT,
  action_history TEXT,
  sync_status TEXT DEFAULT 'SINCRONIZADO'
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_at ON incidents(reported_at);
CREATE INDEX IF NOT EXISTS idx_incidents_resident_id ON incidents(resident_id);

CREATE TABLE IF NOT EXISTS incident_types (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER
);

CREATE TABLE IF NOT EXISTS incident_statuses (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  device_identifier TEXT NOT NULL UNIQUE,
  device_name TEXT,
  condominium_id INTEGER,
  configured_at TEXT,
  last_seen_at TEXT,
  status TEXT DEFAULT 'ACTIVE',
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS residents (
  id INTEGER PRIMARY KEY,
  condominium_id INTEGER NOT NULL,
  unit_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  type TEXT DEFAULT 'OWNER',
  photo_url TEXT,
  has_app_installed INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_residents_condominium_id ON residents(condominium_id);
CREATE INDEX IF NOT EXISTS idx_residents_unit_id ON residents(unit_id);
CREATE INDEX IF NOT EXISTS idx_residents_name ON residents(name);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY,
  condominium_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  image_url TEXT,
  category_id INTEGER,
  category_name TEXT,
  category_label TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_news_condominium_id ON news(condominium_id);
CREATE INDEX IF NOT EXISTS idx_news_created_at ON news(created_at);
`;
