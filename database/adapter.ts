/**
 * Dexie-compatible adapter over expo-sqlite.
 * Exposes the same API surface used by APPGUARD's dataService.ts:
 *   put, get, bulkPut, toArray, where, count, clear, delete
 *
 * JSON columns (action_history, metadata) are serialized/deserialized automatically.
 */
import { getDb } from "@/database/db";
import type { SQLiteBindValue } from "expo-sqlite";
import type {
  Visit,
  VisitEvent,
  Unit,
  VisitTypeConfig,
  ServiceTypeConfig,
  Staff,
  Condominium,
  Restaurant,
  Sport,
  Incident,
  IncidentType,
  IncidentStatus,
  Device,
  Resident,
  CondominiumNews,
} from "@/types";

type AnyRow = Record<string, unknown>;
type Binds = SQLiteBindValue[];

const JSON_COLUMNS: Record<string, string[]> = {
  incidents: ["action_history"],
  devices: ["metadata"],
};

function serializeRow(table: string, row: AnyRow): AnyRow {
  const result = { ...row };
  for (const [key, value] of Object.entries(result)) {
    if (value === null || value === undefined) continue;
    // Known JSON columns — always stringify
    if (JSON_COLUMNS[table]?.includes(key)) {
      if (typeof value !== "string") {
        result[key] = JSON.stringify(value);
      }
      continue;
    }
    // Safety net: any remaining object/array value must be stringified or it
    // will crash expo-sqlite's Kotlin bridge with:
    //   "Cannot convert '[object Object]' to a Kotlin type"
    if (typeof value === "object") {
      result[key] = JSON.stringify(value);
    }
  }
  return result;
}

function deserializeRow(table: string, row: AnyRow): AnyRow {
  const jsonCols = JSON_COLUMNS[table] ?? [];
  const result = { ...row };
  for (const col of jsonCols) {
    if (typeof result[col] === "string" && result[col]) {
      try {
        result[col] = JSON.parse(result[col] as string);
      } catch {
        // leave as string if parse fails
      }
    }
  }
  return result;
}

/** Strip keys that don't exist as columns in the target table.
 *  Supabase RPCs may return joined/nested fields that have no SQLite column —
 *  inserting them would either crash (objects) or create phantom columns. */
