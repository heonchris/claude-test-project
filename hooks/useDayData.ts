import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getActivePlan,
  getSettings,
  getWaterCups,
  listMeals,
  listWorkouts,
  syncPlanChecks,
  type Plan,
  type PlanCheck,
} from '../db/queries';
import { itemsForDate, planTotalDays, readPlan, type PlanItem } from '../lib/planParser';
import { computeProgress, type DayProgress, type DaySnapshot } from '../lib/progress';

export type DayData = {
  snapshot: DaySnapshot;
  progress: DayProgress;
  plan: Plan | null;
  planItems: PlanItem[];
  planChecks: PlanCheck[];
  planNote?: string;
  planDay: number;
  planTotal: number;
  catName: string;
  loading: boolean;
};

const EMPTY: DaySnapshot = {
  meals: [],
  cups: 0,
  waterGoal: 8,
  workouts: [],
  workoutGoal: 30,
  planChecks: [],
};

/** 오늘 화면이 쓰는 하루치 데이터. 화면에 다시 들어올 때마다 새로 읽는다. */
export function useDayData(dateKey: string) {
  const [data, setData] = useState<DayData>(() => ({
    snapshot: EMPTY,
    progress: computeProgress(EMPTY),
    plan: null,
    planItems: [],
    planChecks: [],
    planDay: 0,
    planTotal: 0,
    catName: '나비',
    loading: true,
  }));

  const load = useCallback(async () => {
    const settings = await getSettings();
    const waterGoal = Number(settings.water_goal) || 8;
    const workoutGoal = Number(settings.workout_goal_minutes) || 30;

    const [meals, cups, workouts, plan] = await Promise.all([
      listMeals(dateKey),
      getWaterCups(dateKey),
      listWorkouts(dateKey),
      getActivePlan(),
    ]);

    let planItems: PlanItem[] = [];
    let planChecks: PlanCheck[] = [];
    let planNote: string | undefined;
    let planDay = 0;
    let planTotal = 0;

    if (plan) {
      const parsed = readPlan(plan);
      const today = itemsForDate(plan, parsed, dateKey);
      planItems = today.items;
      planNote = today.note;
      planDay = today.dayNumber;
      planTotal = planTotalDays(plan, parsed);
      if (planItems.length) {
        planChecks = await syncPlanChecks(plan.id, dateKey, planItems);
      }
    }

    const snapshot: DaySnapshot = { meals, cups, waterGoal, workouts, workoutGoal, planChecks };
    setData({
      snapshot,
      progress: computeProgress(snapshot),
      plan,
      planItems,
      planChecks,
      planNote,
      planDay,
      planTotal,
      catName: settings.cat_name || '나비',
      loading: false,
    });
  }, [dateKey]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      load().catch(() => {
        if (alive) setData((d) => ({ ...d, loading: false }));
      });
      return () => {
        alive = false;
      };
    }, [load])
  );

  return { ...data, reload: load, setData };
}
