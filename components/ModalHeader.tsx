import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloseIcon } from './Icons';
import { Txt } from './Txt';
import { colors, screenPadding, space } from '../theme/colors';

export function ModalHeader({
  title,
  onSave,
  saveLabel = '저장',
  canSave = true,
}: {
  title: string;
  onSave?: () => void;
  saveLabel?: string;
  canSave?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <CloseIcon color={colors.textSub} />
      </Pressable>
      <Txt variant="title">{title}</Txt>
      {onSave ? (
        <Pressable onPress={onSave} disabled={!canSave} hitSlop={10}>
          <Txt variant="bodyBold" color={canSave ? colors.text : colors.line}>
            {saveLabel}
          </Txt>
        </Pressable>
      ) : (
        <View style={{ width: 22 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingBottom: space(3),
    backgroundColor: colors.bg,
  },
});
