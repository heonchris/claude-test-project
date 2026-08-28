import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * 사진은 DB에 넣지 않는다. 앱 전용 폴더에 파일로 두고 **파일 이름만** 기록한다. (SPEC 2)
 *
 * ⚠️ 절대경로를 저장하면 안 된다.
 * iOS는 앱을 다시 설치할 때마다 앱 폴더의 주소(UUID)가 바뀐다.
 * 이 앱은 7일마다 재설치하는 방식으로 쓰기 때문에, 절대경로를 저장해 두면
 * 재설치 후 **모든 사진이 한꺼번에 깨진다.**
 * 그래서 이름만 저장하고, 볼 때 현재 앱 폴더 주소와 합친다.
 */
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

/** 저장된 값에서 파일 이름만 뽑는다. 예전에 저장한 절대경로도 받아준다. */
export function photoName(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const name = stored.split('/').pop();
  return name ? decodeURIComponent(name) : null;
}

/** DB에 저장된 값 → 지금 화면에 띄울 수 있는 주소 */
export function resolvePhotoUri(stored: string | null | undefined): string | null {
  const name = photoName(stored);
  if (!name) return null;
  try {
    return new File(photoDir(), name).uri;
  } catch {
    return null;
  }
}

/** 가로 1080px로 줄여 저장하고, **파일 이름**을 돌려준다. */
export async function savePhoto(sourceUri: string): Promise<string> {
  const dir = photoDir();
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize({ width: MAX_WIDTH });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });

  const temp = new File(saved.uri);
  const name = newName();
  const dest = new File(dir, name);
  try {
    temp.moveSync(dest);
  } catch {
    temp.copySync(dest);
    try {
      temp.delete();
    } catch {
      // 캐시에 남아도 시스템이 정리한다
    }
  }
  return name;
}

export function deletePhoto(stored: string | null | undefined): void {
  const name = photoName(stored);
  if (!name) return;
  try {
    const file = new File(photoDir(), name);
    if (file.exists) file.delete();
  } catch {
    // 이미 없으면 그만
  }
}

export type PhotoStats = { count: number; bytes: number };

export function photoStats(): PhotoStats {
  try {
    let count = 0;
    let bytes = 0;
    for (const entry of photoDir().list()) {
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
export function removeOrphanPhotos(keep: (string | null)[]): number {
  try {
    const keepNames = new Set(
      keep.map((value) => photoName(value)).filter((name): name is string => !!name)
    );
    let removed = 0;
    for (const entry of photoDir().list()) {
      if (entry instanceof File && !keepNames.has(entry.name)) {
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
