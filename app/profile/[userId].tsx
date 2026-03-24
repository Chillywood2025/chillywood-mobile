import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
    ImageBackground,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { titles as localTitles } from "../../_data/titles";

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = String(Array.isArray(params.userId) ? params.userId[0] : params.userId ?? "").trim();
  const username = userId ? `User·${userId.slice(-4)}` : "User";

  const backgroundSource = (() => {
    const first = localTitles[0] as any;
    return first?.image || first?.poster || undefined;
  })();

  return (
    <View style={styles.outerFlex}>
      {backgroundSource ? (
        <ImageBackground
          source={backgroundSource}
          style={styles.fullBackground}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.fullBackgroundFallback} pointerEvents="none" />
      )}
      <View style={styles.fullBackgroundOverlay} pointerEvents="none" />

      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>CHILLYWOOD · PROFILE</Text>
          <View style={{ width: 18 }} />
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>{username.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={styles.username}>{username}</Text>
          <Text style={styles.userIdLabel}>@{userId || "unknown"}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Videos</Text>
          <Text style={styles.sectionBody}>No videos yet.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Likes</Text>
          <Text style={styles.sectionBody}>No likes yet.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Saved</Text>
          <Text style={styles.sectionBody}>No saved items yet.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerFlex: { flex: 1 },
  fullBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  fullBackgroundFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B0B10",
  },
  fullBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  screen: { flex: 1, backgroundColor: "transparent" },
  content: { paddingTop: 56, paddingBottom: 48, paddingHorizontal: 18, gap: 14 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backArrow: { color: "#aaa", fontSize: 20, fontWeight: "700", paddingRight: 8 },
  kicker: { color: "#555", fontSize: 9.5, fontWeight: "800", letterSpacing: 1.2 },

  profileCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 18,
    alignItems: "center",
    gap: 8,
  },
  avatarCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 38, fontWeight: "900" },
  username: { color: "#fff", fontSize: 26, fontWeight: "900" },
  userIdLabel: { color: "#A0A0A0", fontSize: 13, fontWeight: "700" },

  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 16,
    gap: 6,
  },
  sectionTitle: { color: "#ECECEC", fontSize: 16, fontWeight: "900" },
  sectionBody: { color: "#8B8B8B", fontSize: 13, lineHeight: 18, fontWeight: "600" },
});