const TABLE_COLUMNS: Record<string, Set<string>> = {};
async function filterToTableColumns(
  table: string,
  row: AnyRow,
): Promise<AnyRow> {
  if (!TABLE_COLUMNS[table]) {
    const d = await getDb();
    const cols = await d.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${table})`,
    );
    TABLE_COLUMNS[table] = new Set(cols.map((c) => c.name));
  }
  const allowed = TABLE_COLUMNS[table];
  const filtered: AnyRow = {};
  for (const key of Object.keys(row)) {
    if (allowed.has(key)) filtered[key] = row[key];
  }
  return filtered;
}

function buildInsertOrReplace(
  table: string,
  row: AnyRow,
): { sql: string; params: Binds } {
  const keys = Object.keys(row);
  const placeholders = keys.map(() => "?").join(", ");
  const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
  const params = keys.map((k) => (row[k] ?? null) as SQLiteBindValue);
  return { sql, params };
}

export class TableAdapter<T = AnyRow> {
  constructor(private table: string) {}

  async put(record: T): Promise<void> {
    const db = await getDb();
    const filtered = await filterToTableColumns(
      this.table,
      record as unknown as AnyRow,
    );
    const serialized = serializeRow(this.table, filtered);
    const { sql, params } = buildInsertOrReplace(this.table, serialized);
    await db.runAsync(sql, params);
  }

  async bulkPut(records: T[]): Promise<void> {
    if (records.length === 0) return;
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const record of records) {
        const filtered = await filterToTableColumns(
          this.table,
          record as unknown as AnyRow,
        );
        const serialized = serializeRow(this.table, filtered);
        const { sql, params } = buildInsertOrReplace(this.table, serialized);
        await db.runAsync(sql, params);
      }
    });
  }

  async get(id: string | number): Promise<T | undefined> {
    const db = await getDb();
    const row = await db.getFirstAsync<AnyRow>(
      `SELECT * FROM ${this.table} WHERE id = ?`,
      [id as SQLiteBindValue],
    );
    if (!row) return undefined;
    return deserializeRow(this.table, row) as unknown as T;
  }

  async toArray(): Promise<T[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<AnyRow>(`SELECT * FROM ${this.table}`);
    return rows.map(
      (r: AnyRow) => deserializeRow(this.table, r) as unknown as T,
    );
  }

  async count(): Promise<number> {
    const db = await getDb();
    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.table}`,
    );
    return result?.count ?? 0;
  }

  async clear(): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM ${this.table}`);
  }

  async delete(id: string | number): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM ${this.table} WHERE id = ?`, [
      id as SQLiteBindValue,
    ]);
  }

  where(field: string) {
    const table = this.table;
    return {
      equals: (value: unknown) => ({
        toArray: async (): Promise<T[]> => {
          const db = await getDb();
          const rows = await db.getAllAsync<AnyRow>(
            `SELECT * FROM ${table} WHERE ${field} = ?`,
            [value as SQLiteBindValue],
          );
          return rows.map(
            (r: AnyRow) => deserializeRow(table, r) as unknown as T,
          );
        },
        count: async (): Promise<number> => {
          const db = await getDb();
          const result = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${table} WHERE ${field} = ?`,
            [value as SQLiteBindValue],
          );
          return result?.count ?? 0;
        },
        modify: async (changes: Partial<T>): Promise<void> => {
          const db = await getDb();
          const keys = Object.keys(changes as AnyRow);
          if (keys.length === 0) return;
          const setParts = keys.map((k) => `${k} = ?`).join(", ");
          const params: Binds = [
            ...keys.map(
              (k) => ((changes as AnyRow)[k] ?? null) as SQLiteBindValue,
            ),
            value as SQLiteBindValue,
          ];
          await db.runAsync(
            `UPDATE ${table} SET ${setParts} WHERE ${field} = ?`,
            params,
          );
        },
        delete: async (): Promise<void> => {
          const db = await getDb();
          await db.runAsync(`DELETE FROM ${table} WHERE ${field} = ?`, [
            value as SQLiteBindValue,
          ]);
        },
      }),
      above: (value: unknown) => ({
        toArray: async (): Promise<T[]> => {
          const db = await getDb();
          const rows = await db.getAllAsync<AnyRow>(
            `SELECT * FROM ${table} WHERE ${field} > ?`,
            [value as SQLiteBindValue],
          );
          return rows.map(
            (r: AnyRow) => deserializeRow(table, r) as unknown as T,
          );
        },
      }),
      startsWith: (prefix: string) => ({
        toArray: async (): Promise<T[]> => {
          const db = await getDb();
          const rows = await db.getAllAsync<AnyRow>(
            `SELECT * FROM ${table} WHERE ${field} LIKE ?`,
            [`${prefix}%`],
          );
          return rows.map(
            (r: AnyRow) => deserializeRow(table, r) as unknown as T,
          );
        },
      }),
    };
  }

  async rawQuery(sql: string, params?: unknown[]): Promise<T[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<AnyRow>(sql, (params ?? []) as Binds);
    return rows.map(
      (r: AnyRow) => deserializeRow(this.table, r) as unknown as T,
    );
  }
}

export const db = {
  visits: new TableAdapter<Visit>("visits"),
  visitEvents: new TableAdapter<VisitEvent>("visit_events"),
  units: new TableAdapter<Unit>("units"),
  visitTypes: new TableAdapter<VisitTypeConfig>("visit_types"),
  serviceTypes: new TableAdapter<ServiceTypeConfig>("service_types"),
  settings: new TableAdapter<{ key: string; value: string }>("settings"),
  staff: new TableAdapter<Staff>("staff"),
  condominiums: new TableAdapter<Condominium>("condominiums"),
  restaurants: new TableAdapter<Restaurant>("restaurants"),
  sports: new TableAdapter<Sport>("sports"),
  incidents: new TableAdapter<Incident>("incidents"),
  incidentTypes: new TableAdapter<IncidentType>("incident_types"),
  incidentStatuses: new TableAdapter<IncidentStatus>("incident_statuses"),
  devices: new TableAdapter<Device>("devices"),
  residents: new TableAdapter<Resident>("residents"),
  news: new TableAdapter<CondominiumNews>("news"),
};
