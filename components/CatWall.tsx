import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Cat, CAT_ASPECT, type CatPose } from './Cat';
import { Txt } from './Txt';
import { colors, radius, shadow, space } from '../theme/colors';

/**
 * SPEC 6-2. 오늘의 벽 오르기.
 * 세로로 긴 흰 벽을 달성률만큼 올라가고, 지나온 자리에 발톱 자국이 남는다.
 * 바닥은 '실패'가 아니라 '낮잠'이다. X표시·빨간색·흐린 처리 금지.
 */

type Props = {
  pose: CatPose;
  /** 0~1 */
  progress: number;
  line: string;
  dots: { meal: boolean; water: boolean; workout: boolean };
  height: number;
  /** 화면을 보고 있을 때만 고양이를 움직인다 */
  animate?: boolean;
};

const FLOOR_PADDING = 10;
const TOP_PADDING = 12;

export function CatWall({ pose, progress, line, dots, height, animate = true }: Props) {
  const [wall, setWall] = useState({ width: 0, height: 0 });
  const catWidth = Math.min(150, Math.max(96, wall.width * 0.42));
  const catHeight = catWidth * CAT_ASPECT;
  const travel = Math.max(0, wall.height - catHeight - FLOOR_PADDING - TOP_PADDING);
  const target = travel * (1 - Math.max(0, Math.min(1, progress)));

  const translateY = useRef(new Animated.Value(target)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: target,
      friction: 7,
      tension: 34,
      useNativeDriver: true,
    }).start();
  }, [target, translateY]);

  return (
    <View style={[styles.card, { height }]}>
      <View
        style={styles.wall}
        onLayout={(e) =>
          setWall({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
        }
      >
        {wall.height > 0 && (
          <ClawTrail
            width={wall.width}
            height={wall.height}
            fromY={wall.height - FLOOR_PADDING - 18}
            toY={TOP_PADDING + target + catHeight * 0.3}
          />
        )}

        <Animated.View
          style={[
            styles.catHolder,
            { top: TOP_PADDING, transform: [{ translateY }] },
          ]}
        >
          <Cat pose={pose} width={catWidth} animate={animate} />
        </Animated.View>

        <View style={styles.dots}>
          <Dot on={dots.meal} color={colors.meal} />
          <Dot on={dots.water} color={colors.water} />
          <Dot on={dots.workout} color={colors.workout} />
        </View>
      </View>

      <View style={styles.bubbleWrap}>
        <View style={styles.bubbleTip} />
        <View style={styles.bubble}>
          <Txt variant="sub" color={colors.textSub}>
            {line}
          </Txt>
        </View>
      </View>
    </View>
  );
}

/** 올라온 만큼 아래로 남는 흔적 */
function ClawTrail({
  width,
  height,
  fromY,
  toY,
}: {
  width: number;
  height: number;
  fromY: number;
  toY: number;
}) {
  const marks: number[] = [];
  for (let y = fromY; y > toY + 6; y -= 26) marks.push(y);

  const cx = width / 2;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {marks.map((y, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const baseX = cx + side * (width * 0.13);
        return [-4, 0, 4].map((dx, j) => (
          <Line
            key={`${i}-${j}`}
            x1={baseX + dx}
            y1={y}
            x2={baseX + dx * 1.4 + side * 3}
            y2={y - 13}
            stroke={colors.line}
            strokeWidth={2}
            strokeLinecap="round"
          />
        ));
      })}
    </Svg>
  );
}

function Dot({ on, color }: { on: boolean; color: string }) {
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: on ? color : colors.line },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.wall,
    borderRadius: radius.card,
    overflow: 'hidden',
    ...shadow,
  },
  wall: {
    flex: 1,
    position: 'relative',
  },
  catHolder: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  dots: {
    position: 'absolute',
    right: space(3),
    top: space(3),
    gap: space(2),
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bubbleWrap: {
    alignItems: 'center',
    paddingBottom: space(3),
  },
  bubbleTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.bg,
  },
  bubble: {
    backgroundColor: colors.bg,
    borderRadius: radius.chip,
    paddingHorizontal: space(4),
    paddingVertical: space(2),
  },
});

export default CatWall;
