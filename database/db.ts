import * as SQLite from "expo-sqlite";
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from "@/database/schema";
import { logger, LogCategory } from "@/services/logger";

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (_dbPromise) return _dbPromise;

  _dbPromise = openAndMigrateDb()
    .then((db) => {
      _db = db;
      return db;
    })
    .catch((error) => {
      _db = null;
      logger.error(LogCategory.DATABASE, "getDb: init failed", error);
      throw error;
    })
    .finally(() => {
      _dbPromise = null;
    });

  return _dbPromise;
}

async function openAndMigrateDb(): Promise<SQLite.SQLiteDatabase> {
  try {
    logger.info(LogCategory.DATABASE, "getDb: opening SQLite");
    const db = await SQLite.openDatabaseAsync("AccesControlDB.db");

    const result = await db.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version",
    );
    const currentVersion = result?.user_version ?? 0;

    if (currentVersion < SCHEMA_VERSION) {
      logger.info(
        LogCategory.DATABASE,
        `Migrating DB from v${currentVersion} to v${SCHEMA_VERSION}`,
      );
      await db.execAsync(CREATE_TABLES_SQL);

      if (currentVersion < 2) {
        try {
          await db.execAsync(
            `ALTER TABLE condominiums ADD COLUMN visitor_photo_enabled INTEGER NOT NULL DEFAULT 1`,
          );
        } catch {
          // Column already exists (fresh install via CREATE TABLE)
        }
      }

      await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      logger.info(LogCategory.DATABASE, `DB migration complete`);
    }

    return db;
  } catch (error) {
    throw error;
  }
}

export async function closeDb(): Promise<void> {
  const db = _db ?? (await _dbPromise?.catch(() => null));
  _db = null;
  _dbPromise = null;
  await db?.closeAsync();
}
