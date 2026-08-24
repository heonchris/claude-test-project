import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TrashIcon } from '../../components/Icons';
import { Input } from '../../components/Input';
import { ModalHeader } from '../../components/ModalHeader';
import { Txt } from '../../components/Txt';
import { Button, Card, Chip } from '../../components/ui';
import { deleteWorkout, getWorkout, insertWorkout, updateWorkout } from '../../db/queries';
import { todayKey } from '../../lib/dates';
import { markSaved } from '../../lib/savedSignal';
import { colors, screenPadding, space } from '../../theme/colors';

const PRESETS = ['걷기', '달리기', '헬스', '요가', '홈트', '자전거', '기타'];

export default function WorkoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;

  const [preset, setPreset] = useState<string>('걷기');
  const [custom, setCustom] = useState('');
  const [minutes, setMinutes] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(todayKey());

  useEffect(() => {
    if (editingId == null) return;
    getWorkout(editingId).then((w) => {
      if (!w) return;
      setDate(w.date);
      if (PRESETS.includes(w.name) && w.name !== '기타') {
        setPreset(w.name);
      } else {
        setPreset('기타');
        setCustom(w.name);
      }
      setMinutes(w.minutes != null ? String(w.minutes) : '');
      setMemo(w.memo ?? '');
    });
  }, [editingId]);

  const name = preset === '기타' ? custom.trim() : preset;
  const canSave = name.length > 0;

  const bumpMinutes = (delta: number) => {
    const current = Number(minutes) || 0;
    setMinutes(String(Math.max(0, current + delta)));
  };

  const save = async () => {
    if (!canSave) {
      Alert.alert('운동 종류를 알려주세요', '칩에서 고르거나 직접 적어주세요.');
      return;
    }
    const mins = minutes.trim() ? Math.max(0, Math.round(Number(minutes))) : null;
    const value = {
      name,
      minutes: Number.isFinite(mins as number) ? mins : null,
      memo: memo.trim() || null,
    };

    if (editingId == null) {
      await insertWorkout({ date, ...value });
    } else {
      await updateWorkout(editingId, value);
    }
    markSaved();
    router.back();
  };

  const remove = () => {
    if (editingId == null) return;
    Alert.alert('이 기록을 지울까요?', '', [
      { text: '그대로 둘래요', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          await deleteWorkout(editingId);
          router.back();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ModalHeader
        title={editingId == null ? '운동 기록' : '운동 수정'}
        onSave={save}
        canSave={canSave}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <Txt variant="sub" color={colors.textSub} style={{ marginBottom: space(2) }}>
            종류
          </Txt>
          <View style={styles.chips}>
            {PRESETS.map((p) => (
              <Chip
                key={p}
                label={p}
                selected={preset === p}
                color={colors.workout}
                onPress={() => setPreset(p)}
              />
            ))}
          </View>
          {preset === '기타' && (
            <Input
              value={custom}
              onChangeText={setCustom}
              placeholder="어떤 운동이었나요?"
              style={{ marginTop: space(3) }}
              autoFocus
            />
          )}
        </Card>

        <Card>
          <Txt variant="sub" color={colors.textSub} style={{ marginBottom: space(2) }}>
            시간 (분)
          </Txt>
          <View style={styles.minutesRow}>
            <Input
              value={minutes}
              onChangeText={(t) => setMinutes(t.replace(/[^0-9]/g, ''))}
              placeholder="0"
              keyboardType="number-pad"
              style={styles.minutesInput}
            />
            <Pressable
              onPress={() => bumpMinutes(10)}
              style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
            >
              <Txt variant="sub" color={colors.workout}>
                +10분
              </Txt>
            </Pressable>
            <Pressable
              onPress={() => bumpMinutes(30)}
              style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
            >
              <Txt variant="sub" color={colors.workout}>
                +30분
              </Txt>
            </Pressable>
          </View>
        </Card>

        <Card>
          <Txt variant="sub" color={colors.textSub} style={{ marginBottom: space(2) }}>
            메모 (선택)
          </Txt>
          <Input value={memo} onChangeText={setMemo} placeholder="예: 저녁 식후 동네 한 바퀴" multiline />
        </Card>

        <Button title="저장" color={colors.workout} onPress={save} disabled={!canSave} />

        {editingId != null && (
          <Pressable onPress={remove} style={styles.deleteRow}>
            <TrashIcon size={18} color={colors.textSub} />
            <Txt variant="sub" color={colors.textSub}>
              이 기록 지우기
            </Txt>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: screenPadding, paddingBottom: space(12), gap: space(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  minutesRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  minutesInput: {
    flex: 1,
    fontSize: 22,
    lineHeight: 30,
  },
  quick: {
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    paddingVertical: space(4),
  },
  pressed: { opacity: 0.6 },
});
