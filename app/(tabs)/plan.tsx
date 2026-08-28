import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, ChevronIcon } from '../../components/Icons';
import { Input } from '../../components/Input';
import { Txt } from '../../components/Txt';
import { Button, Card, Divider, SectionTitle } from '../../components/ui';
import {
  activatePlan,
  deletePlan,
  getActivePlan,
  insertPlan,
  listPlanChecks,
  listPlans,
  setSetting,
  syncPlanChecks,
  togglePlanCheck,
  type Plan,
  type PlanCheck,
} from '../../db/queries';
import { todayKey, useToday } from '../../lib/dates';
import {
  itemsForDate,
  parsePlanText,
  planTotalDays,
  readPlan,
  type ParsedPlan,
  type PlanItem,
} from '../../lib/planParser';
import { PLAN_PROMPT } from '../../lib/promptText';
import { colors, radius, screenPadding, space } from '../../theme/colors';

export default function PlanScreen() {
  const today = useToday();
  const insets = useSafeAreaInsets();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [parsed, setParsed] = useState<ParsedPlan | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [checks, setChecks] = useState<PlanCheck[]>([]);
  const [note, setNote] = useState<string | undefined>();
  const [dayNumber, setDayNumber] = useState(0);
  const [past, setPast] = useState<Plan[]>([]);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    const active = await getActivePlan();
    setPlan(active);
    const all = await listPlans();
    setPast(all.filter((p) => !p.is_active));

    if (!active) {
      setParsed(null);
      setItems([]);
      setChecks([]);
      return;
    }
    const p = readPlan(active);
    setParsed(p);
    const t = itemsForDate(active, p, today);
    setItems(t.items);
    setNote(t.note);
    setDayNumber(t.dayNumber);
    setChecks(
      t.items.length
        ? await syncPlanChecks(active.id, today, t.items)
        : await listPlanChecks(active.id, today)
    );
  }, [today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pasteFromClipboard = async () => {
    const clip = await Clipboard.getStringAsync();
    if (!clip.trim()) {
      Alert.alert('클립보드가 비어 있어요', '먼저 챗봇의 답변을 복사해 주세요.');
      return;
    }
    setText(clip);
  };

  const copyPrompt = async () => {
    await Clipboard.setStringAsync(PLAN_PROMPT);
    Alert.alert('복사했어요', '챗봇에 붙여넣고, 조건만 적어서 보내면 돼요.');
  };

  /** 어떤 텍스트든 받아들인다. 파싱 실패는 실패가 아니다. (SPEC 5) */
  const startPlan = async () => {
    const raw = text.trim();
    if (!raw) {
      Alert.alert('내용이 비어 있어요', '플랜 내용을 붙여넣어 주세요.');
      return;
    }
    const p = parsePlanText(raw);

    await insertPlan({
      title: p.title,
      start_date: p.startDate || todayKey(),
      end_date: p.endDate,
      raw_text: raw,
      parsed_json: JSON.stringify(p),
    });

    // 플랜이 목표치를 알려주면 설정에도 반영한다
    if (p.dailyTargets.waterCups && p.dailyTargets.waterCups >= 4 && p.dailyTargets.waterCups <= 15) {
      await setSetting('water_goal', String(Math.round(p.dailyTargets.waterCups)));
    }
    if (p.dailyTargets.workoutMinutes && p.dailyTargets.workoutMinutes > 0) {
      await setSetting('workout_goal_minutes', String(Math.round(p.dailyTargets.workoutMinutes)));
    }

    setText('');
    setPasting(false);
    setExpanded(false);
    load();
  };

  const toggle = async (check: PlanCheck) => {
    await togglePlanCheck(check.id, !check.done);
    load();
  };

  const removePlan = (target: Plan) => {
    Alert.alert('이 플랜을 지울까요?', target.title, [
      { text: '그대로 둘래요', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          await deletePlan(target.id);
          load();
        },
      },
    ]);
  };

  const showPasteView = !plan || pasting;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space(4), paddingBottom: insets.bottom + space(12) },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Txt variant="display">플랜</Txt>

      {showPasteView ? (
        <>
          <Card>
            <Txt variant="sub" color={colors.textSub} style={{ marginBottom: space(2) }}>
              챗봇이 만들어준 계획을 그대로 붙여넣으세요. JSON이 아니어도 괜찮아요.
            </Txt>
            <View style={styles.pasteBox}>
              <Input
                value={text}
                onChangeText={setText}
                placeholder="여기에 붙여넣기"
                multiline
                textAlignVertical="top"
                style={styles.pasteInput}
              />
            </View>
            <View style={{ gap: space(2), marginTop: space(3) }}>
              <Button title="붙여넣은 내용 불러오기" tone="quiet" onPress={pasteFromClipboard} />
              <Button title="이 플랜 시작하기" onPress={startPlan} />
              {!!plan && (
                <Button
                  title="취소"
                  tone="quiet"
                  onPress={() => {
                    setPasting(false);
                    setText('');
                  }}
                />
              )}
            </View>
          </Card>

          <Card>
            <SectionTitle>계획이 아직 없다면</SectionTitle>
            <Txt variant="sub" color={colors.textSub}>
              아래 프롬프트를 복사해서 쓰는 챗봇에 붙여넣고, 내 조건만 적어 보내세요.
              돌아온 답을 그대로 위에 붙여넣으면 끝이에요.
            </Txt>
            <Button
              title="AI에게 보낼 프롬프트 복사"
              tone="quiet"
              onPress={copyPrompt}
              style={{ marginTop: space(3) }}
            />
          </Card>
        </>
      ) : (
        plan && (
          <>
            <Card>
              <Txt variant="title">{plan.title}</Txt>
              <Txt variant="sub" color={colors.textSub} style={{ marginTop: space(1) }}>
                {dayNumber < 1
                  ? `${plan.start_date}부터 시작해요`
                  : plan.end_date && today > plan.end_date
                    ? '이 플랜은 끝났어요. 수고했어요'
                    : parsed && planTotalDays(plan, parsed) > 0
                      ? `${dayNumber}일차 / ${planTotalDays(plan, parsed)}일`
                      : `${dayNumber}일차`}
              </Txt>

              <Divider />

              {items.length === 0 ? (
                <Txt variant="sub" color={colors.textSub}>
                  오늘 해당하는 항목이 없어요.
                </Txt>
              ) : (
                <View style={{ gap: space(1) }}>
                  {checks.map((check) => {
                    const detail = items.find((i) => i.key === check.item_key)?.detail;
                    return (
                      <Pressable
                        key={check.id}
                        onPress={() => toggle(check)}
                        style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
                      >
                        <View style={[styles.checkbox, !!check.done && styles.checkboxOn]}>
                          {!!check.done && <CheckIcon size={14} color={colors.card} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Txt variant="body" color={check.done ? colors.textSub : colors.text}>
                            {check.label}
                          </Txt>
                          {!!detail && (
                            <Txt variant="caption" color={colors.textSub}>
                              {detail}
                            </Txt>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {!!note && (
                <Txt variant="caption" color={colors.textSub} style={{ marginTop: space(2) }}>
                  {note}
                </Txt>
              )}
            </Card>

            <Card>
              <Pressable onPress={() => setExpanded((v) => !v)} style={styles.expandRow}>
                <Txt variant="title">전체 보기</Txt>
                <ChevronIcon direction={expanded ? 'down' : 'right'} color={colors.textSub} />
              </Pressable>
              {expanded && parsed && <PlanFullView parsed={parsed} />}
            </Card>

            <Button title="플랜 교체" tone="quiet" onPress={() => setPasting(true)} />
            <Button title="AI에게 보낼 프롬프트 복사" tone="quiet" onPress={copyPrompt} />
          </>
        )
      )}

      {past.length > 0 && (
        <Card>
          <SectionTitle>지난 플랜</SectionTitle>
          {past.map((p) => (
            <View key={p.id} style={styles.pastRow}>
              <View style={{ flex: 1 }}>
                <Txt variant="body">{p.title}</Txt>
                <Txt variant="caption" color={colors.textSub}>
                  {p.start_date}
                  {p.end_date ? ` ~ ${p.end_date}` : ''}
                </Txt>
              </View>
              <Pressable
                onPress={async () => {
                  await activatePlan(p.id);
                  load();
                }}
                hitSlop={8}
              >
                <Txt variant="sub" color={colors.textSub}>
                  다시 쓰기
                </Txt>
              </Pressable>
              <Pressable onPress={() => removePlan(p)} hitSlop={8}>
                <Txt variant="sub" color={colors.textSub}>
                  삭제
                </Txt>
              </Pressable>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

function PlanFullView({ parsed }: { parsed: ParsedPlan }) {
  if (parsed.lines?.length) {
    return (
      <View style={{ gap: space(1), marginTop: space(3) }}>
        {parsed.lines.map((l, i) => (
          <Txt key={i} variant="sub" color={colors.textSub}>
            {l}
          </Txt>
        ))}
      </View>
    );
  }

  return (
    <View style={{ gap: space(4), marginTop: space(3) }}>
      {parsed.days.map((d, i) => (
        <View key={i} style={{ gap: space(1) }}>
          <Txt variant="bodyBold">{d.day ?? i + 1}일차</Txt>
          {d.meals?.map((m, j) => (
            <Txt key={`m${j}`} variant="sub" color={colors.textSub}>
              {m.type ?? '식사'} · {m.name ?? ''}
              {m.items?.length ? ` (${m.items.join(', ')})` : ''}
            </Txt>
          ))}
          {d.workouts?.map((w, j) => (
            <Txt key={`w${j}`} variant="sub" color={colors.textSub}>
              {w.name ?? '운동'}
              {w.minutes ? ` ${w.minutes}분` : ''}
              {w.detail ? ` · ${w.detail}` : ''}
            </Txt>
          ))}
          {!!d.note && (
            <Txt variant="caption" color={colors.textSub}>
              {d.note}
            </Txt>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: screenPadding, gap: space(3) },
  pasteBox: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.button,
    padding: space(3),
    minHeight: 180,
    backgroundColor: colors.bg,
  },
  pasteInput: { minHeight: 160 },
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
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(4),
    paddingVertical: space(2),
  },
  pressed: { opacity: 0.6 },
});
