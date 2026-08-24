import type { ColorValue } from 'react-native';
import Svg, { Circle, Ellipse, Path, Polygon, Rect } from 'react-native-svg';
import { colors } from '../theme/colors';

/** 아이콘도 코드로 그린다. 검정에 가까운 색은 고양이 몫이라 text(#3D3733)까지만 쓴다. */
type IconProps = { size?: number; color?: ColorValue };

const base = (p: IconProps) => ({
  size: p.size ?? 22,
  color: p.color ?? colors.text,
});

export function CatFaceIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points="6,9 4,3 11,7" fill={color} />
      <Polygon points="13,7 20,3 18,10" fill={color} />
      <Ellipse cx={12} cy={14} rx={8} ry={7} fill={color} />
      <Circle cx={9.2} cy={13} r={2.1} fill={colors.card} />
      <Circle cx={14.8} cy={13} r={2.1} fill={colors.card} />
    </Svg>
  );
}

export function CalendarIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect
        x={3}
        y={5}
        width={18}
        height={16}
        rx={4}
        stroke={color}
        strokeWidth={1.8}
        fill="none"
      />
      <Path d="M3 10 H21" stroke={color} strokeWidth={1.8} />
      <Path d="M8 3 V6 M16 3 V6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={8.5} cy={14.5} r={1.2} fill={color} />
      <Circle cx={12} cy={14.5} r={1.2} fill={color} />
      <Circle cx={15.5} cy={14.5} r={1.2} fill={color} />
    </Svg>
  );
}

export function ListIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 7 L6 9 L9.5 5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M4 17 L6 19 L9.5 15"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M13 7 H20 M13 17 H20" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function SlidersIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 8 H20 M4 16 H20"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Circle cx={9} cy={8} r={2.6} fill={colors.card} stroke={color} strokeWidth={1.8} />
      <Circle cx={16} cy={16} r={2.6} fill={colors.card} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function PlusIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 5 V19 M5 12 H19"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function CloseIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 6 L18 18 M18 6 L6 18"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function CameraIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={7} width={18} height={13} rx={4} stroke={color} strokeWidth={1.8} fill="none" />
      <Path d="M9 7 L10.5 4.5 H13.5 L15 7" stroke={color} strokeWidth={1.8} strokeLinejoin="round" fill="none" />
      <Circle cx={12} cy={13.5} r={3.6} stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  );
}

export function ImageIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={5} width={18} height={14} rx={4} stroke={color} strokeWidth={1.8} fill="none" />
      <Circle cx={9} cy={10} r={1.8} fill={color} />
      <Path
        d="M4.5 17 L9.5 12.5 L13 15.5 L16 13 L19.5 16.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function TrashIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 7 H19 M10 7 V5 H14 V7 M7 7 L8 19 H16 L17 7"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function BowlIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 11 H21 A9 9 0 0 1 3 11 Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M8 7 C 8 5, 10 5, 10 3 M13 7 C 13 5.5, 15 5.5, 15 4" stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function DropIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3 C 12 3, 5 11, 5 15 A7 7 0 0 0 19 15 C 19 11, 12 3, 12 3 Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function ShoeIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 16 V10 H7 L11 13 H17 A4 4 0 0 1 21 17 V18 H3 Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M7 10 V13" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  const { size, color } = base(p);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 12.5 L10 17 L19 7"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function ChevronIcon({ direction = 'right', ...p }: IconProps & { direction?: 'left' | 'right' | 'down' }) {
  const { size, color } = base(p);
  const d =
    direction === 'left' ? 'M15 5 L8 12 L15 19' : direction === 'down' ? 'M5 9 L12 16 L19 9' : 'M9 5 L16 12 L9 19';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
