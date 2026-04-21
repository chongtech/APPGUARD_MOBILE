/**
 * Dexie-compatible adapter over expo-sqlite.
 * Exposes the same API surface used by APPGUARD's dataService.ts:
 *   put, get, bulkPut, toArray, where, count, clear, delete
 *
 * JSON columns (action_history, metadata) are serialized/deserialized automatically.
 */
import { getDb } from "@/database/db";
import { logger, LogCategory } from "@/services/logger";
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
type SQLiteDb = Awaited<ReturnType<typeof getDb>>;

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

function toSQLiteBindValue(value: unknown): SQLiteBindValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (value instanceof Uint8Array) return value;
  // SQLite has no boolean type — convert to INTEGER 0/1.
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  // Any remaining object/array — stringify to prevent Kotlin bridge crash.
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeBinds(params: readonly unknown[] = []): Binds {
  return params.map(toSQLiteBindValue);
}

function describeBindValue(value: SQLiteBindValue): string {
  if (value === null) return "null";
  if (value instanceof Uint8Array) return `Uint8Array(${value.byteLength})`;
  return typeof value;
}

async function runSql(
  db: SQLiteDb,
  sql: string,
  params: readonly unknown[] = [],
  context: { table: string; operation: string },
): Promise<void> {
  const binds = normalizeBinds(params);

  try {
    await db.runAsync(sql, binds);
  } catch (error) {
    logger.error(LogCategory.DATABASE, "SQLite runAsync failed", error, {
      table: context.table,
      operation: context.operation,
      paramCount: binds.length,
      bindTypes: binds.map(describeBindValue),
    });
    throw error;
  }
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
  const params = keys.map((k) => toSQLiteBindValue(row[k]));
  return { sql, params };
}

export class TableAdapter<T = AnyRow> {
  constructor(private table: string) {}

  async put(record: T): Promise<void> {
    const db = await getDb();
    // Filter + serialize BEFORE touching the DB to avoid async issues inside transactions.
    const filtered = await filterToTableColumns(
      this.table,
      record as unknown as AnyRow,
    );
    const serialized = serializeRow(this.table, filtered);
    const { sql, params } = buildInsertOrReplace(this.table, serialized);
    await runSql(db, sql, params, { table: this.table, operation: "put" });
  }

  async bulkPut(records: T[]): Promise<void> {
    if (records.length === 0) return;
    const db = await getDb();
    // Prepare ALL statements before the transaction — no async inside withTransactionAsync.
    const statements: { sql: string; params: Binds }[] = [];
    for (const record of records) {
      const filtered = await filterToTableColumns(
        this.table,
        record as unknown as AnyRow,
      );
      const serialized = serializeRow(this.table, filtered);
      statements.push(buildInsertOrReplace(this.table, serialized));
    }
    await db.withTransactionAsync(async () => {
      for (const { sql, params } of statements) {
        await runSql(db, sql, params, {
          table: this.table,
          operation: "bulkPut",
        });
      }
    });
  }

  async get(id: string | number): Promise<T | undefined> {
    const db = await getDb();
    const row = await db.getFirstAsync<AnyRow>(
      `SELECT * FROM ${this.table} WHERE id = ?`,
      [toSQLiteBindValue(id)],
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
    await runSql(db, `DELETE FROM ${this.table}`, [], {
      table: this.table,
      operation: "clear",
    });
  }

  async delete(id: string | number): Promise<void> {
    const db = await getDb();
    await runSql(db, `DELETE FROM ${this.table} WHERE id = ?`, [id], {
      table: this.table,
      operation: "delete",
    });
  }

  where(field: string) {
    const table = this.table;
    return {
      equals: (value: unknown) => ({
        toArray: async (): Promise<T[]> => {
          const db = await getDb();
          const rows = await db.getAllAsync<AnyRow>(
            `SELECT * FROM ${table} WHERE ${field} = ?`,
            [toSQLiteBindValue(value)],
          );
          return rows.map(
            (r: AnyRow) => deserializeRow(table, r) as unknown as T,
          );
        },
        count: async (): Promise<number> => {
          const db = await getDb();
          const result = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${table} WHERE ${field} = ?`,
            [toSQLiteBindValue(value)],
          );
          return result?.count ?? 0;
        },
        modify: async (changes: Partial<T>): Promise<void> => {
          const db = await getDb();
          const filtered = await filterToTableColumns(table, changes as AnyRow);
          const serialized = serializeRow(table, filtered);
          const keys = Object.keys(serialized);
          if (keys.length === 0) return;
          const setParts = keys.map((k) => `${k} = ?`).join(", ");
          const params: Binds = [
            ...keys.map((k) => toSQLiteBindValue(serialized[k])),
            toSQLiteBindValue(value),
          ];
          await runSql(
            db,
            `UPDATE ${table} SET ${setParts} WHERE ${field} = ?`,
            params,
            { table, operation: "modify" },
          );
        },
        delete: async (): Promise<void> => {
          const db = await getDb();
          await runSql(db, `DELETE FROM ${table} WHERE ${field} = ?`, [value], {
            table,
            operation: "where.delete",
          });
        },
      }),
      above: (value: unknown) => ({
        toArray: async (): Promise<T[]> => {
          const db = await getDb();
          const rows = await db.getAllAsync<AnyRow>(
            `SELECT * FROM ${table} WHERE ${field} > ?`,
            [toSQLiteBindValue(value)],
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
    const rows = await db.getAllAsync<AnyRow>(sql, normalizeBinds(params));
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
