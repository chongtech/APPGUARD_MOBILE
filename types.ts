
export enum UserRole {
  ADMIN = 'ADMIN',
  GUARD = 'GUARD',
  SUPER_ADMIN = 'SUPER_ADMIN'
}

export enum VisitType {
  VISITOR = 'VISITANTE',
  DELIVERY = 'ENTREGA',
  SERVICE = 'SERVIÇO',
  STUDENT = 'ESTUDANTE'
}

export enum VisitStatus {
  PENDING = 'PENDENTE',
  APPROVED = 'AUTORIZADO',
  DENIED = 'NEGADO',
  INSIDE = 'NO INTERIOR',
  LEFT = 'SAIU'
}

export enum SyncStatus {
  SYNCED = 'SINCRONIZADO',
  PENDING_SYNC = 'PENDENTE_ENVIO'
}

export enum ApprovalMode {
  APP = 'APP',
  PHONE = 'TELEFONE',
  INTERCOM = 'INTERFONE',
  GUARD_MANUAL = 'MANUAL_PORTARIA',
  QR_SCAN = 'QR_CODE'
}

export interface ApprovalModeConfig {
  mode: ApprovalMode;
  label: string;
  description: string;
  requiresOnline: boolean;
  hasCallAction?: boolean;
  icon: string;
  color: string;
}

export interface Condominium {
  id: number;
  created_at?: string;
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
  visitor_photo_enabled?: boolean;
  total_residents?: number;
}

export interface Street {
  id: number;
  condominium_id: number;
  name: string;
}

export interface Device {
  id?: string;
  created_at?: string;
  device_identifier: string;
  device_name?: string;
  condominium_id?: number;
  configured_at?: string;
  last_seen_at?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED';
  metadata?: Record<string, unknown>;
}

export interface Staff {
  id: number;
  first_name: string;
  last_name: string;
  pin_hash?: string;
  condominium_id: number;
  condominium?: Condominium;
  role: UserRole;
  photo_url?: string;
}

export interface Resident {
  id: number;
  condominium_id: number;
  unit_id: number;
  name: string;
  phone?: string;
  email?: string;
  type?: 'OWNER' | 'TENANT';
  created_at?: string;
  pin_hash?: string;
  has_app_installed?: boolean;
  device_token?: string;
  app_first_login_at?: string;
  app_last_seen_at?: string;
  photo_url?: string;
}

export interface ResidentQrCode {
  id: string;
  resident_id: number;
  condominium_id: number;
  unit_id: number;
  purpose?: string;
  visitor_name?: string;
  visitor_phone?: string;
  notes?: string;
  qr_code: string;
  is_recurring?: boolean;
  recurrence_pattern?: string;
  recurrence_days?: string[];
  start_date?: string;
  end_date?: string;
  expires_at?: string;
  status?: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'USED';
  created_at?: string;
  updated_at?: string;
}

export interface QrValidationResult {
  is_valid: boolean;
  resident_id: number | null;
  unit_id: number | null;
  visitor_name: string | null;
  visitor_phone: string | null;
  purpose: string | null;
  notes: string | null;
  message: string;
}

export interface Unit {
  id: number;
  condominium_id: number;
  code_block?: string;
  number: string;
  floor?: string;
  building_name?: string;
  created_at?: string;
  residents?: Resident[];
}

export interface VisitTypeConfig {
  id: number;
  name: string;
  icon_key: string;
  requires_service_type: boolean;
  requires_restaurant?: boolean;
  requires_sport?: boolean;
}

export interface ServiceTypeConfig {
  id: number;
  name: string;
}

export interface Restaurant {
  id: string;
  condominium_id: number;
  name: string;
  description?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  created_at?: string;
}

export interface Sport {
  id: string;
  condominium_id: number;
  name: string;
  description?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  created_at?: string;
}

export interface Visit {
  id: number;
  created_at?: string;
  condominium_id: number;
  visitor_name: string;
  visitor_doc?: string;
  visitor_phone?: string;
  vehicle_license_plate?: string;
  visit_type?: string;
  visit_type_id: number;
  service_type?: string;
  service_type_id?: number;
  restaurant_id?: string;
  restaurant_name?: string;
  sport_id?: string;
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
  device_id?: string;
  sync_status: SyncStatus;
}

export interface VisitEvent {
  id?: number;
  created_at?: string;
  visit_id: number;
  status: VisitStatus;
  event_at: string;
  actor_id?: number;
  actor_name?: string;
  device_id?: string;
  sync_status: SyncStatus;
}

export interface IncidentType {
  code: string;
  label: string;
  sort_order?: number;
}

export interface IncidentStatus {
  code: string;
  label: string;
  sort_order?: number;
}

export interface Incident {
  id: string;
  reported_at: string;
  resident_id: number;
  resident?: Resident;
  unit?: Unit;
  description: string;
  type: string;
  type_label?: string;
  status: string;
  status_label?: string;
  photo_path?: string;
  acknowledged_at?: string;
  acknowledged_by?: number;
  guard_notes?: string;
  resolved_at?: string;
  action_history?: IncidentActionEntry[];
  sync_status?: SyncStatus;
}

export interface IncidentActionEntry {
  id: string;
  incident_id: string;
  created_at?: string;
  actor_id?: number | null;
  actor_name?: string;
  action: 'acknowledged' | 'inprogress' | 'resolved' | 'note' | 'updated';
  status?: string;
  note?: string;
  source?: string;
  is_legacy?: boolean;
}

export interface AuditLog {
  id: number;
  created_at: string;
  condominium_id: number;
  condominium?: Condominium;
  actor_id: number | null;
  actor?: Staff;
  action: string;
  target_table: string;
  target_id: string | number | null;
  details: Record<string, unknown>;
}

export interface DeviceRegistrationError {
  id: number;
  created_at: string;
  device_identifier?: string | null;
  error_message: string;
  payload?: Record<string, unknown>;
}

export interface CondominiumStats {
  id: number;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  total_visits_today: number;
  total_incidents_open: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface NewsCategory {
  id: number;
  name: string;
  label?: string;
  created_at?: string;
}

export interface CondominiumNews {
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

export enum Theme {
  ELITE = 'ELITE',
  MIDNIGHT = 'MIDNIGHT'
}

export enum PhotoQuality {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

export interface AppPricingRule {
  id: number;
  min_residents: number;
  max_residents: number | null;
  price_per_resident: number;
  currency: string;
  created_at?: string;
  updated_at?: string;
}

export interface CondominiumSubscription {
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
  arrears_details?: Record<string, unknown>[];
  alerts_sent?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SubscriptionPayment {
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

export interface SubscriptionAlert {
  id: number;
  condominium_id: number;
  alert_date: string;
  reference_month: string;
  sent_by: number;
  created_at?: string;
}
