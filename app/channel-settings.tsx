import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  DEFAULT_APP_CONFIG,
  readAppConfig,
  resolveBrandingConfig,
  resolveFeatureConfig,
} from "../_lib/appConfig";
import { getBetaAccessBlockCopy, useBetaProgram } from "../_lib/betaProgram";
import { useSession } from "../_lib/session";
import {
  readCreatorPermissions,
  sanitizeCreatorRoomAccessRule,
  type CreatorPermissionSet,
} from "../_lib/monetization";
import type { UserChannelRole, UserProfile } from "../_lib/userData";
import { normalizeUserProfile, readUserProfile, saveUserProfile } from "../_lib/userData";
import { BetaAccessScreen } from "../components/system/beta-access-screen";

const SKYLINE_SOURCE = require("../assets/images/chicago-skyline.jpg");

export default function ChannelSettingsScreen() {
  const router = useRouter();
  const { isLoading: authLoading, isSignedIn } = useSession();
  const { accessState, isLoading: betaLoading, isActive } = useBetaProgram();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsEnabled, setSettingsEnabled] = useState(true);
  const [appDisplayName, setAppDisplayName] = useState(DEFAULT_APP_CONFIG.branding.appDisplayName);
  const [creatorPermissions, setCreatorPermissions] = useState<CreatorPermissionSet | null>(null);
  const canUseChannelSettings = isSignedIn && isActive;
  const blockedBetaCopy = getBetaAccessBlockCopy(accessState.status, "Channel settings");

  useEffect(() => {
    if (!canUseChannelSettings) {
      setLoading(false);
      return;
    }
    let active = true;

    Promise.all([
      readUserProfile(),
      readAppConfig().catch(() => DEFAULT_APP_CONFIG),
      readCreatorPermissions().catch(() => null),
    ])
      .then(([resolvedProfile, resolvedConfig, resolvedPermissions]) => {
        if (!active) return;
        setProfile(normalizeUserProfile(resolvedProfile));
        setSettingsEnabled(resolveFeatureConfig(resolvedConfig).creatorSettingsEnabled);
        setAppDisplayName(resolveBrandingConfig(resolvedConfig).appDisplayName);
        setCreatorPermissions(resolvedPermissions);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setProfile(normalizeUserProfile({ username: "", avatarIndex: 0 }));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canUseChannelSettings]);

  const updateProfile = (patch: Partial<UserProfile>) => {
    setProfile((prev) => normalizeUserProfile({ ...(prev ?? {}), ...patch }));
    setNotice(null);
  };

  const onSave = async () => {
    if (!profile) return;

    try {
      setSaving(true);
      const normalized = normalizeUserProfile({
        ...profile,
        defaultWatchPartyContentAccessRule: sanitizeCreatorRoomAccessRule(
          profile.defaultWatchPartyContentAccessRule,
          creatorPermissions,
        ),
        defaultCommunicationContentAccessRule: sanitizeCreatorRoomAccessRule(
          profile.defaultCommunicationContentAccessRule,
          creatorPermissions,
        ),
      });
      await saveUserProfile(normalized);
      setProfile(normalized);
      setNotice("Channel settings saved.");
    } catch {
      setNotice("Unable to save channel settings right now.");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || betaLoading) {
    return (
      <BetaAccessScreen
        title="Loading channel access"
        body="Checking your signed-in identity before opening channel settings."
        loadingOverride
      />
    );
  }

  if (!isSignedIn) {
    return (
      <BetaAccessScreen
        title="Sign in to manage your channel"
        body="Channel settings stay behind signed-in access because they change creator defaults and room options."
      />
    );
  }

  if (!isActive) {
    return (
      <BetaAccessScreen
        title={blockedBetaCopy.title}
        body={blockedBetaCopy.body}
        accessState={accessState.status === "loading" || accessState.status === "signed_out" || accessState.status === "active" ? null : accessState.status}
      />
    );
  }

  return (
    <ImageBackground source={SKYLINE_SOURCE} style={styles.background} resizeMode="cover">
      <View style={styles.overlay} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>{appDisplayName.toUpperCase()} · CHANNEL</Text>
          <View style={{ width: 18 }} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Manage Channel</Text>
          <Text style={styles.heroBody}>
            Update your local channel identity and the default rules new rooms should inherit before live room truth takes over.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>Loading channel settings…</Text>
          </View>
        ) : !settingsEnabled ? (
          <View style={styles.disabledCard}>
            <Text style={styles.disabledTitle}>Channel settings are hidden</Text>
            <Text style={styles.disabledBody}>
              The creator settings entry is currently disabled in global app config.
            </Text>
          </View>
        ) : profile ? (
          <>
            {notice ? (
              <View style={styles.noticeCard}>
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null}

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Channel Identity</Text>
              <TextInput
                style={styles.input}
                placeholder="Display name"
                placeholderTextColor="#8d8d8d"
                value={profile.displayName ?? ""}
                onChangeText={(text) => updateProfile({ displayName: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Tagline"
                placeholderTextColor="#8d8d8d"
                value={profile.tagline ?? ""}
                onChangeText={(text) => updateProfile({ tagline: text })}
              />
              <Text style={styles.sectionLabel}>Channel Role</Text>
              <View style={styles.chipRow}>
                {(["viewer", "host", "creator"] as UserChannelRole[]).map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[styles.chip, profile.channelRole === role && styles.chipActive]}
                    onPress={() => updateProfile({ channelRole: role })}
                  >
                    <Text style={[styles.chipText, profile.channelRole === role && styles.chipTextActive]}>
                      {role.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Watch Party Defaults</Text>
              <Text style={styles.permissionCopy}>
                Backend creator grants decide whether Party Pass and Premium room defaults are actually available for this channel.
              </Text>
              <Text style={styles.sectionLabel}>Join Policy</Text>
              <View style={styles.chipRow}>
                {(["open", "locked"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, profile.defaultWatchPartyJoinPolicy === value && styles.chipActive]}
                    onPress={() => updateProfile({ defaultWatchPartyJoinPolicy: value })}
                  >
                    <Text style={[styles.chipText, profile.defaultWatchPartyJoinPolicy === value && styles.chipTextActive]}>
                      {value.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Reactions</Text>
              <View style={styles.chipRow}>
                {(["enabled", "muted"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, profile.defaultWatchPartyReactionsPolicy === value && styles.chipActive]}
                    onPress={() => updateProfile({ defaultWatchPartyReactionsPolicy: value })}
                  >
                    <Text style={[styles.chipText, profile.defaultWatchPartyReactionsPolicy === value && styles.chipTextActive]}>
                      {value.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Content Access</Text>
              <View style={styles.chipRow}>
                {(["open", "party_pass", "premium"] as const).map((value) => {
                  const blocked =
                    (value === "party_pass" && creatorPermissions?.canUsePartyPassRooms === false)
                    || (value === "premium" && creatorPermissions?.canUsePremiumRooms === false);

                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.chip,
                        profile.defaultWatchPartyContentAccessRule === value && styles.chipActive,
                        blocked && styles.chipDisabled,
                      ]}
                      onPress={() => {
                        if (blocked) return;
                        updateProfile({ defaultWatchPartyContentAccessRule: value });
                      }}
                      disabled={blocked}
                    >
                      <Text style={[styles.chipText, profile.defaultWatchPartyContentAccessRule === value && styles.chipTextActive]}>
                        {value.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>Capture Policy</Text>
              <View style={styles.chipRow}>
                {(["best_effort", "host_managed"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, profile.defaultWatchPartyCapturePolicy === value && styles.chipActive]}
                    onPress={() => updateProfile({ defaultWatchPartyCapturePolicy: value })}
                  >
                    <Text style={[styles.chipText, profile.defaultWatchPartyCapturePolicy === value && styles.chipTextActive]}>
                      {value.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Communication Defaults</Text>
              <Text style={styles.permissionCopy}>
                Communication room access follows the same backend grants, even though these defaults stay local to this device for now.
              </Text>

              <Text style={styles.sectionLabel}>Content Access</Text>
              <View style={styles.chipRow}>
                {(["open", "party_pass", "premium"] as const).map((value) => {
                  const blocked =
                    (value === "party_pass" && creatorPermissions?.canUsePartyPassRooms === false)
                    || (value === "premium" && creatorPermissions?.canUsePremiumRooms === false);

                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.chip,
                        profile.defaultCommunicationContentAccessRule === value && styles.chipActive,
                        blocked && styles.chipDisabled,
                      ]}
                      onPress={() => {
                        if (blocked) return;
                        updateProfile({ defaultCommunicationContentAccessRule: value });
                      }}
                      disabled={blocked}
                    >
                      <Text style={[styles.chipText, profile.defaultCommunicationContentAccessRule === value && styles.chipTextActive]}>
                        {value.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>Capture Policy</Text>
              <View style={styles.chipRow}>
                {(["best_effort", "host_managed"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, profile.defaultCommunicationCapturePolicy === value && styles.chipActive]}
                    onPress={() => updateProfile({ defaultCommunicationCapturePolicy: value })}
                  >
                    <Text style={[styles.chipText, profile.defaultCommunicationCapturePolicy === value && styles.chipTextActive]}>
                      {value.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={onSave} activeOpacity={0.88} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Channel Settings</Text>}
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,8,14,0.8)",
  },
  content: {
    paddingTop: 54,
    paddingBottom: 44,
    paddingHorizontal: 16,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backArrow: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  kicker: {
    color: "#AAB3C7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,16,24,0.88)",
    padding: 16,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
  },
  heroBody: {
    color: "#B8C1D6",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    fontWeight: "600",
  },
  permissionCopy: {
    color: "#93A0B8",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  loadingCard: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: "rgba(14,18,26,0.88)",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "#D5DDED",
    fontSize: 13,
    fontWeight: "700",
  },
  disabledCard: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: "rgba(25,18,18,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  disabledTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  disabledBody: {
    color: "#C4CAD7",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  noticeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(45,153,92,0.45)",
    backgroundColor: "rgba(45,153,92,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: {
    color: "#F4FFF7",
    fontSize: 12,
    fontWeight: "700",
  },
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,16,24,0.9)",
    padding: 16,
  },
  panelTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 12,
  },
  sectionLabel: {
    color: "#AAB6CD",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: "#DC143C",
    backgroundColor: "rgba(220,20,60,0.22)",
  },
  chipDisabled: {
    opacity: 0.42,
  },
  chipText: {
    color: "#DADFEA",
    fontSize: 11,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#fff",
  },
  saveButton: {
    borderRadius: 14,
    backgroundColor: "#DC143C",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
});
