import * as SQLite from "expo-sqlite";
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from "@/database/schema";
import { logger, LogCategory } from "@/services/logger";

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  _db = await SQLite.openDatabaseAsync("AccesControlDB.db");

  // Run migrations based on user_version pragma
  const result = await _db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    logger.info(LogCategory.DATABASE, `Migrating DB from v${currentVersion} to v${SCHEMA_VERSION}`);
    await _db.execAsync(CREATE_TABLES_SQL);
    await _db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    logger.info(LogCategory.DATABASE, `DB migration complete`);
  }

  return _db;
}

export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.closeAsync();
    _db = null;
  }
}
