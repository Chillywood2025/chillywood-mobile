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
  readCachedUserProfile,
  readUserProfile,
  type UserChannelProfile,
} from "../../_lib/userData";
import { getWritablePartyUserId } from "../../_lib/watchParty";
import {
  getMainTabHeaderProfileSnapshot,
  setMainTabHeaderProfileSnapshot,
} from "./main-tab-profile-cache";

type MainTabTopBarProps = {
  surface: "home" | "explore" | "live" | "library";
  label: string;
  style?: StyleProp<ViewStyle>;
};

export function MainTabTopBar({ surface, label, style }: MainTabTopBarProps) {
  const initialProfileSnapshot = getMainTabHeaderProfileSnapshot();
  const [profile, setProfile] = useState<UserChannelProfile | null>(() => initialProfileSnapshot.profile);
  const [profileResolved, setProfileResolved] = useState(() => initialProfileSnapshot.resolved);

  const applyProfile = useCallback((nextProfile: UserChannelProfile | null, resolved = true) => {
    setMainTabHeaderProfileSnapshot(nextProfile, resolved);
    setProfile((existingProfile) => {
      if (
        nextProfile
        && !resolved
        && !nextProfile.avatarUrl
        && existingProfile?.id === nextProfile.id
        && existingProfile.avatarUrl
      ) {
        return existingProfile;
      }

      return nextProfile;
    });
    setProfileResolved(resolved);
  }, []);

  const refreshProfile = useCallback(async () => {
    const [cachedProfile, userId] = await Promise.all([
      readCachedUserProfile().catch(() => null),
      getWritablePartyUserId().catch(() => null),
    ]);

    const safeUserId = String(userId ?? "").trim();
    if (!safeUserId) {
      applyProfile(null);
      return;
    }

    if (cachedProfile?.username) {
      const cachedChannel = buildUserChannelProfile({
        id: safeUserId,
        profile: cachedProfile,
        fallbackDisplayName: "You",
        isLive: false,
      });
      applyProfile(cachedChannel, !!cachedChannel.avatarUrl);
    }

    const userProfile = await readUserProfile().catch(() => cachedProfile);
    applyProfile(buildUserChannelProfile({
      id: safeUserId,
      profile: userProfile,
      fallbackDisplayName: "You",
      isLive: false,
    }));
  }, [applyProfile]);

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
      <View style={styles.labelGroup}>
        <TouchableOpacity
          testID={`main-tab-${surface}-settings-action`}
          style={styles.settingsButton}
          onPress={() => router.push("/settings")}
          activeOpacity={0.86}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <MaterialIcons name="settings" size={18} color="#F4F7FC" />
        </TouchableOpacity>
        <Text style={styles.kicker}>{label}</Text>
      </View>
      <View style={styles.actions}>
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
          ) : profileResolved ? (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          ) : (
            <View style={styles.avatarPlaceholder} />
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
    fontWeight: "800",
    letterSpacing: 0,
  },
  labelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
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
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  avatarInitial: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
});
