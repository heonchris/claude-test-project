import type { RecordKind } from './progress';

/**
 * 저장 직후 고양이가 반응하는 연출(SPEC 6-1)을 위해
 * 기록 화면 -> 오늘 화면으로 한 번만 전달되는 신호.
 * 무엇을 남겼는지까지 담아서, 밥이면 먹는 동작 / 운동이면 뛰는 동작이 나온다.
 */
let pending: RecordKind | null = null;

export function markSaved(kind: RecordKind) {
  pending = kind;
}

export function consumeSaved(): RecordKind | null {
  const was = pending;
  pending = null;
  return was;
}
