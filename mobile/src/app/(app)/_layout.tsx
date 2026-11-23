import { Tabs } from "expo-router";
import { Pressable, Text } from "react-native";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme";

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.text, fontWeight: "700" },
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.muted,
        tabBarIconStyle: { display: "none" },
        tabBarLabelStyle: { fontSize: 14, fontWeight: "600" },
        headerRight: () => (
          <Pressable onPress={() => supabase.auth.signOut()} accessibilityRole="button" style={{ paddingHorizontal: 16 }}>
            <Text style={{ color: colors.navySoft, fontWeight: "500" }}>Sign out</Text>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Wallet" }} />
      <Tabs.Screen name="assistant" options={{ title: "Assistant" }} />
    </Tabs>
  );
}
