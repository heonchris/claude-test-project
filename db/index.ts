import * as SQLite from 'expo-sqlite';
import { DEFAULT_SETTINGS, SCHEMA_SQL } from './schema';

const DB_NAME = 'catlog.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * 이미 쓰고 있는 폰의 DB를 새 스키마에 맞춰 올린다.
 * 기록은 절대 지우지 않는다. 열마다 있는지 확인하고 없을 때만 추가한다.
 */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(meals)');
  if (!columns.some((c) => c.name === 'taken_at')) {
    await db.execAsync('ALTER TABLE meals ADD COLUMN taken_at TEXT');
    // 예전 기록은 저장한 시각을 찍은 시각으로 본다
    await db.execAsync('UPDATE meals SET taken_at = created_at WHERE taken_at IS NULL');
  }
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(SCHEMA_SQL);
  await migrate(db);
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
