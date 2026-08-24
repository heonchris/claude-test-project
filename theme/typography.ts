import { useFonts } from 'expo-font';

/**
 * SPEC 7. 본문 Pretendard, 제목/숫자 Cafe24 Ssurround.
 * 폰트 로딩이 실패해도 앱은 시스템 폰트로 그대로 동작해야 하므로,
 * 실제 fontFamily 지정은 components/Txt.tsx에서 로딩 여부를 보고 결정한다.
 */
export const FONT_ASSETS = {
  Pretendard: require('../assets/fonts/Pretendard-Regular.otf'),
  'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
  Cafe24Ssurround: require('../assets/fonts/Cafe24Ssurround.ttf'),
};

export const families = {
  body: 'Pretendard',
  bodyBold: 'Pretendard-Bold',
  display: 'Cafe24Ssurround',
} as const;

export type TypeVariant =
  | 'display' // 화면 제목, 큰 숫자
  | 'title' // 카드 제목
  | 'body'
  | 'bodyBold'
  | 'sub' // 보조 설명
  | 'caption'; // 가장 작은 글씨

export const variants: Record<
  TypeVariant,
  { fontSize: number; lineHeight: number; family: keyof typeof families }
> = {
  display: { fontSize: 26, lineHeight: 34, family: 'display' },
  title: { fontSize: 17, lineHeight: 24, family: 'display' },
  body: { fontSize: 15, lineHeight: 22, family: 'body' },
  bodyBold: { fontSize: 15, lineHeight: 22, family: 'bodyBold' },
  sub: { fontSize: 13, lineHeight: 19, family: 'body' },
  caption: { fontSize: 11, lineHeight: 16, family: 'body' },
};

/** 앱 시작 시 한 번 호출. [로딩이 끝났는지, 폰트가 실제로 올라갔는지] */
export function useAppFonts(): [boolean, boolean] {
  const [loaded, error] = useFonts(FONT_ASSETS);
  return [loaded || !!error, loaded && !error];
}
