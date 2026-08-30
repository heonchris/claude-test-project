/**
 * 고양이 그림의 **유일한 원본**.
 *
 * 여기서 SVG 문자열을 만들고, 앱(components/Cat.tsx)과
 * 미리보기 도구(tools/render-cat.mjs)가 같은 함수를 쓴다.
 * 그래서 "꼬리를 더 길게" 같은 수정이 앱과 미리보기에 동시에 반영된다.
 *
 * SPEC 6-0 스타일 규칙:
 * - 완전한 검정 실루엣 하나. 외곽선·그림자·그라데이션 없음
 * - 흰 것은 눈뿐. 입·코·수염·볼터치 없음
 * - 귀는 뾰족한 삼각형, 몸통은 길쭉하고 홀쭉, 꼬리는 가늘고 길게
 * - 발끝은 세 갈래, 매달릴 때 발 위로 발톱 자국
 *
 * 움직임은 **2프레임 방식**이다. 부드럽게 이어붙이지 않고 툭툭 바꾼다.
 * 납작한 실루엣에는 이 편이 잘 어울리고, 코드도 단순해진다.
 */

export const CAT_VIEWBOX = { width: 120, height: 150 };
export const CAT_ASPECT = CAT_VIEWBOX.height / CAT_VIEWBOX.width;

export type CatPose =
  // 상태에 따라 오래 유지되는 자세
  | 'napping'
  | 'awake'
  | 'climbing'
  | 'top'
  // 잠깐 스쳐가는 반응
  | 'startled'
  | 'stretching'
  | 'eating'
  | 'drinking'
  | 'running';

/** 두 장을 번갈아 보여준다. 0과 1. */
export type Beat = 0 | 1;

export type CatFrame = {
  pose: CatPose;
  beat: Beat;
  /** 눈 깜빡임 (napping처럼 원래 감은 자세에는 영향 없음) */
  blink: boolean;
};

export type CatPalette = {
  /** 고양이 몸 */
  body: string;
  /** 눈 흰자 */
  eye: string;
  /** 밥그릇·물컵 같은 소품. 고양이보다 반드시 옅어야 한다 */
  prop: string;
  /** 물 */
  water: string;
};

export const DEFAULT_PALETTE: CatPalette = {
  body: '#141312',
  eye: '#FFFFFF',
  prop: '#EFE7DC',
  water: '#7FB6E8',
};

/* ------------------------------ 부품 ------------------------------ */

const n = (v: number) => Math.round(v * 100) / 100;

/** 세 갈래 발가락 */
function paw(x: number, y: number, r: number, up: boolean, fill: string): string {
  const dy = up ? -r * 0.55 : r * 0.55;
  const toe = r * 0.45;
  return (
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}"/>` +
    `<circle cx="${n(x - r * 0.62)}" cy="${n(y + dy)}" r="${n(toe)}" fill="${fill}"/>` +
    `<circle cx="${n(x)}" cy="${n(y + dy * 1.25)}" r="${n(toe)}" fill="${fill}"/>` +
    `<circle cx="${n(x + r * 0.62)}" cy="${n(y + dy)}" r="${n(toe)}" fill="${fill}"/>`
  );
}

/** 벽에 남는 가느다란 발톱 자국 */
function claws(x: number, y: number, length: number, fill: string): string {
  return [-5.5, -1.8, 1.8, 5.5]
    .map(
      (dx) =>
        `<line x1="${n(x + dx)}" y1="${n(y - 7)}" x2="${n(x + dx * 1.55)}" y2="${n(
          y - 7 - length
        )}" stroke="${fill}" stroke-width="1.4" stroke-linecap="round"/>`
    )
    .join('');
}

type EyeSpec = { cx: number; cy: number; r: number; pupil: number; dx?: number; dy?: number };

function openEyes(specs: EyeSpec[], p: CatPalette): string {
  return specs
    .map(
      (e) =>
        `<circle cx="${n(e.cx)}" cy="${n(e.cy)}" r="${n(e.r)}" fill="${p.eye}"/>` +
        `<circle cx="${n(e.cx + (e.dx ?? 0))}" cy="${n(e.cy + (e.dy ?? 0))}" r="${n(
          e.pupil
        )}" fill="${p.body}"/>`
    )
    .join('');
}

/** 감은 눈은 가로선 하나 */
function shutEyes(specs: EyeSpec[], p: CatPalette): string {
  return specs
    .map(
      (e) =>
        `<line x1="${n(e.cx - e.r * 0.8)}" y1="${n(e.cy)}" x2="${n(e.cx + e.r * 0.8)}" y2="${n(
          e.cy
        )}" stroke="${p.eye}" stroke-width="2.6" stroke-linecap="round"/>`
    )
    .join('');
}

