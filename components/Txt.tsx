import { createContext, useContext } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors } from '../theme/colors';
import { families, variants, type TypeVariant } from '../theme/typography';

/** 커스텀 폰트가 실제로 올라갔는지. 실패하면 시스템 폰트로 조용히 되돌린다. */
const FontsReadyContext = createContext(false);
export const FontsReadyProvider = FontsReadyContext.Provider;

/** 커스텀 폰트가 실제로 적용 가능한 상태인지 */
export const useFontsReady = () => useContext(FontsReadyContext);

type Props = TextProps & {
  variant?: TypeVariant;
  color?: string;
  center?: boolean;
};

export function Txt({ variant = 'body', color, center, style, ...rest }: Props) {
  const ready = useContext(FontsReadyContext);
  const v = variants[variant];

  const base: TextStyle = {
    fontSize: v.fontSize,
    lineHeight: v.lineHeight,
    color: color ?? colors.text,
  };
  if (ready) {
    base.fontFamily = families[v.family];
  } else if (v.family !== 'body') {
    // 폰트 없이도 위계는 남도록
    base.fontWeight = '700';
  }
  if (center) base.textAlign = 'center';

  return <Text {...rest} style={[base, style]} />;
}
