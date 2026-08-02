import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { getChatThreadByActiveCommunicationRoomId } from "../../_lib/chat";

type SearchParams = {
  roomId?: string | string[];
};

const firstParam = (value: string | string[] | undefined) =>
  String(Array.isArray(value) ? value[0] : value ?? "").trim();

export default function CommunicationRoomCompatibilityRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<SearchParams>();
  const roomId = firstParam(params.roomId);

  const targetLabel = useMemo(
    () => (roomId ? "Opening Chi'lly Chat" : "Opening Chi'lly Chat inbox"),
    [roomId],
  );

  useEffect(() => {
    let active = true;

    async function resolveCompatibilityRoute() {
      if (!roomId) {
        router.replace("/chat");
        return;
      }

      const thread = await getChatThreadByActiveCommunicationRoomId(roomId).catch(() => null);
      if (!active) return;

      if (thread?.threadId) {
        router.replace({
          pathname: "/chat/[threadId]",
          params: {threadId: thread.threadId},
        });
        return;
      }

      router.replace("/chat");
    }

    void resolveCompatibilityRoute();

    return () => {
      active = false;
    };
  }, [roomId, router]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color="#F4F7FC" />
      <Text style={styles.title}>{targetLabel}</Text>
      <Text style={styles.body}>Checking the compatibility route for this call.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: "#06070B",
  },
  title: {
    color: "#F4F7FC",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  body: {
    maxWidth: 280,
    color: "#A4AEC4",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
  },
});
