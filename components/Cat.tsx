import Svg, { Circle, Ellipse, G, Line, Path, Polygon } from 'react-native-svg';
import { colors } from '../theme/colors';
import type { CatState } from '../lib/progress';

/**
 * SPEC 6. 참고 이미지(assets/cat-reference.jpg)의 그림체를 코드로 옮긴 것.
 * - 완전한 검정 실루엣 하나. 외곽선/그림자/그라데이션 없음
 * - 흰 것은 눈뿐. 입·코·수염·볼터치 없음
 * - 귀는 뾰족한 삼각형, 몸통은 길쭉하고 홀쭉, 꼬리는 가늘고 길게
 * - 발끝은 세 갈래, 매달릴 때 발 위로 발톱 자국
 *
 * 모양을 바꾸고 싶으면 아래 숫자만 만지면 된다. 그림 파일은 쓰지 않는다.
 */

export const CAT_VIEWBOX = { width: 120, height: 150 };
export const CAT_ASPECT = CAT_VIEWBOX.height / CAT_VIEWBOX.width;

type Props = {
  state: CatState;
  /** 그려질 가로 크기(px). 세로는 CAT_ASPECT로 따라온다. */
  width: number;
};

const BODY = colors.catBody;
const EYE = colors.catEye;

/** 세 갈래 발가락 */
function Paw({ x, y, r = 6.5, up = true }: { x: number; y: number; r?: number; up?: boolean }) {
  const dy = up ? -r * 0.55 : r * 0.55;
  const toe = r * 0.45;
  return (
    <G>
      <Circle cx={x} cy={y} r={r} fill={BODY} />
      <Circle cx={x - r * 0.62} cy={y + dy} r={toe} fill={BODY} />
      <Circle cx={x} cy={y + dy * 1.25} r={toe} fill={BODY} />
      <Circle cx={x + r * 0.62} cy={y + dy} r={toe} fill={BODY} />
    </G>
  );
}

/** 발 위로 남는 가느다란 발톱 자국 */
function ClawMarks({ x, y, length = 22 }: { x: number; y: number; length?: number }) {
  const offsets = [-5.5, -1.8, 1.8, 5.5];
  return (
    <G>
      {offsets.map((dx, i) => (
        <Line
          key={i}
          x1={x + dx}
          y1={y - 7}
          x2={x + dx * 1.55}
          y2={y - 7 - length}
          stroke={BODY}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      ))}
    </G>
  );
}

type EyeSpec = { cx: number; cy: number; r: number; pupil: number; dx?: number; dy?: number };

function Eyes({ left, right }: { left: EyeSpec; right: EyeSpec }) {
  return (
    <G>
      {[left, right].map((e, i) => (
        <G key={i}>
          <Circle cx={e.cx} cy={e.cy} r={e.r} fill={EYE} />
          <Circle
            cx={e.cx + (e.dx ?? 0)}
            cy={e.cy + (e.dy ?? 0)}
            r={e.pupil}
            fill={BODY}
          />
        </G>
      ))}
    </G>
  );
}

/* ---------------------------- 매달린 자세 ---------------------------- */

function Climbing({ startled }: { startled?: boolean }) {
  const eyeR = startled ? 11 : 9.2;
  const pupil = startled ? 6.6 : 4.4;
  return (
    <G>
      {/* 발톱 자국 */}
      <ClawMarks x={24} y={32} length={17} />
      <ClawMarks x={94} y={28} length={20} />

      {/* 꼬리 - 가늘고 길게 */}
      <Path
        d="M42 120 C 26 126, 12 138, 12 152 L 19 152 C 19 140, 30 130, 45 127 Z"
        fill={BODY}
      />

      {/* 몸통 - 길쭉하고 홀쭉 */}
      <G rotation={-6} origin="58, 110">
        <Ellipse cx={58} cy={110} rx={21} ry={38} fill={BODY} />
      </G>

      {/* 팔 - 벽을 잡고 위로 뻗음 */}
      <Path
        d="M46 86 C 36 68, 28 48, 24 34"
        stroke={BODY}
        strokeWidth={9}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M70 82 C 82 64, 90 44, 94 30"
        stroke={BODY}
        strokeWidth={9}
        strokeLinecap="round"
        fill="none"
      />
      <Paw x={24} y={32} />
      <Paw x={94} y={28} />

      {/* 뒷발 */}
      <Paw x={47} y={143} r={7.5} up={false} />
      <Paw x={68} y={140} r={7.5} up={false} />

      {/* 귀 - 뾰족한 삼각형 */}
      <Polygon points="36,46 30,20 54,38" fill={BODY} />
      <Polygon points="64,38 84,18 78,50" fill={BODY} />

      {/* 머리 */}
      <Ellipse cx={58} cy={58} rx={24} ry={21} fill={BODY} />

      <Eyes
        left={{ cx: 48, cy: 58, r: eyeR, pupil, dy: -0.5 }}
        right={{ cx: 68, cy: 56, r: eyeR, pupil, dy: -0.5 }}
      />
    </G>
  );
}

