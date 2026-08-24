import { getDb } from './index';

export type MealType = '아침' | '점심' | '저녁' | '간식';
export const MEAL_TYPES: MealType[] = ['아침', '점심', '저녁', '간식'];

export type Meal = {
  id: number;
  date: string;
  meal_type: MealType;
  photo_uri: string | null;
  memo: string | null;
  calories: number | null;
  created_at: string;
};

export type Workout = {
  id: number;
  date: string;
  name: string;
  minutes: number | null;
  memo: string | null;
  created_at: string;
};

export type Plan = {
  id: number;
  title: string;
  start_date: string;
  end_date: string | null;
  raw_text: string;
  parsed_json: string | null;
  is_active: number;
  created_at: string;
};

export type PlanCheck = {
  id: number;
  plan_id: number;
  date: string;
  item_key: string;
  label: string;
  done: number;
};

const nowIso = () => new Date().toISOString();

/* ------------------------------- 설정 ------------------------------- */

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function getSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string | null }>(
    'SELECT key, value FROM settings'
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value ?? '';
  return out;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/* ------------------------------- 식단 ------------------------------- */

export async function listMeals(date: string): Promise<Meal[]> {
  const db = await getDb();
  return db.getAllAsync<Meal>(
    'SELECT * FROM meals WHERE date = ? ORDER BY created_at ASC, id ASC',
    date
  );
}

export async function insertMeal(input: {
  date: string;
  meal_type: MealType;
  photo_uri?: string | null;
  memo?: string | null;
  calories?: number | null;
}): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    'INSERT INTO meals (date, meal_type, photo_uri, memo, calories, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    input.date,
    input.meal_type,
    input.photo_uri ?? null,
    input.memo ?? null,
    input.calories ?? null,
    nowIso()
  );
  return res.lastInsertRowId;
}

export async function getMeal(id: number): Promise<Meal | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Meal>('SELECT * FROM meals WHERE id = ?', id);
  return row ?? null;
}

export async function updateMeal(
  id: number,
  patch: {
    meal_type?: MealType;
    memo?: string | null;
    calories?: number | null;
    photo_uri?: string | null;
  }
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.meal_type !== undefined) (fields.push('meal_type = ?'), values.push(patch.meal_type));
  if (patch.photo_uri !== undefined) (fields.push('photo_uri = ?'), values.push(patch.photo_uri));
  if (patch.memo !== undefined) (fields.push('memo = ?'), values.push(patch.memo));
  if (patch.calories !== undefined) (fields.push('calories = ?'), values.push(patch.calories));
  if (!fields.length) return;
  values.push(id);
  await db.runAsync(`UPDATE meals SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteMeal(id: number): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ photo_uri: string | null }>(
    'SELECT photo_uri FROM meals WHERE id = ?',
    id
  );
  await db.runAsync('DELETE FROM meals WHERE id = ?', id);
  return row?.photo_uri ?? null;
}

/* -------------------------------- 물 -------------------------------- */

export async function getWaterCups(date: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cups: number }>(
    'SELECT cups FROM water WHERE date = ?',
    date
  );
  return row?.cups ?? 0;
}

export async function setWaterCups(date: string, cups: number): Promise<number> {
  const db = await getDb();
  const safe = Math.max(0, Math.round(cups));
  await db.runAsync(
    'INSERT INTO water (date, cups) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET cups = excluded.cups',
    date,
    safe
  );
  return safe;
}

export async function addWaterCup(date: string, delta: number): Promise<number> {
  const current = await getWaterCups(date);
  return setWaterCups(date, current + delta);
}

/* ------------------------------- 운동 ------------------------------- */

export async function listWorkouts(date: string): Promise<Workout[]> {
  const db = await getDb();
  return db.getAllAsync<Workout>(
    'SELECT * FROM workouts WHERE date = ? ORDER BY created_at ASC, id ASC',
    date
  );
}

export async function insertWorkout(input: {
  date: string;
  name: string;
  minutes?: number | null;
  memo?: string | null;
}): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    'INSERT INTO workouts (date, name, minutes, memo, created_at) VALUES (?, ?, ?, ?, ?)',
    input.date,
    input.name,
    input.minutes ?? null,
    input.memo ?? null,
    nowIso()
  );
  return res.lastInsertRowId;
}

export async function updateWorkout(
  id: number,
  patch: { name?: string; minutes?: number | null; memo?: string | null }
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.name !== undefined) (fields.push('name = ?'), values.push(patch.name));
  if (patch.minutes !== undefined) (fields.push('minutes = ?'), values.push(patch.minutes));
  if (patch.memo !== undefined) (fields.push('memo = ?'), values.push(patch.memo));
  if (!fields.length) return;
  values.push(id);
  await db.runAsync(`UPDATE workouts SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function getWorkout(id: number): Promise<Workout | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = ?', id);
  return row ?? null;
}