function eyes(specs: EyeSpec[], shut: boolean, p: CatPalette): string {
  return shut ? shutEyes(specs, p) : openEyes(specs, p);
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"/>`;

const limb = (d: string, width: number, fill: string) =>
  `<path d="${d}" stroke="${fill}" stroke-width="${width}" stroke-linecap="round" fill="none"/>`;

/* ------------------------------ 자세 ------------------------------ */

/** 앉은 자세. awake / top / startled / eating / drinking 이 공유한다. */
function sitting(f: CatFrame, p: CatPalette): string {
  const startled = f.pose === 'startled';

  // 숨쉬기: 몸통이 아주 살짝 부풀었다 줄어든다
  const breath = f.beat === 1 ? 0.9 : 0;
  const bodyRy = 38 + breath;
  const bodyCy = 100;
  const bob = 0;
  const headCy = 48;

  const eyeR = startled ? 11.5 : 9.8;
  const pupil = startled ? 7 : 4.8;
  const gaze = 0;

  const tail =
    f.pose === 'top'
      ? f.beat === 0
        ? 'M78 124 C 104 126, 117 108, 107 84 L 100 88 C 108 108, 99 118, 76 118 Z'
        : 'M78 124 C 106 122, 116 102, 103 80 L 96 85 C 106 104, 98 116, 76 118 Z'
      : f.beat === 0
        ? 'M78 130 C 103 134, 117 122, 111 98 L 104 101 C 108 118, 98 126, 76 124 Z'
        : 'M78 130 C 104 130, 119 116, 110 94 L 103 98 C 109 113, 99 122, 76 124 Z';

  return (
    `<path d="${tail}" fill="${p.body}"/>` +
    ellipse(60, bodyCy, 23, bodyRy, p.body) +
    limb(`M50 ${114 + bob} L 50 138`, 12, p.body) +
    limb(`M70 ${114 + bob} L 70 138`, 12, p.body) +
    paw(50, 140, 7, false, p.body) +
    paw(70, 140, 7, false, p.body) +
    `<polygon points="40,${n(headCy - 12)} 31,${n(headCy - 40)} 58,${n(headCy - 20)}" fill="${p.body}"/>` +
    `<polygon points="64,${n(headCy - 20)} 90,${n(headCy - 40)} 82,${n(headCy - 8)}" fill="${p.body}"/>` +
    ellipse(60, headCy, 25, 22, p.body) +
    eyes(
      [
        { cx: 49, cy: headCy - 1, r: eyeR, pupil, dy: gaze },
        { cx: 71, cy: headCy - 1, r: eyeR, pupil, dy: gaze },
      ],
      f.blink,
      p
    )
  );
}

/** 매달린 자세 */
function climbing(f: CatFrame, p: CatPalette): string {
  // 매달려서 버티는 느낌: 몸이 아주 살짝 오르내린다
  const lift = f.beat === 1 ? -1.5 : 0;
  return (
    claws(24, 32 + lift, 17, p.body) +
    claws(94, 28 + lift, 20, p.body) +
    `<path d="M42 120 C 26 126, 12 138, 12 152 L 19 152 C 19 140, 30 130, 45 127 Z" fill="${p.body}"/>` +
    `<g transform="rotate(-6 58 110)">${ellipse(58, 110 + lift, 21, 38, p.body)}</g>` +
    limb(`M46 ${86 + lift} C 36 ${68 + lift}, 28 ${48 + lift}, 24 ${34 + lift}`, 9, p.body) +
    limb(`M70 ${82 + lift} C 82 ${64 + lift}, 90 ${44 + lift}, 94 ${30 + lift}`, 9, p.body) +
    paw(24, 32 + lift, 6.5, true, p.body) +
    paw(94, 28 + lift, 6.5, true, p.body) +
    paw(47, 143, 7.5, false, p.body) +
    paw(68, 140, 7.5, false, p.body) +
    `<polygon points="36,${n(46 + lift)} 30,${n(20 + lift)} 54,${n(38 + lift)}" fill="${p.body}"/>` +
    `<polygon points="64,${n(38 + lift)} 84,${n(18 + lift)} 78,${n(50 + lift)}" fill="${p.body}"/>` +
    ellipse(58, 58 + lift, 24, 21, p.body) +
    eyes(
      [
        { cx: 48, cy: 57.5 + lift, r: 9.2, pupil: 4.4 },
        { cx: 68, cy: 55.5 + lift, r: 9.2, pupil: 4.4 },
      ],
      f.blink,
      p
    )
  );
}

/** 늘어져 자는 자세. 눈은 항상 감겨 있다. */
function napping(f: CatFrame, p: CatPalette): string {
  const breath = f.beat === 1 ? 0.8 : 0;
  const tail =
    f.beat === 0
      ? 'M96 124 C 112 120, 119 131, 112 146 L 105 141 C 110 132, 106 128, 94 130 Z'
      : 'M96 124 C 113 122, 121 133, 113 147 L 106 142 C 111 133, 106 129, 94 130 Z';

  return (
    `<path d="${tail}" fill="${p.body}"/>` +
    ellipse(66, 122, 40, 19 + breath, p.body) +
    paw(44, 137, 6.5, false, p.body) +
    paw(62, 139, 6.5, false, p.body) +
    `<polygon points="20,104 12,82 34,98" fill="${p.body}"/>` +
    `<polygon points="36,98 54,82 50,108" fill="${p.body}"/>` +
    ellipse(33, 112, 21, 19, p.body) +
    shutEyes(
      [
        { cx: 26.5, cy: 113, r: 5.6, pupil: 0 },
        { cx: 42.5, cy: 111, r: 5.6, pupil: 0 },
      ],
      p
    )
  );
}

/**
 * 밥 먹기 / 물 마시기.
 * 정면 실루엣이라 고개를 그냥 내리면 몸통에 묻힌다.
 * 그래서 **머리를 앞아래(왼쪽)로 빼서** 실루엣이 아래로 불룩해지게 하고,
 * 그릇은 몸통을 그린 **뒤에** 올려 앞에 놓인 것처럼 보이게 한다.
 */
function feeding(f: CatFrame, p: CatPalette): string {
  const drinking = f.pose === 'drinking';
  const bob = f.beat === 1 ? 3 : 0; // 고개 까딱
  const headCx = 50;
  const headCy = 108 + bob;

  const tail =
    f.beat === 0
      ? 'M80 118 C 104 120, 116 106, 108 86 L 101 90 C 107 105, 98 112, 78 112 Z'
      : 'M80 118 C 105 116, 117 100, 106 82 L 99 87 C 106 101, 97 110, 78 112 Z';

  const prop = drinking
    ? // 물컵 - 물 색으로 옅게. 고양이보다 진해지면 안 된다
      `<path d="M34 122 H58 L55 140 A2 2 0 0 1 53 141.5 H39 A2 2 0 0 1 37 140 Z" fill="${p.water}" opacity="0.4"/>` +
      `<path d="M34 122 H58" stroke="${p.water}" stroke-width="2.4" stroke-linecap="round"/>` +
      (f.beat === 1
        ? `<circle cx="28" cy="126" r="2.2" fill="${p.water}"/><circle cx="63" cy="130" r="1.6" fill="${p.water}"/>`
        : '')
    : // 밥그릇
      `<path d="M28 128 H66 A19 19 0 0 1 28 128 Z" fill="none" stroke="${p.prop}" stroke-width="3.4" stroke-linejoin="round"/>` +
      (f.beat === 1
        ? `<circle cx="47" cy="134" r="2.4" fill="${p.prop}"/>`
        : `<circle cx="42" cy="133" r="2.2" fill="${p.prop}"/><circle cx="53" cy="135" r="1.8" fill="${p.prop}"/>`);

  return (
    `<path d="${tail}" fill="${p.body}"/>` +
    // 등이 솟고 앞이 낮은 자세
    `<g transform="rotate(10 66 96)">${ellipse(66, 96, 24, 30, p.body)}</g>` +
    paw(74, 138, 7, false, p.body) +
    // 앞으로 숙인 머리. 통째로 기울여야 귀가 몸통 밖으로 나와 고양이로 읽힌다
    `<g transform="rotate(-26 ${n(headCx)} ${n(headCy)})">` +
    `<polygon points="${n(headCx - 15)},${n(headCy - 9)} ${n(headCx - 23)},${n(headCy - 35)} ${n(
      headCx + 3
    )},${n(headCy - 19)}" fill="${p.body}"/>` +
    `<polygon points="${n(headCx + 7)},${n(headCy - 19)} ${n(headCx + 29)},${n(
      headCy - 36
    )} ${n(headCx + 21)},${n(headCy - 6)}" fill="${p.body}"/>` +
    ellipse(headCx, headCy, 21, 18, p.body) +
    // 고개를 기울인 자세라 눈을 감기면 두 선이 하나로 붙어 보인다.
    // 1초 남짓 스쳐가는 자세이므로 여기서는 눈을 감기지 않는다.
    openEyes(
      [
        { cx: headCx - 9, cy: headCy - 2, r: 8.6, pupil: 4.2, dy: 2.4 },
        { cx: headCx + 9, cy: headCy - 3, r: 8.6, pupil: 4.2, dy: 2.4 },
      ],
      p
    ) +
    `</g>` +
    prop
  );
}

/** 기지개. 자다가 일어날 때 잠깐 스친다. */
function stretching(f: CatFrame, p: CatPalette): string {
  const reach = f.beat === 1 ? -4 : 0;
  return (
    // 꼬리는 위로 곧게
    `<path d="M86 106 C 108 98, 116 76, 104 56 L 97 61 C 106 78, 99 92, 84 100 Z" fill="${p.body}"/>` +
    // 엉덩이는 높고 가슴은 바닥에
    `<g transform="rotate(-24 68 108)">${ellipse(68, 108, 30, 18, p.body)}</g>` +
    // 앞다리를 앞으로 쭉 뻗는다
    limb(`M50 116 L ${n(28 + reach)} 132`, 10, p.body) +
    limb(`M58 122 L ${n(36 + reach)} 140`, 10, p.body) +
    paw(26 + reach, 133, 6.5, false, p.body) +
    paw(34 + reach, 141, 6.5, false, p.body) +
    // 뒷발
    paw(86, 136, 7, false, p.body) +
    `<polygon points="30,110 18,88 46,102" fill="${p.body}"/>` +
    `<polygon points="48,102 70,86 64,114" fill="${p.body}"/>` +
    ellipse(44, 116, 21, 17, p.body) +
    shutEyes(
      [
        { cx: 36, cy: 116, r: 5.6, pupil: 0 },
        { cx: 53, cy: 115, r: 5.6, pupil: 0 },
      ],
      p
    )
  );
}

/** 제자리 뛰기. 정면을 보는 캐릭터를 유지하려고 옆모습으로 바꾸지 않는다. */
function running(f: CatFrame, p: CatPalette): string {
  const up = f.beat === 1;
  const bodyCy = up ? 88 : 92;
  const headCy = up ? 40 : 44;
  // 몸통 아래로 발이 확실히 드러나게 (몸통 끝 y = bodyCy + 28)
  const leftPaw = up ? 126 : 140;
  const rightPaw = up ? 140 : 126;

  const speed =
    `<path d="M10 ${up ? 92 : 88} H30 M8 ${up ? 106 : 102} H26" stroke="${p.prop}" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M110 ${up ? 92 : 88} H90 M112 ${up ? 106 : 102} H94" stroke="${p.prop}" stroke-width="4" stroke-linecap="round"/>`;

  const tail = up
    ? 'M76 108 C 102 100, 116 80, 106 58 L 99 63 C 107 82, 97 96, 74 102 Z'
    : 'M76 112 C 101 108, 116 92, 108 70 L 101 75 C 107 91, 97 104, 74 106 Z';

  return (
    speed +
    `<path d="${tail}" fill="${p.body}"/>` +
    ellipse(60, bodyCy, 21, 28, p.body) +
    limb(`M48 ${bodyCy + 16} L 48 ${n(leftPaw - 3)}`, 11, p.body) +
    limb(`M72 ${bodyCy + 16} L 72 ${n(rightPaw - 3)}`, 11, p.body) +
    paw(48, leftPaw, 6.5, false, p.body) +
    paw(72, rightPaw, 6.5, false, p.body) +
    `<polygon points="40,${n(headCy - 12)} 31,${n(headCy - 40)} 58,${n(headCy - 20)}" fill="${p.body}"/>` +
    `<polygon points="64,${n(headCy - 20)} 90,${n(headCy - 40)} 82,${n(headCy - 8)}" fill="${p.body}"/>` +
    ellipse(60, headCy, 25, 22, p.body) +
    eyes(
      [
        { cx: 49, cy: headCy - 1, r: 9.8, pupil: 4.8 },
        { cx: 71, cy: headCy - 1, r: 9.8, pupil: 4.8 },
      ],
      f.blink,
      p
    )
  );
}

/* ------------------------------ 출력 ------------------------------ */

export function catBody(frame: CatFrame, palette: CatPalette = DEFAULT_PALETTE): string {
  switch (frame.pose) {
    case 'napping':
      return napping(frame, palette);
    case 'climbing':
      return climbing(frame, palette);
    case 'stretching':
      return stretching(frame, palette);
    case 'running':
      return running(frame, palette);
    case 'eating':
    case 'drinking':
      return feeding(frame, palette);
    default:
      return sitting(frame, palette);
  }
}

export function catSvg(
  frame: CatFrame,
  options: { width: number; height?: number; palette?: CatPalette } 
): string {
  const { width } = options;
  const height = options.height ?? width * CAT_ASPECT;
  const body = catBody(frame, options.palette ?? DEFAULT_PALETTE);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" ` +
    `viewBox="0 0 ${CAT_VIEWBOX.width} ${CAT_VIEWBOX.height}">${body}</svg>`
  );
}

/** 미리보기·아이콘용 목록 */
export const ALL_POSES: CatPose[] = [
  'napping',
  'awake',
  'climbing',
  'top',
  'startled',
  'stretching',
  'eating',
  'drinking',
  'running',
];
