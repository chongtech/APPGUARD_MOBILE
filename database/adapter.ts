/**
 * Dexie-compatible adapter over expo-sqlite.
 * Exposes the same API surface used by APPGUARD's dataService.ts:
 *   put, get, bulkPut, toArray, where, count, clear, delete
 *
 * JSON columns (action_history, metadata) are serialized/deserialized automatically.
 */
import { getDb } from "@/database/db";
import type { SQLiteBindValue } from "expo-sqlite";

type AnyRow = Record<string, unknown>;
type Binds = SQLiteBindValue[];

const JSON_COLUMNS: Record<string, string[]> = {
  incidents: ["action_history"],
  devices: ["metadata"],
};

function serializeRow(table: string, row: AnyRow): AnyRow {
  const jsonCols = JSON_COLUMNS[table] ?? [];
  const result = { ...row };
  for (const col of jsonCols) {
    if (result[col] !== undefined && result[col] !== null && typeof result[col] !== "string") {
      result[col] = JSON.stringify(result[col]);
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

function buildInsertOrReplace(
  table: string,
  row: AnyRow
): { sql: string; params: Binds } {
  const keys = Object.keys(row);
  const placeholders = keys.map(() => "?").join(", ");
  const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
  const params = keys.map((k) => (row[k] ?? null) as SQLiteBindValue);
  return { sql, params };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class TableAdapter<T = any> {
  constructor(private table: string) {}

  async put(record: T): Promise<void> {
    const db = await getDb();
    const serialized = serializeRow(this.table, record as unknown as AnyRow);
    const { sql, params } = buildInsertOrReplace(this.table, serialized);
    await db.runAsync(sql, params);
  }

  async bulkPut(records: T[]): Promise<void> {
    if (records.length === 0) return;
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const record of records) {
        const serialized = serializeRow(this.table, record as unknown as AnyRow);
        const { sql, params } = buildInsertOrReplace(this.table, serialized);
        await db.runAsync(sql, params);
      }
    });
  }

  async get(id: string | number): Promise<T | undefined> {
    const db = await getDb();
    const row = await db.getFirstAsync<AnyRow>(
      `SELECT * FROM ${this.table} WHERE id = ?`,
      [id as SQLiteBindValue]
    );
    if (!row) return undefined;
    return deserializeRow(this.table, row) as unknown as T;
  }

  async toArray(): Promise<T[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<AnyRow>(`SELECT * FROM ${this.table}`);
    return rows.map((r: AnyRow) => deserializeRow(this.table, r) as unknown as T);
  }

  async count(): Promise<number> {
    const db = await getDb();
    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.table}`
    );
    return result?.count ?? 0;
  }

  async clear(): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM ${this.table}`);
  }

  async delete(id: string | number): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM ${this.table} WHERE id = ?`, [id as SQLiteBindValue]);
  }

  where(field: string) {
    const table = this.table;
    return {
      equals: (value: unknown) => ({
        toArray: async (): Promise<T[]> => {
          const db = await getDb();
          const rows = await db.getAllAsync<AnyRow>(
            `SELECT * FROM ${table} WHERE ${field} = ?`,
            [value as SQLiteBindValue]
          );
          return rows.map((r: AnyRow) => deserializeRow(table, r) as unknown as T);
        },
        count: async (): Promise<number> => {
          const db = await getDb();
          const result = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${table} WHERE ${field} = ?`,
            [value as SQLiteBindValue]
          );
          return result?.count ?? 0;
        },
        modify: async (changes: Partial<T>): Promise<void> => {
          const db = await getDb();
          const keys = Object.keys(changes as AnyRow);
          if (keys.length === 0) return;
          const setParts = keys.map((k) => `${k} = ?`).join(", ");
          const params: Binds = [
            ...keys.map((k) => ((changes as AnyRow)[k] ?? null) as SQLiteBindValue),
            value as SQLiteBindValue,
          ];
          await db.runAsync(
            `UPDATE ${table} SET ${setParts} WHERE ${field} = ?`,
            params
          );
        },
        delete: async (): Promise<void> => {
          const db = await getDb();
          await db.runAsync(`DELETE FROM ${table} WHERE ${field} = ?`, [value as SQLiteBindValue]);
        },
      }),
      above: (value: unknown) => ({
        toArray: async (): Promise<T[]> => {
          const db = await getDb();
          const rows = await db.getAllAsync<AnyRow>(
            `SELECT * FROM ${table} WHERE ${field} > ?`,
            [value as SQLiteBindValue]
          );
          return rows.map((r: AnyRow) => deserializeRow(table, r) as unknown as T);
        },
      }),
      startsWith: (prefix: string) => ({
        toArray: async (): Promise<T[]> => {
          const db = await getDb();
          const rows = await db.getAllAsync<AnyRow>(
            `SELECT * FROM ${table} WHERE ${field} LIKE ?`,
            [`${prefix}%`]
          );
          return rows.map((r: AnyRow) => deserializeRow(table, r) as unknown as T);
        },
      }),
    };
  }

  async rawQuery(sql: string, params?: unknown[]): Promise<T[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<AnyRow>(sql, (params ?? []) as Binds);
    return rows.map((r: AnyRow) => deserializeRow(this.table, r) as unknown as T);
  }
}

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
