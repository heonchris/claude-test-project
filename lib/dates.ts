import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { MealType } from '../db/queries';

export const DATE_KEY = 'yyyy-MM-dd';

export const toKey = (d: Date) => format(d, DATE_KEY);
export const todayKey = () => toKey(new Date());
export const fromKey = (key: string) => parseISO(key);

export const formatKorean = (key: string) => format(fromKey(key), 'M월 d일 (E)', { locale: ko });
export const formatShortDate = (d: Date) => format(d, 'M월 d일', { locale: ko });

/** '오후 12:34' */
export function formatTimeOfDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'a h:mm', { locale: ko });
}
export const formatMonth = (d: Date) => format(d, 'yyyy년 M월', { locale: ko });
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 자정이 지나면 알아서 새 날짜로 바뀐다.
 * (앱을 켜둔 채 날이 바뀌는 경우 + 백그라운드에서 돌아오는 경우 둘 다)
 */
export function useToday(): string {
  const [today, setToday] = useState(todayKey);

  useEffect(() => {
    const tick = () => setToday((prev) => (todayKey() === prev ? prev : todayKey()));
    const timer = setInterval(tick, 30_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  return today;
}

/** 흘러가는 시간을 보여주는 화면용. 기본 1분마다 갱신한다. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [intervalMs]);

  return now;
}

/** 'HH:MM' 문자열을 그 날짜의 시각으로 바꾼다. 형식이 틀리면 null */
export function applyTimeString(base: Date, value: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const next = new Date(base);
  next.setHours(h, min, 0, 0);
  return next;
}

export const toTimeString = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** SPEC 4-2. 현재 시각으로 끼니를 추천하되, 사용자가 바꿀 수 있다. */
export function suggestMealType(now = new Date()): MealType {
  const h = now.getHours();
  if (h < 10) return '아침';
  if (h < 15) return '점심';
  if (h < 21) return '저녁';
  return '간식';
}
