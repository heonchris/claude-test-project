import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddSheet, type AddKind } from '../../components/AddSheet';
import { CatWall } from '../../components/CatWall';
import { FastingCard } from '../../components/FastingCard';
import { CheckIcon, PlusIcon, TrashIcon } from '../../components/Icons';
import { Photo } from '../../components/Photo';
import { ProgressRing } from '../../components/ProgressRing';
import { Txt } from '../../components/Txt';
import { WaterCups } from '../../components/WaterCups';
import { Button, Card, EmptyHint, SectionTitle } from '../../components/ui';
import { addWaterCup, deleteMeal, togglePlanCheck, type Meal } from '../../db/queries';
import { formatKorean, formatTimeOfDay, useNow, useToday } from '../../lib/dates';
import { computeFasting } from '../../lib/fasting';
import { deletePhoto } from '../../lib/photos';
import {
  catLine,
  catStateFor,
  REACTION_LINE,
  type RecordKind,
} from '../../lib/progress';
import type { CatPose } from '../../lib/catArt';
import { consumeSaved } from '../../lib/savedSignal';
import { colors, radius, screenPadding, shadow, space } from '../../theme/colors';
import { useDayData } from '../../hooks/useDayData';

export default function TodayScreen() {
  const today = useToday();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const day = useDayData(today);
  const now = useNow();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewing, setViewing] = useState<Meal | null>(null);
  const [focused, setFocused] = useState(true);
  /** 잠깐 스쳐가는 반응 자세. 없으면 오늘 상태 그대로 보여준다. */
  const [reaction, setReaction] = useState<{ pose: CatPose; line: string } | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  /** 저장 직전에 오늘이 비어 있었는지 (자다가 일어나는 연출용) */
  const wasEmptyRef = useRef(true);

  /**
   * SPEC 6-1. 저장 직후 짧게 반응한다.
   * 자고 있다가 첫 기록이면 기지개를 먼저 켠다.
   */
  const react = useCallback(
    (kind: RecordKind) => {
      const pose: CatPose =
        kind === 'meal'
          ? 'eating'
          : kind === 'water'
            ? 'drinking'
            : kind === 'workout'
              ? 'running'
              : 'startled';
      const line = REACTION_LINE[kind];

      clearTimers();
      if (wasEmptyRef.current) {
        setReaction({ pose: 'stretching', line: '이제 일어났다냥' });
        timers.current.push(setTimeout(() => setReaction({ pose, line }), 700));
        timers.current.push(setTimeout(() => setReaction(null), 2300));
      } else {
        setReaction({ pose, line });
        timers.current.push(setTimeout(() => setReaction(null), 1600));
      }
    },
    [clearTimers]
  );

  useEffect(() => clearTimers, [clearTimers]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      const kind = consumeSaved();
      if (kind) react(kind);
      return () => setFocused(false);
    }, [react])
  );

  const { progress, snapshot } = day;
  const waterDone = snapshot.cups >= snapshot.waterGoal && snapshot.waterGoal > 0;
  const fasting = computeFasting(day.lastMeal, day.fastingGoalHours, now);
  const baseState = catStateFor(progress, waterDone);
  const pose: CatPose = reaction?.pose ?? baseState;
  const line =
    reaction?.line ??
    catLine(baseState, waterDone, snapshot.meals.length + snapshot.cups, fasting.reached);

  // 다음 저장 때 '기지개'를 켤지 판단하려고 현재 상태를 기억해 둔다
  useEffect(() => {
    if (!reaction) wasEmptyRef.current = progress.totalRecords === 0;
  }, [reaction, progress.totalRecords]);

  const changeWater = async (delta: number) => {
    if (delta > 0) react('water');
    await addWaterCup(today, delta);
    day.reload();
  };

  const onPick = (kind: AddKind) => {
    setSheetOpen(false);
    if (kind === 'meal') router.push('/add/meal');
    else if (kind === 'workout') router.push('/add/workout');
    else changeWater(1);
  };

  const removeMeal = (meal: Meal) => {
    Alert.alert('이 기록을 지울까요?', '', [
      { text: '그대로 둘래요', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          const photo = await deleteMeal(meal.id);
          deletePhoto(photo);
          setViewing(null);
          day.reload();
        },
      },
    ]);
  };

  const toggleCheck = async (id: number, done: boolean) => {
    if (done) react('plan');
    await togglePlanCheck(id, done);
    day.reload();
  };

  const wallHeight = Math.round(screenHeight * 0.35);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space(3), paddingBottom: insets.bottom + space(24) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Txt variant="sub" color={colors.textSub} style={{ marginBottom: space(2) }}>
          {formatKorean(today)}
        </Txt>

        <CatWall
          pose={pose}
          animate={focused}
          progress={progress.overall}
          line={line}
          dots={{
            meal: snapshot.meals.length > 0,
            water: snapshot.cups > 0,
            workout: snapshot.workouts.length > 0,
          }}
          height={wallHeight}
        />

        {/* 오늘의 링 3개 */}
        <View style={styles.rings}>
          <ProgressRing
            progress={progress.meal}
            color={colors.meal}
            label="식단"
            value={`${snapshot.meals.length}끼`}
          />
          <ProgressRing
            progress={progress.water}
            color={colors.water}
            label="물"
            value={`${snapshot.cups}컵`}
          />
          <ProgressRing
            progress={progress.workout}
            color={colors.workout}
            label="운동"
            value={`${progress.workoutMinutes}분`}
          />
        </View>

        {/* 공복 - 식사 기록이 곧 타이머다 */}
        <FastingCard fasting={fasting} />

        {/* 물 */}
        <Card accent={colors.water} style={styles.section}>
          <SectionTitle
            right={
              <Txt variant="caption" color={colors.textSub}>
                {snapshot.cups} / {snapshot.waterGoal}컵
              </Txt>
            }
          >
            물
          </SectionTitle>
          <WaterCups
            cups={snapshot.cups}
            goal={snapshot.waterGoal}
            onAdd={() => changeWater(1)}
            onRemove={() => changeWater(-1)}
          />
          <Txt variant="caption" color={colors.textSub} style={{ marginTop: space(2) }}>
            컵을 누르면 한 잔, 길게 누르면 취소돼요
          </Txt>
        </Card>

        {/* 식단 */}
        <Card accent={colors.meal} style={styles.section}>
          <SectionTitle>오늘 먹은 것</SectionTitle>
          {snapshot.meals.length === 0 ? (
            <EmptyHint
              text={day.loading ? ' ' : '아직 비어 있어요. 첫 끼를 남겨볼까요?'}
              action={
                <Button
                  title="식단 추가"
                  color={colors.meal}
                  onPress={() => router.push('/add/meal')}
                />
              }
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.thumbRow}>
                {snapshot.meals.map((meal) => (
                  <Pressable
                    key={meal.id}
                    onPress={() => setViewing(meal)}
                    style={({ pressed }) => [styles.thumb, pressed && styles.pressed]}
                  >
                    <Photo
                      stored={meal.photo_uri}
                      style={[styles.thumbImage, styles.thumbEmpty]}
                      fallbackText={meal.memo?.slice(0, 18) || undefined}
                    />
                    <Txt variant="caption">{meal.meal_type}</Txt>
                    <Txt variant="caption" color={colors.textSub}>
                      {formatTimeOfDay(meal.taken_at ?? meal.created_at)}
                    </Txt>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => router.push('/add/meal')}
                  style={({ pressed }) => [styles.thumbAdd, pressed && styles.pressed]}
                >
                  <PlusIcon color={colors.textSub} />
                </Pressable>
              </View>
            </ScrollView>
          )}
        </Card>

        {/* 운동 */}
        <Card accent={colors.workout} style={styles.section}>
          <SectionTitle>오늘 운동</SectionTitle>
          {snapshot.workouts.length === 0 ? (
            <EmptyHint
              text={day.loading ? ' ' : '오늘은 아직 조용하네요.'}
              action={
                <Button
                  title="운동 추가"
                  color={colors.workout}
                  onPress={() => router.push('/add/workout')}
                />
              }
            />
          ) : (
            <View style={{ gap: space(2) }}>
              {snapshot.workouts.map((w) => (
                <Pressable
                  key={w.id}
                  onPress={() =>
                    router.push({ pathname: '/add/workout', params: { id: String(w.id) } })
                  }
                  style={({ pressed }) => [styles.workoutRow, pressed && styles.pressed]}
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
              ))}
            </View>
          )}
        </Card>

        {/* 오늘의 플랜 - 플랜이 없으면 이 섹션 자체를 숨긴다 */}
        {day.plan && day.planChecks.length > 0 && (
          <Card style={styles.section}>
            <SectionTitle
              right={
                <Txt variant="caption" color={colors.textSub}>
                  {day.planTotal > 0 ? `${day.planDay}일차 / ${day.planTotal}일` : `${day.planDay}일차`}
                </Txt>
              }
            >
              오늘의 플랜
            </SectionTitle>
            <View style={{ gap: space(1) }}>
              {day.planChecks.map((check) => (
                <Pressable
                  key={check.id}
                  onPress={() => toggleCheck(check.id, !check.done)}
                  style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
                >
                  <View style={[styles.checkbox, !!check.done && styles.checkboxOn]}>
                    {!!check.done && <CheckIcon size={14} color={colors.card} />}
                  </View>
                  <Txt
                    variant="body"
                    color={check.done ? colors.textSub : colors.text}
                    style={{ flex: 1 }}
                  >
                    {check.label}
                  </Txt>
                </Pressable>
              ))}
            </View>
            {!!day.planNote && (
              <Txt variant="caption" color={colors.textSub} style={{ marginTop: space(2) }}>
                {day.planNote}
              </Txt>
            )}
          </Card>
        )}
      </ScrollView>

      {/* 플로팅 + 버튼 */}
      <Pressable
        onPress={() => setSheetOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + space(4) },
          pressed && styles.pressed,
        ]}
      >
        <PlusIcon color={colors.card} size={26} />
      </Pressable>

      <AddSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onPick={onPick} />

      {/* 사진 크게 보기 */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewing(null)}>
          <View style={styles.viewerCard}>
            {viewing?.photo_uri ? (
              <Photo
                stored={viewing.photo_uri}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            ) : null}
            <View style={styles.viewerInfo}>
              <Txt variant="bodyBold">
                {viewing?.meal_type}
                {'  '}
                <Txt variant="sub" color={colors.textSub}>
                  {formatTimeOfDay(viewing?.taken_at ?? viewing?.created_at)}
                </Txt>
              </Txt>
              {!!viewing?.memo && (
                <Txt variant="sub" color={colors.textSub}>
                  {viewing.memo}
                </Txt>
              )}
              {viewing?.calories != null && (
                <Txt variant="caption" color={colors.textSub}>
                  {viewing.calories} kcal
                </Txt>
              )}
              <View style={styles.viewerActions}>
                <Pressable
                  onPress={() => {
                    const target = viewing;
                    setViewing(null);
                    if (target)
                      router.push({ pathname: '/add/meal', params: { id: String(target.id) } });
                  }}
                >
                  <Txt variant="sub" color={colors.textSub}>
                    수정
                  </Txt>
                </Pressable>
                <Pressable onPress={() => viewing && removeMeal(viewing)}>
                  <TrashIcon size={20} color={colors.textSub} />
                </Pressable>
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: screenPadding, gap: space(3) },
  rings: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: space(4),
    ...shadow,
  },
  section: {},
  thumbRow: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start' },
  thumb: { alignItems: 'center', gap: space(1) },
  thumbImage: {
    width: 84,
    height: 84,
    borderRadius: radius.button,
    backgroundColor: colors.bg,
  },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', padding: space(2) },
  thumbAdd: {
    width: 84,
    height: 84,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutRow: {
    paddingVertical: space(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(2),
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.text, borderColor: colors.text },
  fab: {
    position: 'absolute',
    right: screenPadding,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    shadowOpacity: 0.12,
    elevation: 4,
  },
  pressed: { opacity: 0.6 },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(61,55,51,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: screenPadding,
  },
  viewerCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  viewerImage: { width: '100%', height: 320, backgroundColor: colors.bg },
  viewerInfo: { padding: space(4), gap: space(1) },
  viewerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space(5),
    marginTop: space(2),
  },
});
