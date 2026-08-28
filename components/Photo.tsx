import { useEffect, useState } from 'react';
import {
  Image,
  View,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Txt } from './Txt';
import { resolvePhotoUri } from '../lib/photos';
import { colors, space } from '../theme/colors';

/**
 * 기록에 저장된 사진 한 장.
 * 파일이 없으면(백업에서 복원한 경우 등) 조용히 메모나 안내로 대체한다.
 * 사진이 안 뜬다고 빈 회색 칸을 남기지 않는다.
 */
export function Photo({
  stored,
  style,
  fallbackText,
  resizeMode,
}: {
  stored: string | null | undefined;
  style?: StyleProp<ViewStyle & ImageStyle>;
  fallbackText?: string;
  resizeMode?: ImageResizeMode;
}) {
  const uri = resolvePhotoUri(stored);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (!uri || failed) {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', padding: space(2) }]}>
        <Txt variant="caption" color={colors.textSub} center>
          {fallbackText || (stored ? '사진을 찾을 수 없어요' : '메모 없음')}
        </Txt>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style as StyleProp<ImageStyle>}
      resizeMode={resizeMode}
      onError={() => setFailed(true)}
    />
  );
}
