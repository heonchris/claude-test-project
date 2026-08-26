import type { Meal, PlanCheck, Workout } from '../db/queries';

export type CatState = 'napping' | 'awake' | 'climbing' | 'top' | 'startled';

export type DaySnapshot = {
  meals: Meal[];
  cups: number;
  waterGoal: number;
  workouts: Workout[];
  workoutGoal: number;
  planChecks: PlanCheck[];
};

export type DayProgress = {
  meal: number;
  water: number;
  workout: number;
  plan: number | null;
  /** 벽을 오르는 높이 = 있는 항목들의 평균 (SPEC 6-2) */
  overall: number;
  /** 오늘 손댄 카테고리 수 (0~3) */
  kinds: number;
  totalRecords: number;
  workoutMinutes: number;
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/** 하루 식단은 3끼를 기준으로 본다. 넘겨도 100%에서 멈춘다. */
const MEAL_TARGET = 3;

export function computeProgress(day: DaySnapshot): DayProgress {
  const workoutMinutes = day.workouts.reduce((sum, w) => sum + (w.minutes ?? 0), 0);

  const meal = clamp01(day.meals.length / MEAL_TARGET);
  const water = clamp01(day.cups / Math.max(1, day.waterGoal));
  const workout = day.workouts.length
    ? clamp01(workoutMinutes > 0 ? workoutMinutes / Math.max(1, day.workoutGoal) : 1)
    : 0;
  const plan = day.planChecks.length
    ? clamp01(day.planChecks.filter((c) => c.done).length / day.planChecks.length)
    : null;

  const parts = [meal, water, workout, ...(plan === null ? [] : [plan])];
  const overall = parts.reduce((a, b) => a + b, 0) / parts.length;

  const kinds =
    (day.meals.length > 0 ? 1 : 0) + (day.cups > 0 ? 1 : 0) + (day.workouts.length > 0 ? 1 : 0);

  return {
    meal,
    water,
    workout,
    plan,
    overall,
    kinds,
    totalRecords: day.meals.length + day.workouts.length + (day.cups > 0 ? 1 : 0),
    workoutMinutes,
  };
}

/** SPEC 6-1. 못 채운 날은 '실패'가 아니라 '낮잠'이다. */
export function catStateFor(p: DayProgress, waterDone: boolean): CatState {
  if (p.totalRecords === 0) return 'napping';
  if (p.kinds >= 3 && waterDone) return 'top';
  if (p.kinds >= 2) return 'climbing';
  return 'awake';
}

const LINES: Record<CatState, string[]> = {
  napping: ['자는 중…', '깨우려면 뭐 하나 남겨봐요', '오늘도 여기 있어요'],
  awake: ['일어났다냥', '뭐 남겼어요?', '좋아요, 시작'],
  climbing: ['올라가는 중', '잘하고 있어요', '조금만 더 올라가 볼까'],
  top: ['꼭대기 도착. 오늘 푹 쉬어요', '오늘은 여기까지. 잘했어요'],
  startled: ['기록했다냥!', '오, 놀랐잖아'],
};

/** 잔소리·재촉·죄책감 주는 대사는 넣지 않는다 (SPEC 6-3). */
export function catLine(
  state: CatState,
  waterDone: boolean,
  seed: number,
  fastingDone = false
): string {
  if (state !== 'top' && fastingDone) return '공복 시간 다 채웠다냥';
  if (state !== 'top' && state !== 'napping' && waterDone) return '물 다 마셨다냥';
  const pool = LINES[state];
  return pool[Math.abs(seed) % pool.length];
}