export async function deleteWorkout(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM workouts WHERE id = ?', id);
}

/* ------------------------------- 플랜 ------------------------------- */

export async function getActivePlan(): Promise<Plan | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Plan>(
    'SELECT * FROM plans WHERE is_active = 1 ORDER BY id DESC LIMIT 1'
  );
  return row ?? null;
}

export async function listPlans(): Promise<Plan[]> {
  const db = await getDb();
  return db.getAllAsync<Plan>('SELECT * FROM plans ORDER BY is_active DESC, id DESC');
}

export async function insertPlan(input: {
  title: string;
  start_date: string;
  end_date: string | null;
  raw_text: string;
  parsed_json: string | null;
}): Promise<number> {
  const db = await getDb();
  await db.runAsync('UPDATE plans SET is_active = 0');
  const res = await db.runAsync(
    'INSERT INTO plans (title, start_date, end_date, raw_text, parsed_json, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    input.title,
    input.start_date,
    input.end_date,
    input.raw_text,
    input.parsed_json,
    nowIso()
  );
  return res.lastInsertRowId;
}

export async function activatePlan(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE plans SET is_active = 0');
  await db.runAsync('UPDATE plans SET is_active = 1 WHERE id = ?', id);
}

export async function deletePlan(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM plan_checks WHERE plan_id = ?', id);
  await db.runAsync('DELETE FROM plans WHERE id = ?', id);
}

/* ---------------------------- 플랜 체크 ---------------------------- */

/** 오늘 항목을 만들어 두고(없으면), 저장된 체크 상태와 함께 돌려준다. */
export async function syncPlanChecks(
  planId: number,
  date: string,
  items: { key: string; label: string }[]
): Promise<PlanCheck[]> {
  const db = await getDb();
  for (const item of items) {
    await db.runAsync(
      'INSERT OR IGNORE INTO plan_checks (plan_id, date, item_key, label, done) VALUES (?, ?, ?, ?, 0)',
      planId,
      date,
      item.key,
      item.label
    );
    await db.runAsync(
      'UPDATE plan_checks SET label = ? WHERE plan_id = ? AND date = ? AND item_key = ?',
      item.label,
      planId,
      date,
      item.key
    );
  }
  const keys = items.map((i) => i.key);
  const rows = await db.getAllAsync<PlanCheck>(
    'SELECT * FROM plan_checks WHERE plan_id = ? AND date = ? ORDER BY id ASC',
    planId,
    date
  );
  // 플랜이 교체돼 사라진 항목은 화면에서 뺀다 (기록 자체는 남겨둔다)
  return keys.length ? rows.filter((r) => keys.includes(r.item_key)) : rows;
}

export async function listPlanChecks(planId: number, date: string): Promise<PlanCheck[]> {
  const db = await getDb();
  return db.getAllAsync<PlanCheck>(
    'SELECT * FROM plan_checks WHERE plan_id = ? AND date = ? ORDER BY id ASC',
    planId,
    date
  );
}

export async function togglePlanCheck(id: number, done: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE plan_checks SET done = ? WHERE id = ?', done ? 1 : 0, id);
}

/* ------------------------- 달력 / 통계용 ------------------------- */

export type DayMarks = { meal: boolean; water: boolean; workout: boolean };

export async function getMarksBetween(
  from: string,
  to: string
): Promise<Record<string, DayMarks>> {
  const db = await getDb();
  const out: Record<string, DayMarks> = {};
  const touch = (date: string): DayMarks =>
    (out[date] ??= { meal: false, water: false, workout: false });

  const meals = await db.getAllAsync<{ date: string }>(
    'SELECT DISTINCT date FROM meals WHERE date BETWEEN ? AND ?',
    from,
    to
  );
  for (const r of meals) touch(r.date).meal = true;

  const waters = await db.getAllAsync<{ date: string }>(
    'SELECT date FROM water WHERE date BETWEEN ? AND ? AND cups > 0',
    from,
    to
  );
  for (const r of waters) touch(r.date).water = true;

  const workouts = await db.getAllAsync<{ date: string }>(
    'SELECT DISTINCT date FROM workouts WHERE date BETWEEN ? AND ?',
    from,
    to
  );
  for (const r of workouts) touch(r.date).workout = true;

  return out;
}

export type WeekPoint = { date: string; cups: number; minutes: number; meals: number };

