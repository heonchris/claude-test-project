import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, space } from '../theme/colors';

/** SPEC 4-1. 탭하면 채워지고, 길게 누르면 하나 취소된다. */
export function WaterCups({
  cups,
  goal,
  onAdd,
  onRemove,
}: {
  cups: number;
  goal: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const total = Math.max(goal, cups);
  return (
    <View style={styles.row}>
      {Array.from({ length: total }, (_, i) => (
        <Pressable
          key={i}
          onPress={onAdd}
          onLongPress={onRemove}
          hitSlop={4}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Cup filled={i < cups} />
        </Pressable>
      ))}
    </View>
  );
}

function Cup({ filled }: { filled: boolean }) {
  return (
    <Svg width={26} height={30} viewBox="0 0 26 30">
      <Path
        d="M4 4 H22 L19.5 26 A2 2 0 0 1 17.5 27.6 H8.5 A2 2 0 0 1 6.5 26 Z"
        fill={filled ? colors.water : 'transparent'}
        stroke={filled ? colors.water : colors.line}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(2),
    alignItems: 'center',
  },
  pressed: { opacity: 0.6 },
});
