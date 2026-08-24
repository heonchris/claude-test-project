import { Tabs } from 'expo-router';
import { CalendarIcon, CatFaceIcon, ListIcon, SlidersIcon } from '../../components/Icons';
import { useFontsReady } from '../../components/Txt';
import { colors } from '../../theme/colors';
import { families } from '../../theme/typography';

export default function TabsLayout() {
  const fontsReady = useFontsReady();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSub,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.line,
          height: 62,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: fontsReady ? families.body : undefined,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '오늘',
          tabBarIcon: ({ color }) => <CatFaceIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '기록',
          tabBarIcon: ({ color }) => <CalendarIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: '플랜',
          tabBarIcon: ({ color }) => <ListIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color }) => <SlidersIcon color={color} />,
        }}
      />
    </Tabs>
  );
}
