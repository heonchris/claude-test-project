import { differenceInCalendarDays } from 'date-fns';
import type { Plan } from '../db/queries';
import { fromKey, todayKey } from './dates';

/* ------------------------------ 타입 ------------------------------ */

export type PlanMeal = { type?: string; name?: string; items?: string[] };
export type PlanWorkout = { name?: string; minutes?: number; detail?: string };
export type PlanDay = {
  day?: number;
  meals?: PlanMeal[];
  workouts?: PlanWorkout[];
  note?: string;
};

export type ParsedPlan = {
  title: string;
  startDate: string;
  endDate: string | null;
  dailyTargets: { waterCups?: number; workoutMinutes?: number };
  days: PlanDay[];
  /** JSON 파싱에 실패해서 줄 단위로 담아둔 경우 */
  lines?: string[];
};

export type PlanItem = { key: string; label: string; detail?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const dateStr = (v: unknown): string | undefined => {
  const s = str(v);
  return s && DATE_RE.test(s) ? s : undefined;
};

/* ----------------------------- 파싱 ----------------------------- */

/** 코드블록 표시나 앞뒤 설명이 섞여 있어도 JSON만 뽑아본다. */
function extractJson(raw: string): unknown | null {
  const cleaned = raw
    .replace(/^﻿/, '')
    .replace(/```(?:json)?/gi, '')
    .trim();

  const candidates = [cleaned];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // 다음 후보로
    }
  }
  return null;
}

function normalizeDay(raw: unknown, index: number): PlanDay {
  const o = (raw ?? {}) as Record<string, unknown>;
  const meals = Array.isArray(o.meals)
    ? o.meals.map((m) => {
        const mm = (m ?? {}) as Record<string, unknown>;
        return {
          type: str(mm.type),
          name: str(mm.name),
          items: Array.isArray(mm.items)
            ? mm.items.map((i) => str(i)).filter((i): i is string => !!i)
            : undefined,
        };
      })
    : undefined;

  const workouts = Array.isArray(o.workouts)
    ? o.workouts.map((w) => {
        const ww = (w ?? {}) as Record<string, unknown>;
        return { name: str(ww.name), minutes: num(ww.minutes), detail: str(ww.detail) };
      })
    : undefined;

  return { day: num(o.day) ?? index + 1, meals, workouts, note: str(o.note) };
}

/**
 * SPEC 5. JSON이면 구조화해서, 아니면 줄 단위로.
 * **어떤 입력이든 거절하지 않는다.** 최악의 경우에도 원문은 그대로 남는다.
 */
export function parsePlanText(raw: string): ParsedPlan {
  const today = todayKey();
  const json = extractJson(raw);

  if (json) {
    const o = json as Record<string, unknown>;
    const targets = (o.dailyTargets ?? {}) as Record<string, unknown>;
    const days = Array.isArray(o.days) ? o.days.map(normalizeDay) : [];
    if (days.length) {
      return {
        title: str(o.title) ?? '붙여넣은 플랜',
        startDate: dateStr(o.startDate) ?? today,
        endDate: dateStr(o.endDate) ?? null,
        dailyTargets: {
          waterCups: num(targets.waterCups),
          workoutMinutes: num(targets.workoutMinutes),
        },
        days,
      };
    }
  }

  // 구조화 실패 → 줄 단위 체크리스트로
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').replace(/^\s*\[\s*[xX ]?\s*\]\s*/, '').trim())
    .filter((l) => l.length > 0);

  return {
    title: lines[0]?.slice(0, 40) ?? '붙여넣은 플랜',
    startDate: today,
    endDate: null,
    dailyTargets: {},
    days: [],
    lines: lines.length ? lines : ['(내용 없음)'],
  };
}

/* --------------------------- 저장된 플랜 --------------------------- */

export function readPlan(plan: Plan): ParsedPlan {
  if (plan.parsed_json) {
    try {
      const p = JSON.parse(plan.parsed_json) as ParsedPlan;
      if (p && Array.isArray(p.days)) return p;
    } catch {
      // 아래 줄 단위 처리로
    }
  }
  const fallback = parsePlanText(plan.raw_text);
  return { ...fallback, title: plan.title, startDate: plan.start_date, endDate: plan.end_date };
}

/** 오늘이 플랜의 몇 일차인지 (1부터). 시작 전이면 0 이하. */
export function planDayNumber(plan: Plan, dateKey: string): number {
  return differenceInCalendarDays(fromKey(dateKey), fromKey(plan.start_date)) + 1;
}

/** 전체 일수. endDate가 있으면 그 길이, 없으면 days 개수. */
export function planTotalDays(plan: Plan, parsed: ParsedPlan): number {
  if (plan.end_date) {
    return differenceInCalendarDays(fromKey(plan.end_date), fromKey(plan.start_date)) + 1;
  }
  return parsed.days.length || 0;
}

/** SPEC 5-1. days가 7개만 와도 7일 주기로 반복 적용한다. */
export function dayForDate(parsed: ParsedPlan, dayNumber: number): PlanDay | null {
  if (!parsed.days.length || dayNumber < 1) return null;
  const exact = parsed.days.find((d) => d.day === dayNumber);
  if (exact) return exact;
  const idx = (dayNumber - 1) % parsed.days.length;
  return parsed.days[idx] ?? null;
}

/** 그날 체크할 항목들. 없는 필드는 조용히 건너뛴다. */
export function itemsForDate(
  plan: Plan,
  parsed: ParsedPlan,
  dateKey: string
): { items: PlanItem[]; note?: string; dayNumber: number } {
  const dayNumber = planDayNumber(plan, dateKey);

  if (parsed.lines?.length) {
    // 줄 단위 플랜은 매일 같은 목록을 보여준다
    return {
      items: parsed.lines.map((label, i) => ({ key: `line-${i}`, label })),
      dayNumber,
    };
  }

  if (dayNumber < 1) return { items: [], dayNumber };
  if (plan.end_date && dateKey > plan.end_date) return { items: [], dayNumber };

  const day = dayForDate(parsed, dayNumber);
  if (!day) return { items: [], dayNumber };

  const items: PlanItem[] = [];

  day.meals?.forEach((m, i) => {
    const type = m.type ?? `식사 ${i + 1}`;
    const name = m.name ?? '';
    items.push({
      key: `meal-${m.type ?? i}`,
      label: name ? `${type} · ${name}` : type,
      detail: m.items?.length ? m.items.join(', ') : undefined,
    });
  });

  day.workouts?.forEach((w, i) => {
    const name = w.name ?? `운동 ${i + 1}`;
    items.push({
      key: `workout-${i}`,
      label: w.minutes ? `${name} ${w.minutes}분` : name,
      detail: w.detail,
    });
  });

  return { items, note: day.note, dayNumber };
}
