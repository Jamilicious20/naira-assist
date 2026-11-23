import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { SessionProvider, useSession } from "@/hooks/useSession";
import { useChatStore } from "@/stores/appChat";
import { colors } from "@/theme";

const queryClient = new QueryClient();

function RootNavigator() {
  const { session, isLoading } = useSession();
  const previousUser = useRef<string | undefined>(undefined);

  // When the signed-in user changes, drop cached wallet data and chat so nothing leaks between accounts.
  useEffect(() => {
    const userId = session?.user.id;
    if (previousUser.current !== undefined && previousUser.current !== userId) {
      queryClient.clear();
      useChatStore.getState().reset();
    }
    previousUser.current = userId;
  }, [session?.user.id]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.navy} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)/sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </SessionProvider>
    </QueryClientProvider>
  );
}
