/**
 * 사진에 박혀 있는 촬영 시각(EXIF)을 꺼낸다.
 * 기기·앨범마다 키 이름이 조금씩 달라서 후보를 차례로 본다.
 * 못 찾으면 null. 그때는 저장한 시각을 대신 쓴다.
 */
export function takenAtFromExif(exif: Record<string, unknown> | null | undefined): Date | null {
  if (!exif) return null;

  const nested = (key: string): unknown => {
    const group = exif[key];
    if (group && typeof group === 'object') {
      const g = group as Record<string, unknown>;
      return g.DateTimeOriginal ?? g.DateTimeDigitized ?? g.DateTime;
    }
    return undefined;
  };

  const candidates: unknown[] = [
    exif.DateTimeOriginal,
    exif.DateTimeDigitized,
    exif.DateTime,
    nested('{Exif}'),
    nested('{TIFF}'),
    exif.creationTime,
  ];

  for (const candidate of candidates) {
    const parsed = parseExifDate(candidate);
    if (parsed) return parsed;
  }
  return null;
}

/** EXIF 표준 형식은 '2026:08:24 12:34:56' 이라 Date가 그대로 못 읽는다. */
function parseExifDate(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  if (typeof value !== 'string') return null;

  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (match) {
    const [, y, mo, d, h, mi, s] = match;
    const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const fallback = Date.parse(value);
  return Number.isFinite(fallback) ? new Date(fallback) : null;
}
