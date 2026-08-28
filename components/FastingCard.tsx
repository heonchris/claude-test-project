import { StyleSheet, View } from 'react-native';
import { Txt } from './Txt';
import { Card, SectionTitle } from './ui';
import { formatTimeOfDay, formatKorean, toKey, todayKey } from '../lib/dates';
import { formatDuration, type Fasting } from '../lib/fasting';
import { colors, radius, space } from '../theme/colors';

/**
 * 공복 카드. 시작/종료 버튼이 없다.
 * 식단을 기록하면 그 시각부터 자동으로 다시 센다.
 * 목표를 못 채워도 나무라지 않는다 (SPEC 1-2).
 */
export function FastingCard({ fasting }: { fasting: Fasting }) {
  const { since, minutes, goalMinutes, progress, reached, remainingMinutes, stale } = fasting;

  if (since && stale) {
    return (
      <Card accent={colors.meal}>
        <SectionTitle>공복</SectionTitle>
        <Txt variant="sub" color={colors.textSub}>
          마지막 식사 기록이 하루가 넘었어요. 한 끼 남기면 거기서부터 다시 세어드릴게요.
        </Txt>
      </Card>
    );
  }

  if (!since) {
    return (
      <Card accent={colors.meal}>
        <SectionTitle>공복</SectionTitle>
        <Txt variant="sub" color={colors.textSub}>
          첫 끼를 남기면 그때부터 공복 시간을 자동으로 세어드려요.
        </Txt>
      </Card>
    );
  }

  const sinceLabel =
    toKey(since) === todayKey()
      ? `오늘 ${formatTimeOfDay(since.toISOString())}`
      : `${formatKorean(toKey(since))} ${formatTimeOfDay(since.toISOString())}`;

  return (
    <Card accent={colors.meal}>
      <SectionTitle
        right={
          <Txt variant="caption" color={colors.textSub}>
            목표 {Math.round(goalMinutes / 60)}시간
          </Txt>
        }
      >
        공복
      </SectionTitle>

      <Txt variant="display">{formatDuration(minutes)}</Txt>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.max(2, progress * 100)}%`, backgroundColor: colors.meal },
          ]}
        />
      </View>

      <Txt variant="caption" color={colors.textSub}>
        {reached
          ? `목표를 채웠어요 · 마지막 식사 ${sinceLabel}`
          : `${formatDuration(remainingMinutes)} 남았어요 · 마지막 식사 ${sinceLabel}`}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.chip,
    backgroundColor: colors.line,
    overflow: 'hidden',
    marginTop: space(2),
    marginBottom: space(2),
  },
  fill: { height: '100%', borderRadius: radius.chip },
});
