import { useCallback, useState } from "react";
import { Redirect, Tabs, router } from "expo-router";
import { Pressable, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { getMe } from "@/lib/api/mobile";
import {
  IconCalendar,
  IconClock,
  IconPeople,
  IconPerson,
  IconSun,
  IconWallet,
} from "@/theme/TabIcons";
import { colors } from "@/theme/tokens";

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontFamily: focused ? "Manrope_700Bold" : "Manrope_500Medium",
        color: focused ? colors.lagoon : colors.muted,
      }}
    >
      {label}
    </Text>
  );
}

export default function AppLayout() {
  const { session, loading } = useAuth();
  const [isManager, setIsManager] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      getMe()
        .then((me) => {
          setIsManager(
            Boolean(me.is_manager) || me.profile.role === "manager",
          );
        })
        .catch(() => setIsManager(false));
    }, [session]),
  );

  if (!loading && !session) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.lagoon },
        headerTintColor: colors.white,
        headerTitleStyle: {
          fontFamily: "Fraunces_600SemiBold",
          fontSize: 18,
          color: colors.white,
        },
        tabBarActiveTintColor: colors.lagoon,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.line,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Pointage",
          tabBarIcon: ({ color, size }) => (
            <IconClock color={color} size={size} />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Pointage" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: "Équipe",
          href: isManager ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <IconPeople color={color} size={size} />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Équipe" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: "Mes congés",
          tabBarIcon: ({ color, size }) => <IconSun color={color} size={size} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Congés" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="pay"
        options={{
          title: "Ma paie",
          tabBarIcon: ({ color, size }) => <IconWallet color={color} size={size} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Paie" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          href: null,
          title: "Scanner le QR",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingHorizontal: 16 }}>
              <Text style={{ color: colors.white, fontSize: 26 }}>‹</Text>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="payslip/[id]"
        options={{
          href: null,
          title: "Bulletin de paie",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingHorizontal: 16 }}>
              <Text style={{ color: colors.white, fontSize: 26 }}>‹</Text>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Historique",
          tabBarIcon: ({ color, size }) => (
            <IconCalendar color={color} size={size} />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Historique" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => (
            <IconPerson color={color} size={size} />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Profil" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
