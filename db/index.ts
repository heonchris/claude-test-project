import * as SQLite from 'expo-sqlite';
import { DEFAULT_SETTINGS, SCHEMA_SQL } from './schema';

const DB_NAME = 'catlog.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(SCHEMA_SQL);
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.runAsync('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', key, value);
  }
  return db;
}

/** 어디서든 이걸로 DB를 얻는다. 최초 1회만 열고 스키마를 만든다. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

/** 앱 시작 시 한 번 (app/_layout.tsx) */
export async function initDb(): Promise<void> {
  await getDb();
}

/** 데이터 불러오기(복원) 후처럼 통째로 비울 때 */
export async function wipeAll(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM meals;
    DELETE FROM water;
    DELETE FROM workouts;
    DELETE FROM plan_checks;
    DELETE FROM plans;
  `);
}
