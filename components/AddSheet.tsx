import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Txt';
import { BowlIcon, DropIcon, ShoeIcon } from './Icons';
import { colors, radius, space, screenPadding } from '../theme/colors';

export type AddKind = 'meal' | 'workout' | 'water';

/** SPEC 4-2. + 를 누르면 세 갈래. */
export function AddSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (kind: AddKind) => void;
}) {
  const insets = useSafeAreaInsets();

  const options: { kind: AddKind; label: string; hint: string; color: string; icon: React.ReactNode }[] = [
    { kind: 'meal', label: '식단', hint: '사진 한 장이면 충분해요', color: colors.meal, icon: <BowlIcon color={colors.meal} size={24} /> },
    { kind: 'workout', label: '운동', hint: '종류와 시간만', color: colors.workout, icon: <ShoeIcon color={colors.workout} size={24} /> },
    { kind: 'water', label: '물 한 컵', hint: '바로 한 컵 추가', color: colors.water, icon: <DropIcon color={colors.water} size={24} /> },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space(4) }]}>
        <View style={styles.handle} />
        <Txt variant="title" style={{ marginBottom: space(3) }}>
          무엇을 남길까요?
        </Txt>
        {options.map((o) => (
          <Pressable
            key={o.kind}
            onPress={() => onPick(o.kind)}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}
          >
            <View style={[styles.iconBox, { backgroundColor: `${o.color}22` }]}>{o.icon}</View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyBold">{o.label}</Txt>
              <Txt variant="caption" color={colors.textSub}>
                {o.hint}
              </Txt>
            </View>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,55,51,0.25)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card + 8,
    borderTopRightRadius: radius.card + 8,
    paddingHorizontal: screenPadding,
    paddingTop: space(3),
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: space(4),
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(3),
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
