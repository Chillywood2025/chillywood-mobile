import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  buildUserChannelProfile,
  readUserProfile,
  type UserChannelProfile,
} from "../../_lib/userData";
import { getWritablePartyUserId } from "../../_lib/watchParty";

type MainTabTopBarProps = {
  surface: "home" | "explore" | "live" | "library";
  label: string;
  style?: StyleProp<ViewStyle>;
};

export function MainTabTopBar({ surface, label, style }: MainTabTopBarProps) {
  const [profile, setProfile] = useState<UserChannelProfile | null>(null);

  const refreshProfile = useCallback(async () => {
    const [userProfile, userId] = await Promise.all([
      readUserProfile().catch(() => null),
      getWritablePartyUserId().catch(() => null),
    ]);

    const safeUserId = String(userId ?? "").trim();
    if (!safeUserId) {
      setProfile(null);
      return;
    }

    setProfile(buildUserChannelProfile({
      id: safeUserId,
      profile: userProfile,
      fallbackDisplayName: "You",
      isLive: false,
    }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
    }, [refreshProfile]),
  );

  const openProfile = () => {
    if (!profile?.id) return;
    router.push({
      pathname: "/profile/[userId]",
      params: {
        userId: profile.id,
        displayName: profile.displayName,
        role: profile.role,
        isLive: "0",
        self: "1",
        ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
        ...(profile.tagline ? { tagline: profile.tagline } : {}),
      },
    });
  };

  const initial = String(profile?.displayName ?? "You").slice(0, 1).toUpperCase() || "Y";

  return (
    <View testID={`main-tab-${surface}-top-bar`} style={[styles.row, style]}>
      <Text style={styles.kicker}>{label}</Text>
      <View style={styles.actions}>
        <TouchableOpacity
          testID={`main-tab-${surface}-settings-action`}
          style={styles.settingsButton}
          onPress={() => router.push("/settings")}
          activeOpacity={0.86}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <MaterialIcons name="settings" size={17} color="#F4F7FC" />
        </TouchableOpacity>
        <TouchableOpacity
          testID={`main-tab-${surface}-profile-entry`}
          style={[styles.avatarButton, !profile?.id && styles.avatarButtonDisabled]}
          onPress={openProfile}
          activeOpacity={0.86}
          disabled={!profile?.id}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Open your Profile"
        >
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  kicker: {
    color: "#8D98AE",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  settingsButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(12,12,16,0.68)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(12,12,16,0.84)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarButtonDisabled: {
    opacity: 0.5,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  avatarInitial: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
});
