/** SPEC 7. 화면에서 가장 진한 것은 고양이 하나뿐이어야 한다. */
export const colors = {
  bg: '#FBF7F0', // 우유빛 배경
  card: '#FFFFFF',
  text: '#3D3733',
  textSub: '#9A9088',
  meal: '#F5B461', // 식단 - 살구
  water: '#7FB6E8', // 물 - 하늘
  workout: '#7BC6A4', // 운동 - 민트
  catBody: '#141312', // 고양이 - 완전 검정에 가깝게
  catEye: '#FFFFFF',
  wall: '#FFFFFF', // 고양이가 오르는 벽
  line: '#EFE7DC',
} as const;

/** 카테고리 색은 장식이 아니라 정보. 어디서든 같은 색을 유지한다. */
export const categoryColor = {
  meal: colors.meal,
  water: colors.water,
  workout: colors.workout,
  plan: colors.textSub,
} as const;

export type Category = keyof typeof categoryColor;

export const radius = { card: 20, button: 16, chip: 999 } as const;

/** 여백 단위는 4의 배수, 화면 좌우 패딩 20. */
export const space = (n: number) => n * 4;
export const screenPadding = 20;

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;
