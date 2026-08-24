import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input } from '../../components/Input';
import { Txt } from '../../components/Txt';
import { Button, Card, Divider, SectionTitle } from '../../components/ui';
import { getSettings, listAllPhotoUris, setSetting } from '../../db/queries';
import { importFromFile, shareBackup } from '../../lib/backup';
import { applyReminders } from '../../lib/notify';
import { formatBytes, photoStats, removeOrphanPhotos } from '../../lib/photos';
import { colors, radius, screenPadding, space } from '../../theme/colors';

const MIN_CUPS = 4;
const MAX_CUPS = 15;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  const [catName, setCatName] = useState('나비');
  const [waterGoal, setWaterGoal] = useState(8);
  const [reminderOn, setReminderOn] = useState(false);
  const [mealTime, setMealTime] = useState('12:30');
  const [waterTime, setWaterTime] = useState('15:00');
  const [storage, setStorage] = useState({ count: 0, bytes: 0 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const s = await getSettings();
    setCatName(s.cat_name || '나비');
    setWaterGoal(Number(s.water_goal) || 8);
    setReminderOn(s.reminder_on === '1');
    setMealTime(s.reminder_meal_time || '12:30');
    setWaterTime(s.reminder_water_time || '15:00');
    setStorage(photoStats());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const saveCatName = async () => {
    const name = catName.trim() || '나비';
    setCatName(name);
    await setSetting('cat_name', name);
  };

  const changeGoal = async (next: number) => {
    const clamped = Math.min(MAX_CUPS, Math.max(MIN_CUPS, next));
    setWaterGoal(clamped);
    await setSetting('water_goal', String(clamped));
  };

  const syncReminders = async (next: {
    enabled?: boolean;
    meal?: string;
    water?: string;
  }) => {
    const enabled = next.enabled ?? reminderOn;
    const meal = next.meal ?? mealTime;
    const water = next.water ?? waterTime;

    const ok = await applyReminders({ enabled, mealTime: meal, waterTime: water });
    if (!ok) {
      setReminderOn(false);
      await setSetting('reminder_on', '0');
      Alert.alert('알림 권한이 필요해요', '휴대폰 설정에서 냥집사 알림을 허용해 주세요.');
      return;
    }
    setReminderOn(enabled);
    await setSetting('reminder_on', enabled ? '1' : '0');
    await setSetting('reminder_meal_time', meal);
    await setSetting('reminder_water_time', water);
  };

  const onExport = async () => {
    setBusy(true);
    try {
      const result = await shareBackup();
      if (!result.shared) {
        Alert.alert('저장했어요', `파일 위치: ${result.uri}`);
      }
    } catch {
      Alert.alert('내보내지 못했어요', '잠시 뒤에 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const onImport = () => {
    Alert.alert(
      '지금 기록을 덮어써요',
      '불러오기를 하면 현재 기록이 파일의 내용으로 바뀝니다. 계속할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '불러오기',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const result = await importFromFile();
              if (!result) return;
              if (result.ok) Alert.alert('복원했어요', result.counts);
              else Alert.alert('불러오지 못했어요', result.reason);
            } finally {
              setBusy(false);
              load();
            }
          },
        },
      ]
    );
  };

  const onCleanPhotos = () => {
    Alert.alert('안 쓰는 사진 정리', '기록에서 지운 사진 파일만 삭제해요. 계속할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '정리하기',
        onPress: async () => {
          const rows = await listAllPhotoUris();
          const removed = removeOrphanPhotos(rows.map((r) => r.photo_uri));
          setStorage(photoStats());
          Alert.alert(
            '정리했어요',
            removed > 0 ? `${removed}개를 지웠어요.` : '지울 사진이 없었어요.'
          );
        },
      },
    ]);
  };

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
      <Txt variant="display">설정</Txt>

      <Card>
        <SectionTitle>고양이 이름</SectionTitle>
        <Input
          value={catName}
          onChangeText={setCatName}
          onBlur={saveCatName}
          onSubmitEditing={saveCatName}
          placeholder="나비"
          returnKeyType="done"
          style={styles.nameInput}
        />
      </Card>

      <Card accent={colors.water}>
        <SectionTitle
          right={
            <Txt variant="sub" color={colors.textSub}>
              {waterGoal}컵
            </Txt>
          }
        >
          하루 물 목표
        </SectionTitle>
        <View style={styles.stepper}>
          <Pressable
            onPress={() => changeGoal(waterGoal - 1)}
            disabled={waterGoal <= MIN_CUPS}
            style={({ pressed }) => [
              styles.stepButton,
              waterGoal <= MIN_CUPS && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Txt variant="title" color={colors.text}>
              −
            </Txt>
          </Pressable>
          <Txt variant="display">{waterGoal}</Txt>
          <Pressable
            onPress={() => changeGoal(waterGoal + 1)}
            disabled={waterGoal >= MAX_CUPS}
            style={({ pressed }) => [
              styles.stepButton,
              waterGoal >= MAX_CUPS && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Txt variant="title" color={colors.text}>
              +
            </Txt>
          </Pressable>
        </View>
        <Txt variant="caption" color={colors.textSub}>
          {MIN_CUPS}컵부터 {MAX_CUPS}컵까지 정할 수 있어요
        </Txt>
      </Card>

      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Txt variant="title">기록 알림</Txt>
            <Txt variant="caption" color={colors.textSub}>
              하루 두 번, 조용히 알려드려요
            </Txt>
          </View>
          <Switch
            value={reminderOn}
            onValueChange={(v) => syncReminders({ enabled: v })}
            trackColor={{ true: colors.workout, false: colors.line }}
          />
        </View>

        {reminderOn && (
          <>
            <Divider />
            <View style={styles.timeRow}>
              <Txt variant="body" style={{ flex: 1 }}>
                식사
              </Txt>
              <Input
                value={mealTime}
                onChangeText={setMealTime}
                onBlur={() => syncReminders({ meal: mealTime })}
                placeholder="12:30"
                style={styles.timeInput}
              />
            </View>
            <View style={styles.timeRow}>
              <Txt variant="body" style={{ flex: 1 }}>
                물
              </Txt>
              <Input
                value={waterTime}
                onChangeText={setWaterTime}
                onBlur={() => syncReminders({ water: waterTime })}
                placeholder="15:00"
                style={styles.timeInput}
              />
            </View>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle>기록 백업</SectionTitle>
        <Txt variant="sub" color={colors.textSub}>
          기록은 이 폰 안에만 있어요. 가끔 파일로 내보내 두면 안심이에요.
          (사진 파일은 백업에 담기지 않아요)
        </Txt>
        <View style={{ gap: space(2), marginTop: space(3) }}>
          <Button title="데이터 내보내기" onPress={onExport} disabled={busy} />
          <Button title="데이터 불러오기" tone="quiet" onPress={onImport} disabled={busy} />
        </View>
      </Card>

      <Card>
        <SectionTitle
          right={
            <Txt variant="sub" color={colors.textSub}>
              {storage.count}장 · {formatBytes(storage.bytes)}
            </Txt>
          }
        >
          저장 공간
        </SectionTitle>
        <Button title="안 쓰는 사진 정리" tone="quiet" onPress={onCleanPhotos} />
      </Card>

      <Txt variant="caption" color={colors.textSub} center style={{ marginTop: space(4) }}>
        이 앱은 개인 기록용이에요. 의학적 조언이나 진단을 하지 않아요.{'\n'}
        로그인도 서버도 없고, 기록은 이 폰을 떠나지 않아요.
      </Txt>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: screenPadding, gap: space(3) },
  nameInput: {
    fontSize: 18,
    lineHeight: 26,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: space(2),
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space(2),
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(2),
  },
  timeInput: {
    textAlign: 'right',
    minWidth: 80,
    fontSize: 17,
  },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
});
