import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraIcon, ImageIcon, TrashIcon } from '../../components/Icons';
import { Input } from '../../components/Input';
import { ModalHeader } from '../../components/ModalHeader';
import { Txt } from '../../components/Txt';
import { Button, Card, Chip } from '../../components/ui';
import {
  deleteMeal,
  getMeal,
  insertMeal,
  updateMeal,
  MEAL_TYPES,
  type MealType,
} from '../../db/queries';
import { formatShortDate, formatTimeOfDay, suggestMealType, toKey, todayKey } from '../../lib/dates';
import { takenAtFromExif } from '../../lib/exif';
import { deletePhoto, savePhoto } from '../../lib/photos';
import { markSaved } from '../../lib/savedSignal';
import { colors, radius, screenPadding, space } from '../../theme/colors';

/** SPEC 4-2. 사진이 없어도 저장된다. 칼로리는 언제나 선택. */
export default function MealScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [originalPhoto, setOriginalPhoto] = useState<string | null>(null);
  const [mealType, setMealType] = useState<MealType>(suggestMealType());
  const [memo, setMemo] = useState('');
  const [calories, setCalories] = useState('');
  const [showCalories, setShowCalories] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(todayKey());
  /** 사진을 찍은 시각. 사진이 없거나 정보가 없으면 저장할 때 현재 시각으로 채운다. */
  const [takenAt, setTakenAt] = useState<Date | null>(null);
  /** 어제 찍은 사진이면 그날 기록으로 넣을지 */
  const [useTakenDate, setUseTakenDate] = useState(true);

  useEffect(() => {
    if (editingId == null) return;
    getMeal(editingId).then((meal) => {
      if (!meal) return;
      setPhotoUri(meal.photo_uri);
      setOriginalPhoto(meal.photo_uri);
      setMealType(meal.meal_type);
      setMemo(meal.memo ?? '');
      setDate(meal.date);
      setTakenAt(meal.taken_at ? new Date(meal.taken_at) : null);
      if (meal.calories != null) {
        setCalories(String(meal.calories));
        setShowCalories(true);
      }
    });
  }, [editingId]);

  const pick = async (from: 'camera' | 'library') => {
    const permission =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        '권한이 필요해요',
        from === 'camera'
          ? '사진을 찍으려면 카메라 접근을 허용해 주세요.'
          : '앨범에서 고르려면 사진 접근을 허용해 주세요.'
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
      exif: true, // 찍은 시각을 읽기 위해
    };
    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets?.length) {
      const asset = result.assets[0];
      setPhotoUri(asset.uri);

      // 사진에 찍힌 시각이 있으면 그 시각을 쓰고, 끼니도 그 시각 기준으로 추천한다
      const shot = takenAtFromExif(asset.exif) ?? (from === 'camera' ? new Date() : null);
      setTakenAt(shot);
      if (shot && editingId == null) {
        setMealType(suggestMealType(shot));
        setUseTakenDate(true);
      }
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const photoChanged = photoUri !== originalPhoto;
      let storedUri = originalPhoto;

      if (photoChanged) {
        storedUri = photoUri ? await savePhoto(photoUri) : null;
      }

      const kcal = calories.trim() ? Number(calories.trim()) : null;
      const cleanCalories = kcal != null && Number.isFinite(kcal) ? Math.round(kcal) : null;

      const when = takenAt ?? new Date();
      const targetDate = shiftDate ? toKey(when) : date;

      if (editingId == null) {
        await insertMeal({
          date: targetDate,
          meal_type: mealType,
          photo_uri: storedUri,
          memo: memo.trim() || null,
          calories: cleanCalories,
          taken_at: when.toISOString(),
        });
      } else {
        await updateMeal(editingId, {
          meal_type: mealType,
          memo: memo.trim() || null,
          calories: cleanCalories,
          date: targetDate,
          taken_at: when.toISOString(),
          ...(photoChanged ? { photo_uri: storedUri } : {}),
        });
        if (photoChanged && originalPhoto) deletePhoto(originalPhoto);
      }

      markSaved();
      router.back();
    } catch {
      Alert.alert('저장하지 못했어요', '사진이 너무 크거나 저장 공간이 부족할 수 있어요.');
      setSaving(false);
    }
  };

  /** 사진이 오늘 것이 아니면 어느 날짜로 남길지 물어본다 */
  const takenDateKey = takenAt ? toKey(takenAt) : null;
  const isOtherDay = !!takenDateKey && takenDateKey !== date;
  const shiftDate = isOtherDay && useTakenDate;

  const remove = () => {
    if (editingId == null) return;
    Alert.alert('이 기록을 지울까요?', '', [
      { text: '그대로 둘래요', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          const photo = await deleteMeal(editingId);
          deletePhoto(photo);
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
        title={editingId == null ? '식단 기록' : '식단 수정'}
        onSave={save}
        canSave={!saving}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {photoUri ? (
          <Pressable onPress={() => pick('library')} style={styles.previewWrap}>
            <Image source={{ uri: photoUri }} style={styles.preview} />
            <Pressable onPress={() => setPhotoUri(null)} style={styles.previewClear} hitSlop={8}>
              <TrashIcon size={18} color={colors.card} />
            </Pressable>
          </Pressable>
        ) : (
          <View style={styles.pickRow}>
            <Pressable
              onPress={() => pick('camera')}
              style={({ pressed }) => [styles.pickButton, pressed && styles.pressed]}
            >
              <CameraIcon size={28} color={colors.meal} />
              <Txt variant="bodyBold">사진 찍기</Txt>
            </Pressable>
            <Pressable
              onPress={() => pick('library')}
              style={({ pressed }) => [styles.pickButton, pressed && styles.pressed]}
            >
              <ImageIcon size={28} color={colors.meal} />
              <Txt variant="bodyBold">앨범에서 고르기</Txt>
            </Pressable>
          </View>
        )}

        {takenAt ? (
          <Txt variant="caption" color={colors.textSub} center>
            {formatShortDate(takenAt)} {formatTimeOfDay(takenAt.toISOString())}에 찍은 사진
          </Txt>
        ) : (
          <Txt variant="caption" color={colors.textSub} center>
            사진 없이 메모만 남겨도 괜찮아요
          </Txt>
        )}

        {isOtherDay && (
          <Card>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyBold">{formatShortDate(takenAt!)} 기록으로 남기기</Txt>
                <Txt variant="caption" color={colors.textSub}>
                  끄면 오늘({date}) 기록이 됩니다
                </Txt>
              </View>
              <Switch
                value={useTakenDate}
                onValueChange={setUseTakenDate}
                trackColor={{ true: colors.meal, false: colors.line }}
              />
            </View>
          </Card>
        )}

        <Card>
          <Txt variant="sub" color={colors.textSub} style={{ marginBottom: space(2) }}>
            끼니
          </Txt>
          <View style={styles.chips}>
            {MEAL_TYPES.map((t) => (
              <Chip
                key={t}
                label={t}
                selected={mealType === t}
                color={colors.meal}
                onPress={() => setMealType(t)}
              />
            ))}
          </View>
        </Card>

        <Card>
          <Txt variant="sub" color={colors.textSub} style={{ marginBottom: space(2) }}>
            메모 (선택)
          </Txt>
          <Input
            value={memo}
            onChangeText={setMemo}
            placeholder="예: 회사 앞 김치찌개"
            style={styles.input}
            multiline
          />
        </Card>

        <Card>
          <Pressable onPress={() => setShowCalories((v) => !v)}>
            <Txt variant="sub" color={colors.textSub}>
              칼로리 (선택) {showCalories ? '−' : '+'}
            </Txt>
          </Pressable>
          {showCalories && (
            <Input
              value={calories}
              onChangeText={setCalories}
              placeholder="비워둬도 괜찮아요"
                keyboardType="number-pad"
              style={[styles.input, { marginTop: space(2) }]}
            />
          )}
        </Card>

        <Button
          title={saving ? '저장하는 중…' : '저장'}
          color={colors.meal}
          onPress={save}
          disabled={saving}
        />
        {saving && <ActivityIndicator color={colors.meal} />}

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
  pickRow: { flexDirection: 'row', gap: space(3) },
  pickButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: space(7),
    alignItems: 'center',
    gap: space(2),
  },
  previewWrap: { position: 'relative' },
  preview: {
    width: '100%',
    height: 260,
    borderRadius: radius.card,
    backgroundColor: colors.card,
  },
  previewClear: {
    position: 'absolute',
    right: space(3),
    top: space(3),
    backgroundColor: 'rgba(61,55,51,0.6)',
    borderRadius: radius.chip,
    padding: space(2),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  input: {
    fontSize: 15,
    color: colors.text,
    minHeight: 24,
    padding: 0,
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
