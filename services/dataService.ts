/**
 * DataService — React Native adaptation of APPGUARD/src/services/dataService.ts
 *
 * Key differences from the PWA version:
 *  - localStorage → AsyncStorage
 *  - window.online/offline events → NetInfo
 *  - navigator.onLine → NetInfo.fetch()
 *  - Dexie → expo-sqlite adapter (db from database/adapter.ts)
 *  - window.dispatchEvent(CustomEvent) → callback registration pattern
 *  - navigator.storage → not needed (SQLite is persistent natively)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { db } from "@/database/adapter";
import { getDb } from "@/database/db";
import { callRpc } from "@/lib/data/rpc";
import { verifyStaffLogin, getCondominiumList } from "@/lib/data/auth";
import {
  registerDevice,
  updateDeviceHeartbeat,
} from "@/lib/data/devices";
import {
  getDeviceIdentifier,
  getDeviceMetadata,
  getDeviceName,
} from "@/services/deviceUtils";
import { logger, LogCategory } from "@/services/logger";
import { supabase } from "@/lib/supabase";
import type {
  Staff,
  Condominium,
  Visit,
  VisitEvent,
  Incident,
  VisitTypeConfig,
  ServiceTypeConfig,
  Restaurant,
  Sport,
  Unit,
  Resident,
  CondominiumNews,
  IncidentType,
  IncidentStatus,
  Device,
  VisitStatus,
  ApprovalMode,
  AuditLog,
  DeviceRegistrationError,
  CondominiumStats,
  CondominiumSubscription,
} from "@/types";
import { SyncStatus as SyncStatusEnum, VisitStatus as VisitStatusEnum } from "@/types";
import bcrypt from "bcryptjs";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const KEYS = {
  DEVICE_ID: "device_uuid",
  CONDO_ID: "configured_condo_id",
  SESSION_STAFF_ID: "session_staff_id",
  HEALTH_SCORE: "backend_health_score",
  LAST_SYNC: "last_sync_at",
};

// ─── Sync Event Callbacks ─────────────────────────────────────────────────────
type SyncEventType = "sync:start" | "sync:complete" | "sync:error" | "sync:progress";
type SyncEventCallback = (data?: unknown) => void;

class DataService {
  private static _instance: DataService;

  isOnline = false;
  backendHealthScore = 3; // 0–3
  currentCondoId: number | null = null;
  currentDeviceId: string | null = null;
  isSyncing = false;

  private initPromise: Promise<void> | null = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;
  private syncCallbacks: Map<SyncEventType, SyncEventCallback[]> = new Map();

  static getInstance(): DataService {
    if (!DataService._instance) {
      DataService._instance = new DataService();
    }
    return DataService._instance;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._init();
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    // Ensure SQLite is ready
    await getDb();

    // Load state from AsyncStorage
    const [condoIdStr, deviceId] = await Promise.all([
      AsyncStorage.getItem(KEYS.CONDO_ID),
      AsyncStorage.getItem(KEYS.DEVICE_ID),
    ]);

    this.currentCondoId = condoIdStr ? parseInt(condoIdStr, 10) : null;
    this.currentDeviceId = deviceId;

    // Subscribe to connectivity changes
    this.netInfoUnsubscribe = NetInfo.addEventListener((state: import("@react-native-community/netinfo").NetInfoState) => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected === true && state.isInternetReachable !== false;
      if (!wasOnline && this.isOnline) {
        this.backendHealthScore = 3;
        this.syncPendingItems().catch(() => {});
      }
    });

    // Get initial connectivity state
    const netState = await NetInfo.fetch();
    this.isOnline = netState.isConnected === true && netState.isInternetReachable !== false;

    this.startHealthCheck();
    this.startHeartbeat();
  }

  destroy(): void {
    this.netInfoUnsubscribe?.();
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  // ─── Connectivity ──────────────────────────────────────────────────────────

  get isBackendHealthy(): boolean {
    return this.isOnline && this.backendHealthScore > 0;
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.verifyConnectivity();
    }, 60_000);
  }

  private async verifyConnectivity(): Promise<void> {
    try {
      const netState = await NetInfo.fetch();
      this.isOnline = netState.isConnected === true;
      if (this.isOnline) {
        this.backendHealthScore = Math.min(3, this.backendHealthScore + 1);
      }
    } catch {
      this.isOnline = false;
      this.backendHealthScore = Math.max(0, this.backendHealthScore - 1);
    }
  }

  // ─── Device & Setup ────────────────────────────────────────────────────────

  async isDeviceConfigured(): Promise<boolean> {
    const condoId = await AsyncStorage.getItem(KEYS.CONDO_ID);
    return condoId !== null;
  }

  async getCondominiums(): Promise<Condominium[]> {
    const local = await db.condominiums.toArray();
    if (local.length > 0) {
      if (this.isBackendHealthy) {
        this.refreshCondominiums().catch(() => {});
      }
      return local;
    }
    if (this.isBackendHealthy) {
      const remote = await getCondominiumList();
      await db.condominiums.bulkPut(remote);
      return remote;
    }
    return [];
  }

  private async refreshCondominiums(): Promise<void> {
    try {
      const remote = await getCondominiumList();
      await db.condominiums.bulkPut(remote);
    } catch (error) {
      logger.error(LogCategory.SYNC, "refreshCondominiums failed", error);
      this.backendHealthScore--;
    }
  }

  async configureDevice(condominiumId: number): Promise<Device> {
    const identifier = await getDeviceIdentifier();
    const metadata = getDeviceMetadata() as unknown as Record<string, unknown>;
    const name = getDeviceName();

    const device = await registerDevice({
      deviceIdentifier: identifier,
      deviceName: name,
      condominiumId,
      metadata,
    });

    await AsyncStorage.setItem(KEYS.CONDO_ID, String(condominiumId));
    await AsyncStorage.setItem(KEYS.DEVICE_ID, device.id ?? identifier);

    this.currentCondoId = condominiumId;
    this.currentDeviceId = device.id ?? identifier;

    // Persist in local DB too
    await db.devices.put(device);

    logger.info(LogCategory.AUTH, "Device configured", { condominiumId, deviceId: device.id });
    return device;
  }

  async getDeviceCondoDetails(): Promise<Condominium | null> {
    if (!this.currentCondoId) return null;
    const local = await db.condominiums.get(this.currentCondoId);
    if (local) return local;
    if (this.isBackendHealthy) {
      const remote = await callRpc<Condominium>("get_condominium_by_id", {
        p_condominium_id: this.currentCondoId,
      });
      if (remote) await db.condominiums.put(remote);
      return remote;
    }
    return null;
  }

  async resetDevice(): Promise<void> {
    await Promise.all([
      AsyncStorage.removeItem(KEYS.CONDO_ID),
      AsyncStorage.removeItem(KEYS.DEVICE_ID),
      AsyncStorage.removeItem(KEYS.SESSION_STAFF_ID),
    ]);
    this.currentCondoId = null;
    this.currentDeviceId = null;
  }

  // ─── Authentication ────────────────────────────────────────────────────────

  async login(
    firstName: string,
    lastName: string,
    pin: string
  ): Promise<Staff | null> {
    if (!this.currentCondoId) {
      throw new Error("Device not configured. Set up the device first.");
    }

    const fName = firstName.trim().toUpperCase();
    const lName = lastName.trim().toUpperCase();

    if (this.isBackendHealthy) {
      try {
        const result = await verifyStaffLogin(fName, lName, this.currentCondoId);
        if (!result) return null;

        const { staff, pin_hash } = result;
        const valid = await bcrypt.compare(pin, pin_hash);
        if (!valid) return null;

        // Cache for offline login
        const staffWithHash = { ...staff, pin_hash };
        await db.staff.put(staffWithHash);
        await AsyncStorage.setItem(KEYS.SESSION_STAFF_ID, String(staff.id));

        logger.trackAction("login_success", { staffId: staff.id, role: staff.role });
        return staff;
      } catch (error) {
        logger.error(LogCategory.AUTH, "Online login failed, trying offline", error);
        this.backendHealthScore--;
      }
    }

    // Offline fallback — compare against cached pin_hash in SQLite
    const rows = await db.staff.rawQuery(
      `SELECT * FROM staff WHERE UPPER(first_name) = ? AND UPPER(last_name) = ? AND condominium_id = ? LIMIT 1`,
      [fName, lName, this.currentCondoId]
    );
    const staffRow = rows[0];
    if (!staffRow?.pin_hash) return null;

    const valid = await bcrypt.compare(pin, staffRow.pin_hash as string);
    if (!valid) return null;

    await AsyncStorage.setItem(KEYS.SESSION_STAFF_ID, String(staffRow.id));
    logger.trackAction("login_offline", { staffId: staffRow.id });
    return staffRow;
  }

  async logout(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.SESSION_STAFF_ID);
    logger.trackAction("logout");
  }

  async getSessionStaff(): Promise<Staff | null> {
    const staffIdStr = await AsyncStorage.getItem(KEYS.SESSION_STAFF_ID);
    if (!staffIdStr) return null;
    return (await db.staff.get(parseInt(staffIdStr, 10))) ?? null;
  }

  // ─── Visits ────────────────────────────────────────────────────────────────

  async getTodaysVisits(): Promise<Visit[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    if (!this.currentCondoId) return [];

    const local = await db.visits.rawQuery(
      `SELECT * FROM visits WHERE condominium_id = ? AND check_in_at >= ? ORDER BY check_in_at DESC`,
      [this.currentCondoId, todayStr]
    );

    if (local.length > 0) {
      if (this.isBackendHealthy) {
        this.refreshTodaysVisits().catch(() => {});
      }
      return local;
    }

    if (this.isBackendHealthy) {
      return this.refreshTodaysVisits();
    }
    return [];
  }

  private async refreshTodaysVisits(): Promise<Visit[]> {
    try {
      const remote = await callRpc<Visit[]>("get_todays_visits", {
        p_condominium_id: this.currentCondoId,
      });
      if (remote?.length) await db.visits.bulkPut(remote);
      return remote ?? [];
    } catch (error) {
      logger.error(LogCategory.SYNC, "refreshTodaysVisits failed", error);
      this.backendHealthScore--;
      return [];
    }
  }

  async createVisit(data: Omit<Visit, "id" | "sync_status">): Promise<Visit> {
    const visit: Visit = {
      ...data,
      id: Date.now(), // Temporary local ID — replaced by server ID on sync
      sync_status: SyncStatusEnum.PENDING_SYNC,
      device_id: this.currentDeviceId ?? undefined,
    };

    await db.visits.put(visit);

    if (this.isBackendHealthy) {
      try {
        const remote = await callRpc<Visit>("register_visit", {
          p_visit: visit,
          p_device_id: this.currentDeviceId,
        });
        const synced: Visit = { ...remote, sync_status: SyncStatusEnum.SYNCED };
        // Replace temp local record with server record
        await db.visits.delete(visit.id);
        await db.visits.put(synced);
        return synced;
      } catch (error) {
        logger.error(LogCategory.SYNC, "createVisit sync failed", error);
        this.backendHealthScore--;
      }
    }

    return visit;
  }

  async updateVisitStatus(
    visitId: number,
    status: VisitStatus,
    actorId: number,
    mode?: ApprovalMode
  ): Promise<void> {
    const event: VisitEvent = {
      visit_id: visitId,
      status,
      event_at: new Date().toISOString(),
      actor_id: actorId,
      device_id: this.currentDeviceId ?? undefined,
      sync_status: SyncStatusEnum.PENDING_SYNC,
    };

    await db.visitEvents.put(event);
    await db.visits.where("id").equals(visitId).modify({
      status,
      ...(mode ? { approval_mode: mode } : {}),
      ...(status === VisitStatusEnum.LEFT ? { check_out_at: event.event_at } : {}),
      sync_status: SyncStatusEnum.PENDING_SYNC,
    });

    if (this.isBackendHealthy) {
      try {
        await callRpc<void>("update_visit_status", {
          p_visit_id: visitId,
          p_status: status,
          p_actor_id: actorId,
          p_approval_mode: mode ?? null,
          p_device_id: this.currentDeviceId,
        });
        await db.visits.where("id").equals(visitId).modify({
          sync_status: SyncStatusEnum.SYNCED,
        });
      } catch (error) {
        logger.error(LogCategory.SYNC, "updateVisitStatus sync failed", error);
        this.backendHealthScore--;
      }
    }
  }

  async getVisitEvents(visitId: number): Promise<VisitEvent[]> {
    const local = await db.visitEvents.where("visit_id").equals(visitId).toArray();
    if (local.length > 0) return local.sort((a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime());
    if (this.isBackendHealthy) {
      try {
        const remote = await callRpc<VisitEvent[]>("get_visit_events", { p_visit_id: visitId });
        if (remote?.length) await db.visitEvents.bulkPut(remote);
        return remote ?? [];
      } catch {
        return [];
      }
    }
    return [];
  }

  async getUnitsWithResidents(condoId?: number): Promise<Unit[]> {
    const id = condoId ?? this.currentCondoId;
    if (!id) return [];
    return this.getUnits(id);
  }

  async checkOnline(): Promise<boolean> {
    return this.isOnline;
  }

  // ─── Incidents ─────────────────────────────────────────────────────────────

  async getIncidents(): Promise<Incident[]> {
    return this.getOpenIncidents();
  }

  async acknowledgeIncident(incidentId: string, staffId: number): Promise<void> {
    if (this.isBackendHealthy) {
      try {
        await callRpc<void>("acknowledge_incident", {
          p_incident_id: incidentId,
          p_staff_id: staffId,
        });
        await this.refreshIncidents();
      } catch (error) {
        logger.error(LogCategory.SYNC, "acknowledgeIncident failed", error);
        throw error;
      }
    }
  }

  async reportIncidentAction(
    incidentId: string,
    notes: string,
    status: "inprogress" | "resolved"
  ): Promise<void> {
    if (this.isBackendHealthy) {
      try {
        await callRpc<void>("report_incident_action", {
          p_incident_id: incidentId,
          p_notes: notes,
          p_status: status,
        });
        await this.refreshIncidents();
      } catch (error) {
        logger.error(LogCategory.SYNC, "reportIncidentAction failed", error);
        throw error;
      }
    }
  }

  async getOpenIncidents(): Promise<Incident[]> {
    if (!this.currentCondoId) return [];

    const local = await db.incidents.rawQuery(
      `SELECT * FROM incidents WHERE status NOT IN ('resolved', 'closed') ORDER BY reported_at DESC`,
      []
    );

    if (local.length > 0) {
      if (this.isBackendHealthy) {
        this.refreshIncidents().catch(() => {});
      }
      return local;
    }

    if (this.isBackendHealthy) {
      return this.refreshIncidents();
    }
    return [];
  }

  private async refreshIncidents(): Promise<Incident[]> {
    try {
      const remote = await callRpc<Incident[]>("get_incidents_for_guard", {
        p_condominium_id: this.currentCondoId,
      });
      if (remote?.length) await db.incidents.bulkPut(remote);
      return remote ?? [];
    } catch (error) {
      logger.error(LogCategory.SYNC, "refreshIncidents failed", error);
      this.backendHealthScore--;
      return [];
    }
  }

  // ─── Config Data (Visit/Service Types, etc.) ───────────────────────────────

  async getVisitTypes(): Promise<VisitTypeConfig[]> {
    const local = await db.visitTypes.toArray();
    if (local.length > 0) {
      if (this.isBackendHealthy) this.refreshVisitTypes().catch(() => {});
      return local;
    }
    if (this.isBackendHealthy) return this.refreshVisitTypes();
    return [];
  }

  private async refreshVisitTypes(): Promise<VisitTypeConfig[]> {
    try {
      const remote = await callRpc<VisitTypeConfig[]>("get_visit_types", {});
      if (remote?.length) await db.visitTypes.bulkPut(remote);
      return remote ?? [];
    } catch (error) {
      this.backendHealthScore--;
      return [];
    }
  }

  async getServiceTypes(): Promise<ServiceTypeConfig[]> {
    const local = await db.serviceTypes.toArray();
    if (local.length > 0) {
      if (this.isBackendHealthy) this.refreshServiceTypes().catch(() => {});
      return local;
    }
    if (this.isBackendHealthy) return this.refreshServiceTypes();
    return [];
  }

  private async refreshServiceTypes(): Promise<ServiceTypeConfig[]> {
    try {
      const remote = await callRpc<ServiceTypeConfig[]>("get_service_types", {});
      if (remote?.length) await db.serviceTypes.bulkPut(remote);
      return remote ?? [];
    } catch (error) {
      this.backendHealthScore--;
      return [];
    }
  }

  async getRestaurants(condoId: number): Promise<Restaurant[]> {
    const local = await db.restaurants.where("condominium_id").equals(condoId).toArray();
    if (local.length > 0) {
      if (this.isBackendHealthy) this.refreshRestaurants(condoId).catch(() => {});
      return local;
    }
    if (this.isBackendHealthy) return this.refreshRestaurants(condoId);
    return [];
  }

  private async refreshRestaurants(condoId: number): Promise<Restaurant[]> {
    try {
      const remote = await callRpc<Restaurant[]>("get_restaurants_for_condo", {
        p_condominium_id: condoId,
      });
      if (remote?.length) await db.restaurants.bulkPut(remote);
      return remote ?? [];
    } catch (error) {
      this.backendHealthScore--;
      return [];
    }
  }

  async getSports(condoId: number): Promise<Sport[]> {
    const local = await db.sports.where("condominium_id").equals(condoId).toArray();
    if (local.length > 0) {
      if (this.isBackendHealthy) this.refreshSports(condoId).catch(() => {});
      return local;
    }
    if (this.isBackendHealthy) return this.refreshSports(condoId);
    return [];
  }

  private async refreshSports(condoId: number): Promise<Sport[]> {
    try {
      const remote = await callRpc<Sport[]>("get_sports_for_condo", {
        p_condominium_id: condoId,
      });
      if (remote?.length) await db.sports.bulkPut(remote);
      return remote ?? [];
    } catch (error) {
      this.backendHealthScore--;
      return [];
    }
  }

  async getUnits(condoId: number): Promise<Unit[]> {
    const local = await db.units.where("condominium_id").equals(condoId).toArray();
    if (local.length > 0) {
      if (this.isBackendHealthy) this.refreshUnits(condoId).catch(() => {});
      return local;
    }
    if (this.isBackendHealthy) return this.refreshUnits(condoId);
    return [];
  }

  private async refreshUnits(condoId: number): Promise<Unit[]> {
    try {
      const remote = await callRpc<Unit[]>("get_units_for_condo", {
        p_condominium_id: condoId,
      });
      if (remote?.length) await db.units.bulkPut(remote);
      return remote ?? [];
    } catch (error) {
      this.backendHealthScore--;
      return [];
    }
  }

  async getResidents(condoId: number): Promise<Resident[]> {
    const local = await db.residents.where("condominium_id").equals(condoId).toArray();
    if (local.length > 0) {
      if (this.isBackendHealthy) this.refreshResidents(condoId).catch(() => {});
      return local;
    }
    if (this.isBackendHealthy) return this.refreshResidents(condoId);
    return [];
  }

  private async refreshResidents(condoId: number): Promise<Resident[]> {
    try {
      const remote = await callRpc<Resident[]>("get_residents_for_condo", {
        p_condominium_id: condoId,
      });
      if (remote?.length) await db.residents.bulkPut(remote);
      return remote ?? [];
    } catch (error) {
      this.backendHealthScore--;
      return [];
    }
  }

  async getNews(condoId: number): Promise<CondominiumNews[]> {
    const local = await db.news.where("condominium_id").equals(condoId).toArray();
    if (local.length > 0) {
      if (this.isBackendHealthy) this.refreshNews(condoId).catch(() => {});
      return local;
    }
    if (this.isBackendHealthy) return this.refreshNews(condoId);
    return [];
  }

  private async refreshNews(condoId: number): Promise<CondominiumNews[]> {
    try {
      const remote = await callRpc<CondominiumNews[]>("get_news_for_condo", {
        p_condominium_id: condoId,
        p_days: 7,
      });
      if (remote?.length) await db.news.bulkPut(remote);
      return remote ?? [];
    } catch (error) {
      this.backendHealthScore--;
      return [];
    }
  }

  async getIncidentTypes(): Promise<IncidentType[]> {
    const local = await db.incidentTypes.toArray();
    if (local.length > 0) return local;
    if (this.isBackendHealthy) {
      try {
        const remote = await callRpc<IncidentType[]>("get_incident_types", {});
        if (remote?.length) await db.incidentTypes.bulkPut(remote);
        return remote ?? [];
      } catch { return []; }
    }
    return [];
  }

  async getIncidentStatuses(): Promise<IncidentStatus[]> {
    const local = await db.incidentStatuses.toArray();
    if (local.length > 0) return local;
    if (this.isBackendHealthy) {
      try {
        const remote = await callRpc<IncidentStatus[]>("get_incident_statuses", {});
        if (remote?.length) await db.incidentStatuses.bulkPut(remote);
        return remote ?? [];
      } catch { return []; }
    }
    return [];
  }

  // ─── Sync ──────────────────────────────────────────────────────────────────

  async syncPendingItems(): Promise<void> {
    if (this.isSyncing || !this.isBackendHealthy) return;
    this.isSyncing = true;
    this.emit("sync:start");

    try {
      // Sync pending visits
      const pendingVisits = await db.visits.where("sync_status")
        .equals(SyncStatusEnum.PENDING_SYNC)
        .toArray();

      for (const visit of pendingVisits) {
        try {
          const remote = await callRpc<Visit>("register_visit", {
            p_visit: visit,
            p_device_id: this.currentDeviceId,
          });
          const synced: Visit = { ...remote, sync_status: SyncStatusEnum.SYNCED };
          await db.visits.delete(visit.id);
          await db.visits.put(synced);
        } catch {
          // leave for next sync cycle
        }
      }

      // Sync pending visit events
      const pendingEvents = await db.visitEvents.where("sync_status")
        .equals(SyncStatusEnum.PENDING_SYNC)
        .toArray();

      for (const event of pendingEvents) {
        try {
          await callRpc<void>("update_visit_status", {
            p_visit_id: event.visit_id,
            p_status: event.status,
            p_actor_id: event.actor_id,
            p_device_id: event.device_id,
            p_event_at: event.event_at,
          });
          await db.visitEvents.where("id").equals(event.id!).modify({
            sync_status: SyncStatusEnum.SYNCED,
          });
        } catch {
          // leave for next sync cycle
        }
      }

      await AsyncStorage.setItem(KEYS.LAST_SYNC, new Date().toISOString());
      this.emit("sync:complete");
    } catch (error) {
      logger.error(LogCategory.SYNC, "syncPendingItems failed", error);
      this.emit("sync:error", error);
    } finally {
      this.isSyncing = false;
    }
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      if (!this.isBackendHealthy || !this.currentCondoId) return;
      const identifier = await getDeviceIdentifier();
      updateDeviceHeartbeat({
        deviceIdentifier: identifier,
        condominiumId: this.currentCondoId,
      }).catch(() => {});
    }, 5 * 60_000); // every 5 minutes
  }

  // ─── Event Emitter ─────────────────────────────────────────────────────────

  on(event: SyncEventType, callback: SyncEventCallback): void {
    const list = this.syncCallbacks.get(event) ?? [];
    list.push(callback);
    this.syncCallbacks.set(event, list);
  }

  off(event: SyncEventType, callback: SyncEventCallback): void {
    const list = this.syncCallbacks.get(event) ?? [];
    this.syncCallbacks.set(event, list.filter((cb) => cb !== callback));
  }

  private emit(event: SyncEventType, data?: unknown): void {
    const list = this.syncCallbacks.get(event) ?? [];
    list.forEach((cb) => cb(data));
  }

  // ─── Admin API ─────────────────────────────────────────────────────────────

  private async sbFrom<T>(
    table: string,
    select = "*",
    filters?: Record<string, unknown>
  ): Promise<T[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from(table).select(select);
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null) q = q.eq(k, v);
      }
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as T[];
  }

  async adminGetDashboardStats(): Promise<{
    totalCondominiums: number;
    activeCondominiums: number;
    totalDevices: number;
    activeDevices: number;
    totalStaff: number;
    totalUnits: number;
    totalResidents: number;
    todayVisits: number;
    pendingVisits: number;
    activeIncidents: number;
  }> {
    const today = new Date().toISOString().slice(0, 10);
    const [condos, devices, staff, units, residents, visits, incidents] = await Promise.all([
      this.sbFrom<Condominium>("condominiums"),
      this.sbFrom<Device>("devices"),
      this.sbFrom<Staff>("staff"),
      this.sbFrom<Unit>("units"),
      this.sbFrom<Resident>("residents"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("visits").select("id,status,check_in_at").gte("check_in_at", today),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("incidents").select("id,status").neq("status", "resolved"),
    ]);
    const visitsData: Visit[] = visits.data ?? [];
    const incidentsData: Incident[] = incidents.data ?? [];
    return {
      totalCondominiums: condos.length,
      activeCondominiums: condos.filter((c) => c.status === "ACTIVE").length,
      totalDevices: devices.length,
      activeDevices: devices.filter((d) => d.status === "ACTIVE").length,
      totalStaff: staff.length,
      totalUnits: units.length,
      totalResidents: residents.length,
      todayVisits: visitsData.length,
      pendingVisits: visitsData.filter((v) => v.status === VisitStatusEnum.PENDING).length,
      activeIncidents: incidentsData.length,
    };
  }

  async adminGetCondominiumStats(): Promise<CondominiumStats[]> {
    return this.sbFrom<CondominiumStats>("condominium_stats_view");
  }

  async adminGetAllCondominiums(): Promise<Condominium[]> {
    return this.sbFrom<Condominium>("condominiums", "*", undefined);
  }

  async adminCreateCondominium(condo: Partial<Condominium>): Promise<Condominium> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("condominiums").insert(condo).select().single();
    if (error) throw error;
    return data as Condominium;
  }

  async adminUpdateCondominium(id: number, updates: Partial<Condominium>): Promise<Condominium> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("condominiums").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return data as Condominium;
  }

  async adminGetAllStaff(condominiumId?: number): Promise<Staff[]> {
    return this.sbFrom<Staff>("staff", "*", condominiumId ? { condominium_id: condominiumId } : undefined);
  }

  async adminCreateStaff(staff: Partial<Staff>): Promise<Staff> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("staff").insert(staff).select().single();
    if (error) throw error;
    return data as Staff;
  }

  async adminUpdateStaff(id: number, updates: Partial<Staff>): Promise<Staff> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("staff").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return data as Staff;
  }

  async adminDeleteStaff(id: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("staff").delete().eq("id", id);
    if (error) throw error;
  }

  async adminGetAllUnits(condominiumId?: number): Promise<Unit[]> {
    return this.sbFrom<Unit>("units", "*", condominiumId ? { condominium_id: condominiumId } : undefined);
  }

  async adminCreateUnit(unit: Partial<Unit>): Promise<Unit> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("units").insert(unit).select().single();
    if (error) throw error;
    return data as Unit;
  }

  async adminUpdateUnit(id: number, updates: Partial<Unit>): Promise<Unit> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("units").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return data as Unit;
  }

  async adminDeleteUnit(id: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("units").delete().eq("id", id);
    if (error) throw error;
  }

  async adminGetAllResidents(condominiumId?: number): Promise<Resident[]> {
    return this.sbFrom<Resident>("residents", "*", condominiumId ? { condominium_id: condominiumId } : undefined);
  }

  async adminCreateResident(resident: Partial<Resident>): Promise<Resident> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("residents").insert(resident).select().single();
    if (error) throw error;
    return data as Resident;
  }

  async adminUpdateResident(id: number, updates: Partial<Resident>): Promise<Resident> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("residents").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return data as Resident;
  }

  async adminDeleteResident(id: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("residents").delete().eq("id", id);
    if (error) throw error;
  }

  async adminGetAllVisits(condominiumId?: number, startDate?: string): Promise<Visit[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from("visits").select("*").order("check_in_at", { ascending: false }).limit(200);
    if (condominiumId) q = q.eq("condominium_id", condominiumId);
    if (startDate) q = q.gte("check_in_at", startDate);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Visit[];
  }

  async adminUpdateVisitStatus(id: number, status: VisitStatus): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("visits").update({ status }).eq("id", id);
    if (error) throw error;
  }

  async adminGetAllIncidents(condominiumId?: number): Promise<Incident[]> {
    return this.sbFrom<Incident>("incidents", "*", condominiumId ? { condominium_id: condominiumId } : undefined);
  }

  async adminResolveIncident(id: string, notes: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("incidents").update({ status: "resolved", guard_notes: notes, resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }

  async adminGetAllDevices(condominiumId?: number): Promise<Device[]> {
    return this.sbFrom<Device>("devices", "*", condominiumId ? { condominium_id: condominiumId } : undefined);
  }

  async adminDecommissionDevice(id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("devices").update({ status: "decommissioned" }).eq("id", id);
    if (error) throw error;
  }

  async adminGetAllVisitTypes(): Promise<VisitTypeConfig[]> {
    return this.sbFrom<VisitTypeConfig>("visit_types");
  }

  async adminCreateVisitType(vt: Partial<VisitTypeConfig>): Promise<VisitTypeConfig> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("visit_types").insert(vt).select().single();
    if (error) throw error;
    return data as VisitTypeConfig;
  }

  async adminUpdateVisitType(id: number, updates: Partial<VisitTypeConfig>): Promise<VisitTypeConfig> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("visit_types").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return data as VisitTypeConfig;
  }

  async adminDeleteVisitType(id: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("visit_types").delete().eq("id", id);
    if (error) throw error;
  }

  async adminGetAllServiceTypes(): Promise<ServiceTypeConfig[]> {
    return this.sbFrom<ServiceTypeConfig>("service_types");
  }

  async adminCreateServiceType(st: Partial<ServiceTypeConfig>): Promise<ServiceTypeConfig> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("service_types").insert(st).select().single();
    if (error) throw error;
    return data as ServiceTypeConfig;
  }

  async adminUpdateServiceType(id: number, updates: Partial<ServiceTypeConfig>): Promise<ServiceTypeConfig> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("service_types").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return data as ServiceTypeConfig;
  }

  async adminDeleteServiceType(id: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("service_types").delete().eq("id", id);
    if (error) throw error;
  }

  async adminGetAllRestaurants(condominiumId?: number): Promise<Restaurant[]> {
    return this.sbFrom<Restaurant>("restaurants", "*", condominiumId ? { condominium_id: condominiumId } : undefined);
  }

  async adminCreateRestaurant(r: Partial<Restaurant>): Promise<Restaurant> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("restaurants").insert(r).select().single();
    if (error) throw error;
    return data as Restaurant;
  }

  async adminUpdateRestaurant(id: string, updates: Partial<Restaurant>): Promise<Restaurant> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("restaurants").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return data as Restaurant;
  }

  async adminDeleteRestaurant(id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("restaurants").delete().eq("id", id);
    if (error) throw error;
  }

  async adminGetAllSports(condominiumId?: number): Promise<Sport[]> {
    return this.sbFrom<Sport>("sports", "*", condominiumId ? { condominium_id: condominiumId } : undefined);
  }

  async adminCreateSport(s: Partial<Sport>): Promise<Sport> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("sports").insert(s).select().single();
    if (error) throw error;
    return data as Sport;
  }

  async adminUpdateSport(id: string, updates: Partial<Sport>): Promise<Sport> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("sports").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return data as Sport;
  }

  async adminDeleteSport(id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("sports").delete().eq("id", id);
    if (error) throw error;
  }

  async adminGetAllNews(condominiumId?: number): Promise<CondominiumNews[]> {
    return this.sbFrom<CondominiumNews>("condominium_news", "*", condominiumId ? { condominium_id: condominiumId } : undefined);
  }

  async adminCreateNews(news: Partial<CondominiumNews>): Promise<CondominiumNews> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("condominium_news").insert(news).select().single();
    if (error) throw error;
    return data as CondominiumNews;
  }

  async adminUpdateNews(id: number, updates: Partial<CondominiumNews>): Promise<CondominiumNews> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("condominium_news").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return data as CondominiumNews;
  }

  async adminDeleteNews(id: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("condominium_news").delete().eq("id", id);
    if (error) throw error;
  }

  async adminGetAuditLogs(filters?: { condominiumId?: number; limit?: number }): Promise<AuditLog[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from("audit_logs").select("*").order("created_at", { ascending: false }).limit(filters?.limit ?? 100);
    if (filters?.condominiumId) q = q.eq("condominium_id", filters.condominiumId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as AuditLog[];
  }

  async adminGetDeviceRegistrationErrors(condominiumId?: number): Promise<DeviceRegistrationError[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from("device_registration_errors").select("*").order("created_at", { ascending: false }).limit(100);
    if (condominiumId) q = q.eq("condominium_id", condominiumId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DeviceRegistrationError[];
  }

  async adminGetCondominiumSubscriptions(): Promise<CondominiumSubscription[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("condominium_subscriptions")
      .select("*, condominiums(name)")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as CondominiumSubscription[];
  }

  async adminUpdateSubscriptionStatus(id: number, status: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("condominium_subscriptions").update({ status }).eq("id", id);
    if (error) throw error;
  }
}

export const api = DataService.getInstance();
