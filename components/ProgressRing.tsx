import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Txt } from './Txt';
import { colors, space } from '../theme/colors';

/** SPEC 4-1. 오늘의 링 3개 - 식단 / 물 / 운동 */
export function ProgressRing({
  progress,
  color,
  label,
  value,
  size = 68,
}: {
  progress: number;
  color: string;
  label: string;
  value: string;
  size?: number;
}) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));

  return (
    <View style={styles.wrap}>
      <View>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.line}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - p)}
            fill="none"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Txt variant="sub" color={colors.text}>
            {value}
          </Txt>
        </View>
      </View>
      <Txt variant="caption" color={colors.textSub}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space(1.5) },
  center: { alignItems: 'center', justifyContent: 'center' },
});