/* ----------------------------- 앉은 자세 ----------------------------- */

function Sitting({ state }: { state: 'awake' | 'top' | 'startled' }) {
  const startled = state === 'startled';
  const eyeR = startled ? 11.5 : 9.8;
  const pupil = startled ? 7 : 4.8;
  const tail =
    state === 'top'
      ? 'M78 124 C 104 126, 117 108, 107 84 L 100 88 C 108 108, 99 118, 76 118 Z'
      : 'M78 130 C 103 134, 117 122, 111 98 L 104 101 C 108 118, 98 126, 76 124 Z';

  return (
    <G>
      <Path d={tail} fill={BODY} />

      {/* 몸통 */}
      <Ellipse cx={60} cy={100} rx={23} ry={38} fill={BODY} />

      {/* 앞다리 + 발 */}
      <Path
        d="M50 114 L 50 138"
        stroke={BODY}
        strokeWidth={12}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M70 114 L 70 138"
        stroke={BODY}
        strokeWidth={12}
        strokeLinecap="round"
        fill="none"
      />
      <Paw x={50} y={140} r={7} up={false} />
      <Paw x={70} y={140} r={7} up={false} />

      {/* 귀 */}
      <Polygon points="40,36 31,8 58,28" fill={BODY} />
      <Polygon points="64,28 90,8 82,40" fill={BODY} />

      {/* 머리 */}
      <Ellipse cx={60} cy={48} rx={25} ry={22} fill={BODY} />

      <Eyes
        left={{ cx: 49, cy: 47, r: eyeR, pupil }}
        right={{ cx: 71, cy: 47, r: eyeR, pupil }}
      />
    </G>
  );
}

/* ----------------------------- 낮잠 자세 ----------------------------- */

function Napping() {
  return (
    <G>
      {/* 축 처진 꼬리 */}
      <Path
        d="M96 124 C 112 120, 119 131, 112 146 L 105 141 C 110 132, 106 128, 94 130 Z"
        fill={BODY}
      />

      {/* 늘어진 몸통 */}
      <Ellipse cx={66} cy={122} rx={40} ry={19} fill={BODY} />

      {/* 앞발 */}
      <Paw x={44} y={137} r={6.5} up={false} />
      <Paw x={62} y={139} r={6.5} up={false} />

      {/* 귀 */}
      <Polygon points="20,104 12,82 34,98" fill={BODY} />
      <Polygon points="36,98 54,82 50,108" fill={BODY} />

      {/* 머리 */}
      <Ellipse cx={33} cy={112} rx={21} ry={19} fill={BODY} />

      {/* 감은 눈 - 가로선 */}
      <Line
        x1={22}
        y1={113}
        x2={31}
        y2={113}
        stroke={EYE}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <Line
        x1={38}
        y1={111}
        x2={47}
        y2={111}
        stroke={EYE}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    </G>
  );
}

export function Cat({ state, width }: Props) {
  const height = width * CAT_ASPECT;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${CAT_VIEWBOX.width} ${CAT_VIEWBOX.height}`}
    >
      {state === 'napping' ? (
        <Napping />
      ) : state === 'climbing' ? (
        <Climbing />
      ) : (
        <Sitting state={state} />
      )}
    </Svg>
  );
}

export default Cat;
