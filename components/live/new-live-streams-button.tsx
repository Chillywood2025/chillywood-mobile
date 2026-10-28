import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

/** Reserve the same space before/after a hint; never move the cards on arrival. */
export function NewLiveStreamsButton({ pendingItemCount, onRefresh }: {
  pendingItemCount: number;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const refresh = async () => {
    if (running.current || !(pendingItemCount > 0)) return;
    running.current = true;
    setBusy(true);
    try { await onRefresh(); }
    catch { /* The discovery reader owns its error and retry presentation. */ }
    finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <View style={styles.slot} testID="new-live-streams-slot">
      {pendingItemCount > 0 ? (
        <Pressable
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={busy ? "Checking live streams" : "New live streams"}
          accessibilityHint="Refreshes this live list without opening a stream"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          testID="new-live-streams-button"
          onPress={() => { void refresh(); }}
        >
          <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.5}>
            {busy ? "Checking live streams…" : "New live streams"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { height: 44, width: 164, justifyContent: "center", alignItems: "flex-end" },
  button: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 22, backgroundColor: "#15394C" },
  label: { color: "#E2F5FF", fontSize: 14, fontWeight: "700" },
});
