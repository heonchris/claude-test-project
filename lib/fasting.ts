import { differenceInMinutes } from 'date-fns';
import type { Meal } from '../db/queries';

/**
 * 공복 시간은 따로 버튼을 누르지 않는다.
 * **마지막 식사 기록이 곧 타이머의 시작점**이다. (SPEC 1-2: 기록은 3초 안에)
 */

export const mealTime = (meal: Meal): Date => new Date(meal.taken_at ?? meal.created_at);

export function formatDuration(totalMinutes: number): string {
  const total = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

export type Fasting = {
  /** 마지막으로 먹은 시각. 기록이 하나도 없으면 null */
  since: Date | null;
  minutes: number;
  goalMinutes: number;
  /** 0~1 */
  progress: number;
  reached: boolean;
  remainingMinutes: number;
  /**
   * 마지막 기록이 너무 오래됐다.
   * 굶은 게 아니라 기록을 안 한 것이므로 숫자를 들이밀지 않는다.
   */
  stale: boolean;
};

/** 이 시간을 넘으면 '진짜 공복'이 아니라 '기록이 없는 것'으로 본다 */
const STALE_MINUTES = 36 * 60;

export function computeFasting(lastMeal: Meal | null, goalHours: number, now: Date): Fasting {
  const goalMinutes = Math.max(60, Math.round(goalHours * 60));
  if (!lastMeal) {
    return {
      since: null,
      minutes: 0,
      goalMinutes,
      progress: 0,
      reached: false,
      remainingMinutes: goalMinutes,
      stale: false,
    };
  }
  const since = mealTime(lastMeal);
  const minutes = Math.max(0, differenceInMinutes(now, since));
  return {
    since,
    minutes,
    goalMinutes,
    progress: Math.min(1, minutes / goalMinutes),
    reached: minutes >= goalMinutes,
    remainingMinutes: Math.max(0, goalMinutes - minutes),
    stale: minutes > STALE_MINUTES,
  };
}

/** 그날 첫 끼부터 마지막 끼까지 = 먹은 시간대 */
export type EatingWindow = {
  first: Date;
  last: Date;
  minutes: number;
  count: number;
} | null;

export function eatingWindow(meals: Meal[]): EatingWindow {
  if (!meals.length) return null;
  const times = meals.map(mealTime).sort((a, b) => a.getTime() - b.getTime());
  const first = times[0];
  const last = times[times.length - 1];
  return { first, last, minutes: differenceInMinutes(last, first), count: meals.length };
}

/** 하루를 24시간 가로선으로 볼 때의 위치 (0~1) */
export function dayFraction(date: Date): number {
  return (date.getHours() * 60 + date.getMinutes()) / (24 * 60);
}
