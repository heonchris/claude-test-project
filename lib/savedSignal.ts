/**
 * 저장 직후 고양이가 깜짝 놀라는 연출(SPEC 6-1 startled)을 위해
 * 기록 화면 -> 오늘 화면으로 한 번만 전달되는 신호.
 */
let pending = false;

export function markSaved() {
  pending = true;
}

export function consumeSaved(): boolean {
  const was = pending;
  pending = false;
  return was;
}
