import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  CAT_ASPECT,
  catSvg,
  type Beat,
  type CatPalette,
  type CatPose,
} from '../lib/catArt';
import { colors } from '../theme/colors';

export { CAT_ASPECT } from '../lib/catArt';
export type { CatPose } from '../lib/catArt';

/**
 * 고양이를 화면에 그린다.
 * 그림 자체는 lib/catArt.ts에 있고, 여기서는 **언제 프레임을 바꿀지**만 정한다.
 *
 * 움직임은 2프레임 방식이다 (SPEC 6-1).
 * - 가만히 있을 때: 1.1초마다 숨쉬기·꼬리
 * - 반응할 때(밥/물/운동): 0.32초마다 빠르게
 * - 눈 깜빡임: 3.5~7초 사이 아무 때나 0.12초
 *
 * 화면을 보고 있지 않으면(`animate=false`) 멈춘다. 배터리를 쓸 이유가 없다.
 */

const PALETTE: CatPalette = {
  body: colors.catBody,
  eye: colors.catEye,
  prop: colors.line,
  water: colors.water,
};

const IDLE_BEAT_MS = 1100;
const ACTION_BEAT_MS = 320;
const BLINK_MS = 120;
const BLINK_MIN_GAP = 3500;
const BLINK_EXTRA_GAP = 3500;

const ACTION_POSES: CatPose[] = ['eating', 'drinking', 'running', 'stretching'];

type Props = {
  pose: CatPose;
  /** 그려질 가로 크기(px). 세로는 CAT_ASPECT로 따라온다. */
  width: number;
  /** 화면을 보고 있을 때만 움직인다 */
  animate?: boolean;
};

export function Cat({ pose, width, animate = true }: Props) {
  const [beat, setBeat] = useState<Beat>(0);
  const [blink, setBlink] = useState(false);
  const [appActive, setAppActive] = useState(true);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);

  const moving = animate && appActive;

  // 숨쉬기 · 꼬리
  useEffect(() => {
    if (!moving) return;
    const period = ACTION_POSES.includes(pose) ? ACTION_BEAT_MS : IDLE_BEAT_MS;
    const timer = setInterval(() => setBeat((b) => (b === 0 ? 1 : 0)), period);
    return () => clearInterval(timer);
  }, [moving, pose]);

  // 눈 깜빡임. 규칙적이면 기계처럼 보여서 간격을 흩뜨린다.
  // 타이머는 항상 하나만 살아 있게 유지한다 (오래 켜두면 쌓이기 때문).
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!moving) {
      setBlink(false);
      return;
    }
    let cancelled = false;
    const schedule = () => {
      const wait = BLINK_MIN_GAP + Math.random() * BLINK_EXTRA_GAP;
      blinkTimer.current = setTimeout(() => {
        if (cancelled) return;
        setBlink(true);
        blinkTimer.current = setTimeout(() => {
          if (cancelled) return;
          setBlink(false);
          schedule();
        }, BLINK_MS);
      }, wait);
    };
    schedule();
    return () => {
      cancelled = true;
      if (blinkTimer.current) clearTimeout(blinkTimer.current);
      blinkTimer.current = null;
    };
  }, [moving]);

  const height = width * CAT_ASPECT;
  const xml = useMemo(
    () => catSvg({ pose, beat, blink }, { width, height, palette: PALETTE }),
    [pose, beat, blink, width, height]
  );

  return <SvgXml xml={xml} width={width} height={height} />;
}

export default Cat;
