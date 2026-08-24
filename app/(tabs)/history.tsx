import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronIcon, TrashIcon } from '../../components/Icons';
import { Txt } from '../../components/Txt';
import { Card, EmptyHint, SectionTitle } from '../../components/ui';
import {
  deleteMeal,
  deleteWorkout,
  getMarksBetween,
  getRangeSummary,
  getSettings,
  getWaterCups,
  listMeals,
  listMealsBetween,
  listWorkouts,
  type DayMarks,
  type Meal,
  type WeekPoint,
  type Workout,
} from '../../db/queries';
import {
  formatKorean,
  formatMonth,
  formatTimeOfDay,
  fromKey,
  toKey,
  todayKey,
  WEEKDAYS,
} from '../../lib/dates';
import { deletePhoto } from '../../lib/photos';
import { colors, radius, screenPadding, space } from '../../theme/colors';

type Mode = 'month' | 'week';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('month');
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [marks, setMarks] = useState<Record<string, DayMarks>>({});
  const [selected, setSelected] = useState(todayKey());

  const [meals, setMeals] = useState<Meal[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [cups, setCups] = useState(0);
  const [waterGoal, setWaterGoal] = useState(8);

  const [week, setWeek] = useState<WeekPoint[]>([]);
  const [weekMeals, setWeekMeals] = useState<Meal[]>([]);

  const loadMonth = useCallback(async () => {
    const from = toKey(subDays(startOfMonth(cursor), 7));
    const to = toKey(addDays(endOfMonth(cursor), 7));
    setMarks(await getMarksBetween(from, to));
  }, [cursor]);

  const loadDay = useCallback(async (dateKey: string) => {
    const settings = await getSettings();
    setWaterGoal(Number(settings.water_goal) || 8);
    setMeals(await listMeals(dateKey));
    setWorkouts(await listWorkouts(dateKey));
    setCups(await getWaterCups(dateKey));
  }, []);

  const loadWeek = useCallback(async () => {
    const today = new Date();
    const from = toKey(subDays(today, 6));
    const to = toKey(today);
    const summary = await getRangeSummary(from, to);
    const points = eachDayOfInterval({ start: subDays(today, 6), end: today }).map((d) => {
      const key = toKey(d);
      return summary[key] ?? { date: key, cups: 0, minutes: 0, meals: 0 };
    });
    setWeek(points);
    setWeekMeals((await listMealsBetween(from, to)).filter((m) => !!m.photo_uri));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMonth();
      loadDay(selected);
      loadWeek();
    }, [loadMonth, loadDay, loadWeek, selected])
  );

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }),
    end: addDays(startOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }), 6),
  });

  const removeMeal = (meal: Meal) => {
    Alert.alert('이 기록을 지울까요?', '', [
      { text: '그대로 둘래요', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          const photo = await deleteMeal(meal.id);
          deletePhoto(photo);
          loadDay(selected);
          loadMonth();
          loadWeek();
        },
      },
    ]);
  };

  const removeWorkout = (workout: Workout) => {
    Alert.alert('이 기록을 지울까요?', workout.name, [
      { text: '그대로 둘래요', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          await deleteWorkout(workout.id);
          loadDay(selected);
          loadMonth();
          loadWeek();
        },
      },
    ]);
  };

  const maxCups = Math.max(waterGoal, ...week.map((w) => w.cups), 1);
  const maxMinutes = Math.max(30, ...week.map((w) => w.minutes), 1);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space(4), paddingBottom: insets.bottom + space(12) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Txt variant="display">기록</Txt>
        <View style={styles.toggle}>
          {(['month', 'week'] as Mode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.toggleItem, mode === m && styles.toggleItemOn]}
            >
              <Txt variant="caption" color={mode === m ? colors.card : colors.textSub}>
                {m === 'month' ? '달력' : '주간'}
              </Txt>
            </Pressable>
          ))}
        </View>
      </View>

      {mode === 'month' ? (
        <>
          <Card>
            <View style={styles.monthRow}>
              <Pressable onPress={() => setCursor(addMonths(cursor, -1))} hitSlop={10}>
                <ChevronIcon direction="left" color={colors.textSub} />
              </Pressable>
              <Txt variant="title">{formatMonth(cursor)}</Txt>
              <Pressable onPress={() => setCursor(addMonths(cursor, 1))} hitSlop={10}>
                <ChevronIcon direction="right" color={colors.textSub} />
              </Pressable>
            </View>

            <View style={styles.weekHeader}>
              {WEEKDAYS.map((w) => (
                <Txt key={w} variant="caption" color={colors.textSub} center style={styles.cell}>
                  {w}
                </Txt>
              ))}
            </View>

            <View style={styles.grid}>
              {days.map((d) => {
                const key = toKey(d);
                const mark = marks[key];
                const inMonth = isSameMonth(d, cursor);
                const isSelected = key === selected;
                const isToday = key === todayKey();
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      setSelected(key);
                      loadDay(key);
                    }}
                    style={styles.cell}
                  >
                    <View style={[styles.dayBox, isSelected && styles.dayBoxOn]}>
                      <Txt
                        variant="sub"
                        color={
                          isSelected
                            ? colors.card
                            : inMonth
                              ? colors.text
                              : colors.line
                        }
                      >
                        {d.getDate()}
                      </Txt>
                      {isToday && !isSelected && <View style={styles.todayDot} />}
                    </View>
                    <View style={styles.markRow}>
                      <Mark on={!!mark?.meal} color={colors.meal} />
                      <Mark on={!!mark?.water} color={colors.water} />
                      <Mark on={!!mark?.workout} color={colors.workout} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card>
            <SectionTitle>{formatKorean(selected)}</SectionTitle>

            {meals.length === 0 && workouts.length === 0 && cups === 0 ? (
              <EmptyHint text="이 날은 조용히 지나갔어요." />
            ) : (
              <View style={{ gap: space(4) }}>
                {cups > 0 && (
                  <View>
                    <Txt variant="sub" color={colors.textSub}>
                      물 {cups}컵 / {waterGoal}컵
                    </Txt>
                  </View>
                )}

                {meals.length > 0 && (
                  <View>
                    <Txt variant="sub" color={colors.textSub} style={{ marginBottom: space(2) }}>
                      식단 {meals.length}개
                    </Txt>
                    <View style={styles.photoGrid}>
                      {meals.map((m) => (
                        <Pressable
                          key={m.id}
                          onPress={() =>
                            router.push({ pathname: '/add/meal', params: { id: String(m.id) } })
                          }
                          onLongPress={() => removeMeal(m)}
                          style={styles.gridItem}
                        >
                          {m.photo_uri ? (
                            <Image source={{ uri: m.photo_uri }} style={styles.gridImage} />
                          ) : (
                            <View style={[styles.gridImage, styles.gridEmpty]}>
                              <Txt variant="caption" color={colors.textSub} center>
                                {m.memo?.slice(0, 20) || '메모 없음'}
                              </Txt>
                            </View>
                          )}
                          <Txt variant="caption">{m.meal_type}</Txt>
                          <Txt variant="caption" color={colors.textSub}>
                            {formatTimeOfDay(m.taken_at ?? m.created_at)}
                          </Txt>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {workouts.length > 0 && (
                  <View>
                    <Txt variant="sub" color={colors.textSub} style={{ marginBottom: space(2) }}>
                      운동
                    </Txt>
                    {workouts.map((w) => (
                      <View key={w.id} style={styles.workoutRow}>
                        <Pressable
                          style={{ flex: 1 }}
                          onPress={() =>
                            router.push({ pathname: '/add/workout', params: { id: String(w.id) } })
                          }
                        >
                          <Txt variant="body">
                            {w.name}
                            {w.minutes ? ` ${w.minutes}분` : ''}
                          </Txt>
                          {!!w.memo && (
                            <Txt variant="caption" color={colors.textSub}>
                              {w.memo}
                            </Txt>
                          )}
                        </Pressable>
                        <Pressable onPress={() => removeWorkout(w)} hitSlop={8}>
                          <TrashIcon size={18} color={colors.textSub} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            <Txt variant="caption" color={colors.textSub} style={{ marginTop: space(3) }}>
              사진을 누르면 수정, 길게 누르면 삭제돼요
            </Txt>
          </Card>
        </>
      ) : (
        <>
          <Card accent={colors.water}>
            <SectionTitle>최근 7일 물</SectionTitle>
            <BarChart
              points={week}
              value={(p) => p.cups}
              max={maxCups}
              color={colors.water}
              unit="컵"
            />
          </Card>

          <Card accent={colors.workout}>
            <SectionTitle>최근 7일 운동</SectionTitle>
            <BarChart
              points={week}
              value={(p) => p.minutes}
              max={maxMinutes}
              color={colors.workout}
              unit="분"
            />
          </Card>

          <Card accent={colors.meal}>
            <SectionTitle>최근 7일 식단</SectionTitle>
            {weekMeals.length === 0 ? (
              <EmptyHint text="이번 주 사진은 아직 없어요." />
            ) : (
              <View style={styles.photoGrid}>
                {weekMeals.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() =>
                      router.push({ pathname: '/add/meal', params: { id: String(m.id) } })
                    }
                    style={styles.gridItem}
                  >
                    <Image source={{ uri: m.photo_uri! }} style={styles.gridImage} />
                  </Pressable>
                ))}
              </View>
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function Mark({ on, color }: { on: boolean; color: string }) {
  return <View style={[styles.mark, { backgroundColor: on ? color : 'transparent' }]} />;
}

function BarChart({
  points,
  value,
  max,
  color,
  unit,
}: {
  points: WeekPoint[];
  value: (p: WeekPoint) => number;
  max: number;
  color: string;
  unit: string;
}) {
  return (
    <View style={styles.chart}>
      {points.map((p) => {
        const v = value(p);
        const h = Math.max(3, (v / max) * 90);
        return (
          <View key={p.date} style={styles.barColumn}>
            <Txt variant="caption" color={colors.textSub}>
              {v > 0 ? `${v}${unit}` : ''}
            </Txt>
            <View style={[styles.bar, { height: h, backgroundColor: v > 0 ? color : colors.line }]} />
            <Txt variant="caption" color={colors.textSub}>
              {WEEKDAYS[fromKey(p.date).getDay()]}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: screenPadding, gap: space(3) },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.chip,
    padding: 3,
  },
  toggleItem: {
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderRadius: radius.chip,
  },
  toggleItemOn: { backgroundColor: colors.text },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space(3),
  },
  weekHeader: { flexDirection: 'row' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: space(1) },
  dayBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBoxOn: { backgroundColor: colors.text },
  todayDot: {
    position: 'absolute',
    bottom: 2,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textSub,
  },
  markRow: { flexDirection: 'row', gap: 3, height: 6, marginTop: 1 },
  mark: { width: 4, height: 4, borderRadius: 2 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  gridItem: { alignItems: 'center', gap: 2 },
  gridImage: {
    width: 88,
    height: 88,
    borderRadius: radius.button,
    backgroundColor: colors.bg,
  },
  gridEmpty: { alignItems: 'center', justifyContent: 'center', padding: space(2) },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
  },
  barColumn: { alignItems: 'center', gap: space(1), flex: 1 },
  bar: { width: 18, borderRadius: 9 },
});
