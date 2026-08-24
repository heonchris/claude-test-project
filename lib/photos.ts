import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** 사진은 DB에 넣지 않는다. 앱 전용 폴더에 파일로 두고 경로만 기록한다. (SPEC 2) */
const PHOTO_DIR_NAME = 'photos';
const MAX_WIDTH = 1080;

function photoDir(): Directory {
  const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function newName(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
}

/** 가로 1080px로 줄여 저장하고, 앱 폴더 안의 최종 경로를 돌려준다. */
export async function savePhoto(sourceUri: string): Promise<string> {
  const dir = photoDir();
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize({ width: MAX_WIDTH });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });

  const temp = new File(saved.uri);
  const dest = new File(dir, newName());
  try {
    temp.moveSync(dest);
  } catch {
    temp.copySync(dest);
  }
  return dest.uri;
}

export function deletePhoto(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // 이미 없으면 그만
  }
}

export type PhotoStats = { count: number; bytes: number };

export function photoStats(): PhotoStats {
  try {
    const dir = photoDir();
    let count = 0;
    let bytes = 0;
    for (const entry of dir.list()) {
      if (entry instanceof File) {
        count += 1;
        bytes += entry.size ?? 0;
      }
    }
    return { count, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

/** DB에서 참조하지 않는 사진 파일 정리 */
export function removeOrphanPhotos(keepUris: string[]): number {
  try {
    const keep = new Set(keepUris.map((u) => u.split('/').pop()));
    let removed = 0;
    for (const entry of photoDir().list()) {
      if (entry instanceof File && !keep.has(entry.name)) {
        entry.delete();
        removed += 1;
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
