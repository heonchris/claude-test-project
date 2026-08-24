import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Txt } from './Txt';
import { colors, radius, shadow, space } from '../theme/colors';

export function Card({
  children,
  style,
  accent,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 카테고리 색은 정보다. 카드 테두리에서도 같은 색을 쓴다. */
  accent?: string;
}) {
  return (
    <View
      style={[
        styles.card,
        accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Txt variant="title">{children}</Txt>
      {right}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color = colors.text,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: color, borderColor: color },
        pressed && styles.pressed,
      ]}
    >
      <Txt variant="sub" color={selected ? colors.card : colors.textSub}>
        {label}
      </Txt>
    </Pressable>
  );
}

type ButtonProps = PressableProps & {
  title: string;
  tone?: 'primary' | 'quiet';
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, tone = 'primary', color, style, ...rest }: ButtonProps) {
  const bg = tone === 'primary' ? (color ?? colors.text) : colors.card;
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg },
        tone === 'quiet' && styles.buttonQuiet,
        pressed && styles.pressed,
        rest.disabled && styles.disabled,
        style,
      ]}
    >
      <Txt variant="bodyBold" color={tone === 'primary' ? colors.card : colors.text}>
        {title}
      </Txt>
    </Pressable>
  );
}

export function EmptyHint({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Txt variant="sub" color={colors.textSub} center>
        {text}
      </Txt>
      {action}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: space(4),
    ...shadow,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space(2),
  },
  chip: {
    paddingHorizontal: space(3.5),
    paddingVertical: space(2),
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  button: {
    borderRadius: radius.button,
    paddingVertical: space(3.5),
    paddingHorizontal: space(5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonQuiet: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  empty: {
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(5),
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: space(3),
  },
});
