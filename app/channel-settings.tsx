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

type ChannelSettingsSectionStatus = "current" | "near_term" | "later_phase";

type ChannelSettingsSectionModel = {
  title: string;
  status: ChannelSettingsSectionStatus;
  body: string;
};

type ChannelAccessSummaryDetail = {
  label: string;
  value: string;
  body: string;
};

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

  const sectionMap: readonly ChannelSettingsSectionModel[] = [
    {
      title: "Identity",
      status: "current",
      body: "Display name, tagline, role framing, and creator-facing identity controls live here now.",
    },
    {
      title: "Design",
      status: "near_term",
      body: "Hero treatment, accent direction, and visible branding style belong here on this same route.",
    },
    {
      title: "Layout",
      status: "near_term",
      body: "Homepage block order, tab emphasis, and shelf hierarchy will expand here without route drift.",
    },
    {
      title: "Content",
      status: "near_term",
      body: "Featured titles, spotlight choices, and curated public shelves belong here as creator controls deepen.",
    },
    {
      title: "Access & Monetization",
      status: "near_term",
      body: "Watch-party and communication access defaults anchor the future access and monetization layer here.",
    },
    {
      title: "Audience",
      status: "later_phase",
      body: "Public activity visibility and future audience posture controls should land later under this route.",
    },
    {
      title: "Analytics",
      status: "later_phase",
      body: "Channel performance, conversion, and engagement insight stay planned here, not in a new studio route.",
    },
    {
      title: "Safety/Admin",
      status: "later_phase",
      body: "Creator safety posture, moderation links, and admin-aware helpers stay mapped here for later phases.",
    },
  ];
  const designSectionHighlights = [
    "Hero treatment",
    "Avatar framing",
    "Accent direction",
    "Brand presence",
  ] as const;
  const layoutSectionHighlights = [
    "Home block order",
    "Default tab emphasis",
    "Shelf hierarchy",
    "Live module priority",
  ] as const;
  const contentSectionHighlights = [
    "Spotlight pick",
    "Featured shelves",
    "Programming rows",
    "Public activity curation",
  ] as const;
  const resolvedWatchPartyAccessRule = sanitizeCreatorRoomAccessRule(
    profile?.defaultWatchPartyContentAccessRule,
    creatorPermissions,
  );
  const resolvedCommunicationAccessRule = sanitizeCreatorRoomAccessRule(
    profile?.defaultCommunicationContentAccessRule,
    creatorPermissions,
  );
  const resolvedWatchPartyJoinPolicy = profile?.defaultWatchPartyJoinPolicy ?? "open";
  const accessSummary = !profile
    ? {
        title: "Loading Access",
        body: "Checking saved defaults and creator grants before showing the channel access posture.",
      }
    : resolvedWatchPartyAccessRule !== "open" && resolvedCommunicationAccessRule !== "open"
      ? {
          title: "Subscriber Access",
          body: "Both watch-party and communication defaults are gated, so this channel should visibly prepare visitors for member-style access.",
        }
      : resolvedWatchPartyJoinPolicy === "locked"
        ? {
            title: "Private",
            body: "Watch-party entry is locked by default, so private/invite-controlled room behavior should stay explicit on public surfaces.",
          }
        : resolvedWatchPartyAccessRule === "open" && resolvedCommunicationAccessRule === "open"
          ? {
              title: "Public",
              body: "The channel currently defaults to open communication and open watch-party access, so public surfaces should keep that honest and visible.",
            }
          : {
              title: "Mixed Access",
              body: "This channel mixes open and gated defaults, so the public route needs to signal where access changes instead of hiding it.",
            };
  const accessSummaryDetails: readonly ChannelAccessSummaryDetail[] = [
    {
      label: "Watch Party",
      value: resolvedWatchPartyAccessRule === "open"
        ? "Public"
        : resolvedWatchPartyAccessRule === "party_pass"
          ? "Party Pass"
          : "Premium",
      body: resolvedWatchPartyJoinPolicy === "locked" ? "locked join policy" : "open join policy",
    },
    {
      label: "Communication",
      value: resolvedCommunicationAccessRule === "open"
        ? "Public"
        : resolvedCommunicationAccessRule === "party_pass"
          ? "Party Pass"
          : "Premium",
      body: "Chi'lly Chat stays canonical even when default room access is gated",
    },
    {
      label: "Creator Grants",
      value: !creatorPermissions
        ? "Loading"
        : creatorPermissions.canUsePartyPassRooms || creatorPermissions.canUsePremiumRooms
          ? "Enabled"
          : "Open Only",
      body: !creatorPermissions
        ? "checking supported gated room types"
        : creatorPermissions.canUsePartyPassRooms && creatorPermissions.canUsePremiumRooms
          ? "party pass and premium defaults available"
          : creatorPermissions.canUsePartyPassRooms
            ? "party pass available, premium hidden"
            : creatorPermissions.canUsePremiumRooms
              ? "premium available, party pass hidden"
              : "unsupported gates fall back to open",
    },
  ];

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
            This route is Chi&apos;llywood&apos;s current studio-equivalent control center. Keep public identity on `/profile/[userId]`, and shape deeper channel controls here without spawning `/studio*` route truth.
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

            <View style={styles.sectionMapCard}>
              <Text style={styles.sectionMapKicker}>SECTION MAP</Text>
              <Text style={styles.sectionMapTitle}>Current creator control center</Text>
              <Text style={styles.sectionMapBody}>
                `/channel-settings` now owns the structured channel-control map. Current, near-term, and later-phase sections stay visible here so the doctrine expands without silent route proliferation.
              </Text>
              <View style={styles.sectionMapGrid}>
                {sectionMap.map((section) => (
                  <View key={section.title} style={styles.sectionMapItem}>
                    <View style={styles.sectionMapHeader}>
                      <Text style={styles.sectionMapItemTitle}>{section.title}</Text>
                      <View
                        style={[
                          styles.sectionStatusChip,
                          section.status === "current" && styles.sectionStatusChipCurrent,
                          section.status === "near_term" && styles.sectionStatusChipNearTerm,
                          section.status === "later_phase" && styles.sectionStatusChipLaterPhase,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sectionStatusChipText,
                            section.status === "current" && styles.sectionStatusChipTextCurrent,
                            section.status === "near_term" && styles.sectionStatusChipTextNearTerm,
                            section.status === "later_phase" && styles.sectionStatusChipTextLaterPhase,
                          ]}
                        >
                          {section.status === "current"
                            ? "CURRENT"
                            : section.status === "near_term"
                              ? "NEAR TERM"
                              : "LATER"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.sectionMapItemBody}>{section.body}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Identity</Text>
                <Text style={styles.panelStatus}>CURRENT SECTION</Text>
              </View>
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
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Design</Text>
                <Text style={styles.panelStatusMuted}>NEAR-TERM SECTION</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Design stays on this existing route. Hero direction, avatar framing, accent tone, and visible branding treatment should deepen here instead of drifting into separate studio routes.
              </Text>
              <View style={styles.previewChipRow}>
                {designSectionHighlights.map((item) => (
                  <View key={item} style={styles.previewChip}>
                    <Text style={styles.previewChipText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Layout</Text>
                <Text style={styles.panelStatusMuted}>NEAR-TERM SECTION</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Layout is where channel-home ordering should grow next: featured spotlight priority, default tab emphasis, live module placement, and shelf hierarchy all belong here under the current route.
              </Text>
              <View style={styles.previewChipRow}>
                {layoutSectionHighlights.map((item) => (
                  <View key={item} style={styles.previewChip}>
                    <Text style={styles.previewChipText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Content</Text>
                <Text style={styles.panelStatusMuted}>NEAR-TERM SECTION</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Content remains truthful here: use this route for spotlight choices, featured rows, and public content curation before inventing bigger creator tooling.
              </Text>
              <View style={styles.previewChipRow}>
                {contentSectionHighlights.map((item) => (
                  <View key={item} style={styles.previewChip}>
                    <Text style={styles.previewChipText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Access &amp; Monetization</Text>
                <Text style={styles.panelStatusMuted}>CURRENT + NEAR TERM</Text>
              </View>
              <Text style={styles.permissionCopy}>
                This section translates the existing room defaults and creator grants into one honest channel-access posture. It stays on `/channel-settings` and does not create new studio routes.
              </Text>
              <View style={styles.accessSummaryCard}>
                <Text style={styles.accessSummaryKicker}>CHANNEL ACCESS</Text>
                <Text style={styles.accessSummaryTitle}>{accessSummary.title}</Text>
                <Text style={styles.accessSummaryBody}>{accessSummary.body}</Text>
                <View style={styles.accessSummaryRow}>
                  {accessSummaryDetails.map((detail) => (
                    <View key={detail.label} style={styles.accessSummaryDetailCard}>
                      <Text style={styles.accessSummaryDetailLabel}>{detail.label}</Text>
                      <Text style={styles.accessSummaryDetailValue}>{detail.value}</Text>
                      <Text style={styles.accessSummaryDetailBody}>{detail.body}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Watch Party Defaults</Text>
                <Text style={styles.panelStatusMuted}>ACCESS PREVIEW</Text>
              </View>
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
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Communication Defaults</Text>
                <Text style={styles.panelStatusMuted}>ACCESS PREVIEW</Text>
              </View>
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
  sectionMapCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.16)",
    backgroundColor: "rgba(10,14,24,0.9)",
    padding: 16,
    gap: 10,
  },
  sectionMapKicker: {
    color: "#8D98B1",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  sectionMapTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
  sectionMapBody: {
    color: "#BBC4D8",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  sectionMapGrid: {
    gap: 10,
  },
  sectionMapItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 6,
  },
  sectionMapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionMapItemTitle: {
    color: "#F3F6FF",
    fontSize: 14,
    fontWeight: "900",
    flexShrink: 1,
  },
  sectionMapItemBody: {
    color: "#AFB8CD",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  sectionStatusChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sectionStatusChipCurrent: {
    borderColor: "rgba(45,153,92,0.4)",
    backgroundColor: "rgba(45,153,92,0.16)",
  },
  sectionStatusChipNearTerm: {
    borderColor: "rgba(115,134,255,0.28)",
    backgroundColor: "rgba(115,134,255,0.14)",
  },
  sectionStatusChipLaterPhase: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  sectionStatusChipText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionStatusChipTextCurrent: {
    color: "#D9FFE6",
  },
  sectionStatusChipTextNearTerm: {
    color: "#E1E7FF",
  },
  sectionStatusChipTextLaterPhase: {
    color: "#B0BACD",
  },
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,16,24,0.9)",
    padding: 16,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  panelTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
  },
  panelStatus: {
    color: "#D6FFE4",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  panelStatusMuted: {
    color: "#97A4BE",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.9,
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
  previewChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  previewChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.2)",
    backgroundColor: "rgba(115,134,255,0.1)",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  previewChipText: {
    color: "#E1E7FF",
    fontSize: 11,
    fontWeight: "700",
  },
  accessSummaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.18)",
    backgroundColor: "rgba(17,24,40,0.82)",
    padding: 14,
    gap: 8,
  },
  accessSummaryKicker: {
    color: "#8D97AD",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  accessSummaryTitle: {
    color: "#F4F7FF",
    fontSize: 18,
    fontWeight: "900",
  },
  accessSummaryBody: {
    color: "#B8C0D4",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  accessSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  accessSummaryDetailCard: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 96,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  accessSummaryDetailLabel: {
    color: "#8590A6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  accessSummaryDetailValue: {
    color: "#F3F6FF",
    fontSize: 15,
    fontWeight: "900",
  },
  accessSummaryDetailBody: {
    color: "#ACB5C9",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
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
