import { TextInput, type TextInputProps } from 'react-native';
import { useFontsReady } from './Txt';
import { colors } from '../theme/colors';
import { families } from '../theme/typography';

/** 폰트가 안 올라와도 안전하게 동작하는 입력창 */
export function Input({ style, ...rest }: TextInputProps) {
  const ready = useFontsReady();
  return (
    <TextInput
      placeholderTextColor={colors.textSub}
      {...rest}
      style={[
        {
          fontSize: 15,
          lineHeight: 22,
          color: colors.text,
          padding: 0,
          fontFamily: ready ? families.body : undefined,
        },
        style,
      ]}
    />
  );
}
