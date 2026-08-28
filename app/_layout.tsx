import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FontsReadyProvider, Txt } from '../components/Txt';
import { initDb } from '../db';
import { getSettings } from '../db/queries';
import { applyReminders } from '../lib/notify';
import { colors, screenPadding, space } from '../theme/colors';
import { useAppFonts } from '../theme/typography';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsDone, fontsOk] = useAppFonts();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    initDb()
      .then(async () => {
        setDbReady(true);
        // 앱을 다시 설치하면 예약해 둔 알림이 사라진다.
        // 설정이 켜져 있으면 시작할 때 조용히 다시 걸어준다.
        try {
          const settings = await getSettings();
          if (settings.reminder_on === '1') {
            await applyReminders({
              enabled: true,
              mealTime: settings.reminder_meal_time || '12:30',
              waterTime: settings.reminder_water_time || '15:00',
            });
          }
        } catch {
          // 알림은 실패해도 앱 사용에 지장이 없다
        }
      })
      .catch((e: unknown) => setDbError(String(e)));
  }, []);

  const ready = fontsDone && (dbReady || dbError !== null);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  if (dbError) {
    return (
      <SafeAreaProvider>
        <View style={styles.error}>
          <Txt variant="title">기록 창고를 여는 데 실패했어요</Txt>
          <Txt variant="sub" color={colors.textSub} center>
            앱을 완전히 종료했다가 다시 열어보세요.
          </Txt>
          <Txt variant="caption" color={colors.textSub} center>
            {dbError}
          </Txt>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <FontsReadyProvider value={fontsOk}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="add/meal"
            options={{ presentation: 'modal', headerShown: false }}
          />
          <Stack.Screen
            name="add/workout"
            options={{ presentation: 'modal', headerShown: false }}
          />
        </Stack>
      </SafeAreaProvider>
    </FontsReadyProvider>
  );
}

const styles = StyleSheet.create({
  error: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(3),
    paddingHorizontal: screenPadding,
  },
});
