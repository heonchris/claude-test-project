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
import { suggestMealType, todayKey } from '../../lib/dates';
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

  useEffect(() => {
    if (editingId == null) return;
    getMeal(editingId).then((meal) => {
      if (!meal) return;
      setPhotoUri(meal.photo_uri);
      setOriginalPhoto(meal.photo_uri);
      setMealType(meal.meal_type);
      setMemo(meal.memo ?? '');
      setDate(meal.date);
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
    };
    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets?.length) {
      setPhotoUri(result.assets[0].uri);
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

      if (editingId == null) {
        await insertMeal({
          date,
          meal_type: mealType,
          photo_uri: storedUri,
          memo: memo.trim() || null,
          calories: cleanCalories,
        });
      } else {
        await updateMeal(editingId, {
          meal_type: mealType,
          memo: memo.trim() || null,
          calories: cleanCalories,
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

        <Txt variant="caption" color={colors.textSub} center>
          사진 없이 메모만 남겨도 괜찮아요
        </Txt>

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