export async function getRangeSummary(from: string, to: string): Promise<Record<string, WeekPoint>> {
  const db = await getDb();
  const out: Record<string, WeekPoint> = {};
  const touch = (date: string): WeekPoint =>
    (out[date] ??= { date, cups: 0, minutes: 0, meals: 0 });

  const waters = await db.getAllAsync<{ date: string; cups: number }>(
    'SELECT date, cups FROM water WHERE date BETWEEN ? AND ?',
    from,
    to
  );
  for (const r of waters) touch(r.date).cups = r.cups;

  const workouts = await db.getAllAsync<{ date: string; minutes: number | null }>(
    'SELECT date, SUM(COALESCE(minutes, 0)) AS minutes FROM workouts WHERE date BETWEEN ? AND ? GROUP BY date',
    from,
    to
  );
  for (const r of workouts) touch(r.date).minutes = r.minutes ?? 0;

  const meals = await db.getAllAsync<{ date: string; c: number }>(
    'SELECT date, COUNT(*) AS c FROM meals WHERE date BETWEEN ? AND ? GROUP BY date',
    from,
    to
  );
  for (const r of meals) touch(r.date).meals = r.c;

  return out;
}

export async function listMealsBetween(from: string, to: string): Promise<Meal[]> {
  const db = await getDb();
  return db.getAllAsync<Meal>(
    'SELECT * FROM meals WHERE date BETWEEN ? AND ? ORDER BY date DESC, created_at DESC',
    from,
    to
  );
}

export async function listAllPhotoUris(): Promise<{ id: number; date: string; photo_uri: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ id: number; date: string; photo_uri: string }>(
    "SELECT id, date, photo_uri FROM meals WHERE photo_uri IS NOT NULL AND photo_uri <> '' ORDER BY date ASC"
  );
}

/* --------------------------- 내보내기/복원 --------------------------- */

export type Backup = {
  app: 'cat-health';
  version: 1;
  exportedAt: string;
  meals: Meal[];
  water: { date: string; cups: number }[];
  workouts: Workout[];
  plans: Plan[];
  plan_checks: PlanCheck[];
  settings: { key: string; value: string | null }[];
};

export async function exportAll(): Promise<Backup> {
  const db = await getDb();
  return {
    app: 'cat-health',
    version: 1,
    exportedAt: nowIso(),
    meals: await db.getAllAsync<Meal>('SELECT * FROM meals ORDER BY id'),
    water: await db.getAllAsync<{ date: string; cups: number }>('SELECT * FROM water ORDER BY date'),
    workouts: await db.getAllAsync<Workout>('SELECT * FROM workouts ORDER BY id'),
    plans: await db.getAllAsync<Plan>('SELECT * FROM plans ORDER BY id'),
    plan_checks: await db.getAllAsync<PlanCheck>('SELECT * FROM plan_checks ORDER BY id'),
    settings: await db.getAllAsync<{ key: string; value: string | null }>('SELECT * FROM settings'),
  };
}

/** 복원. 사진 파일은 백업에 담기지 않으므로 경로가 살아있는 것만 다시 보인다. */
export async function importAll(backup: Backup): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync(
      'DELETE FROM meals; DELETE FROM water; DELETE FROM workouts; DELETE FROM plan_checks; DELETE FROM plans;'
    );
    for (const m of backup.meals ?? []) {
      await db.runAsync(
        'INSERT INTO meals (id, date, meal_type, photo_uri, memo, calories, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        m.id,
        m.date,
        m.meal_type,
        m.photo_uri ?? null,
        m.memo ?? null,
        m.calories ?? null,
        m.created_at ?? nowIso()
      );
    }
    for (const w of backup.water ?? []) {
      await db.runAsync('INSERT INTO water (date, cups) VALUES (?, ?)', w.date, w.cups);
    }
    for (const w of backup.workouts ?? []) {
      await db.runAsync(
        'INSERT INTO workouts (id, date, name, minutes, memo, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        w.id,
        w.date,
        w.name,
        w.minutes ?? null,
        w.memo ?? null,
        w.created_at ?? nowIso()
      );
    }
    for (const p of backup.plans ?? []) {
      await db.runAsync(
        'INSERT INTO plans (id, title, start_date, end_date, raw_text, parsed_json, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        p.id,
        p.title,
        p.start_date,
        p.end_date ?? null,
        p.raw_text,
        p.parsed_json ?? null,
        p.is_active ?? 0,
        p.created_at ?? nowIso()
      );
    }
    for (const c of backup.plan_checks ?? []) {
      await db.runAsync(
        'INSERT INTO plan_checks (id, plan_id, date, item_key, label, done) VALUES (?, ?, ?, ?, ?, ?)',
        c.id,
        c.plan_id,
        c.date,
        c.item_key,
        c.label,
        c.done ?? 0
      );
    }
    for (const s of backup.settings ?? []) {
      await db.runAsync(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        s.key,
        s.value ?? null
      );
    }
  });
}
