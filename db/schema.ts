/** SPEC 3. 데이터 모델. 로컬 SQLite 하나가 전부다. */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  photo_uri TEXT,
  memo TEXT,
  calories INTEGER,
  taken_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS water (
  date TEXT PRIMARY KEY,
  cups INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  minutes INTEGER,
  memo TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  raw_text TEXT NOT NULL,
  parsed_json TEXT,
  is_active INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  UNIQUE(plan_id, date, item_key)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);
CREATE INDEX IF NOT EXISTS idx_plan_checks_date ON plan_checks(plan_id, date);
`;

/** 첫 실행 시 넣는 기본값 (SPEC 3 마지막 줄) */
export const DEFAULT_SETTINGS: Record<string, string> = {
  water_goal: '8',
  cat_name: '나비',
  reminder_on: '0',
  reminder_meal_time: '12:30',
  reminder_water_time: '15:00',
  workout_goal_minutes: '30',
  fasting_goal_hours: '16',
};
