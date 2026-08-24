import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** 로컬 알림만 쓴다. 서버도 푸시 토큰도 없다. (SPEC 1-2) */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type Reminder = { id: 'meal' | 'water'; title: string; body: string };

const REMINDERS: Reminder[] = [
  { id: 'meal', title: '오늘 뭐 드셨어요?', body: '사진 한 장만 남겨두면 돼요.' },
  { id: 'water', title: '물 한 잔 어때요', body: '고양이가 목이 마르대요.' },
];

export function parseTime(value: string, fallback: [number, number]): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() ?? '');
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return [h, min];
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function cancelReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** on/off + 시간 두 개. 켤 때마다 전부 다시 건다. */
export async function applyReminders(options: {
  enabled: boolean;
  mealTime: string;
  waterTime: string;
}): Promise<boolean> {
  await cancelReminders();
  if (!options.enabled) return true;

  if (!(await ensurePermission())) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: '기록 알림',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const times: Record<Reminder['id'], [number, number]> = {
    meal: parseTime(options.mealTime, [12, 30]),
    water: parseTime(options.waterTime, [15, 0]),
  };

  for (const reminder of REMINDERS) {
    const [hour, minute] = times[reminder.id];
    await Notifications.scheduleNotificationAsync({
      content: { title: reminder.title, body: reminder.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: 'reminders',
      },
    });
  }
  return true;
}
