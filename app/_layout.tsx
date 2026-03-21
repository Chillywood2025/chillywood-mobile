import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack initialRouteName="(tabs)" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="player/[id]" />
      <Stack.Screen name="title/[id]" />
      <Stack.Screen name="watch-party" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
    </Stack>
  );
}