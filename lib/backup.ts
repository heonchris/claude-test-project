import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { exportAll, importAll, type Backup } from '../db/queries';
import { todayKey } from './dates';

/**
 * SPEC 4-5. 백업 수단이 이것뿐이라 반드시 동작해야 한다.
 * 사진 파일은 용량 때문에 담지 않는다 (경로만 담긴다).
 */
export async function exportToFile(): Promise<string> {
  const data = await exportAll();
  const dir = new Directory(Paths.cache, 'export');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

  const file = new File(dir, `냥집사-백업-${todayKey()}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(data, null, 2));
  return file.uri;
}

export async function shareBackup(): Promise<{ shared: boolean; uri: string }> {
  const uri = await exportToFile();
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: '냥집사 기록 내보내기',
    });
    return { shared: true, uri };
  }
  return { shared: false, uri };
}

export type ImportResult = { ok: true; counts: string } | { ok: false; reason: string };

export async function importFromFile(): Promise<ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', '*/*'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.length) return null;

  try {
    const text = await new File(picked.assets[0].uri).text();
    const parsed = JSON.parse(text) as Backup;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.meals)) {
      return { ok: false, reason: '냥집사에서 내보낸 JSON 파일이 아닌 것 같아요.' };
    }
    await importAll(parsed);
    const counts = `식단 ${parsed.meals.length}개 · 운동 ${(parsed.workouts ?? []).length}개 · 물 ${
      (parsed.water ?? []).length
    }일`;
    return { ok: true, counts };
  } catch {
    return { ok: false, reason: '파일을 읽지 못했어요. 내보낸 JSON 파일이 맞는지 확인해 주세요.' };
  }
}
