import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, Image, ImageBackground, Linking, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../_lib/analytics";
import {
  getCachedMonetizationSnapshot,
  isPremiumPurchaseShellAvailable,
  readMonetizationSnapshot,
  subscribeToMonetizationSnapshot,
} from "../_lib/monetization";
import {
  readNotificationPreferences,
  readPushPermissionState,
  requestAndroidPushPermissionAndRegister,
  revokeCurrentPushInstall,
  updateNotificationPreferences,
  type NotificationPreferencePatch,
  type NotificationPreferenceSettings,
  type PushRegistrationState,
} from "../_lib/notifications";
import {
  canAccessAdminConsole,
  getModerationAccess,
  readMyPlatformRoleMemberships,
} from "../_lib/moderation";
import {
  LEGAL_POLICY_ROUTES,
  LEGAL_SUPPORT_EMAIL,
  type LegalPolicy,
} from "../_lib/legalPolicies";
import {
  getProfileVisibilityLabel,
  PROFILE_VISIBILITY_OPTIONS,
  type ProfileVisibility,
} from "../_lib/profileVisibility";
import { getRuntimeLegalConfig } from "../_lib/runtimeConfig";
import { supabase } from "../_lib/supabase";
import { useSession } from "../_lib/session";
import {
  isProfileMediaActive,
  readMyProfileVisibility,
  readUserProfile,
  updateMyProfileVisibility,
  type ProfileAppearanceFitMode,
  type UserProfile,
} from "../_lib/userData";
import {
  pickProfileMediaImage,
  removeProfileMedia,
  updateProfileMediaFitMode,
  uploadProfileMedia,
  type ProfileMediaKind,
} from "../_lib/profileMedia";
import {
  ProfileAppearanceSheet,
  ProfileImagePreviewSheet,
} from "../components/profile/profile-media-sheets";

const CHILLYWOOD_BACKGROUND_SOURCE = require("../assets/images/chillywood-branded-background.png");

const resolveProfileImageResizeMode = (fitMode?: ProfileAppearanceFitMode) => {
  if (fitMode === "fit") return "contain" as const;
  if (fitMode === "center") return "center" as const;
  return "cover" as const;
};

type NotificationPreferenceKey = keyof Omit<NotificationPreferenceSettings, "updatedAt">;

type NotificationPreferenceItem = {
  key: NotificationPreferenceKey;
  label: string;
  description: string;
};

type SettingsAccordionProps = {
  id: string;
  kicker?: string;
  title: string;
  summary: string;
  value?: string;
  expandedSections: Record<string, boolean>;
  onToggle: (id: string) => void;
  children: React.ReactNode;
};

type SettingsRowProps = {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  tone?: "default" | "muted" | "danger";
  children?: React.ReactNode;
};

const NOTIFICATION_GROUPS: {
  id: string;
  title: string;
  summary: string;
  items: readonly NotificationPreferenceItem[];
}[] = [
  {
    id: "notification-push",
    title: "Push alerts",
    summary: "Device push notifications and registration status",
    items: [
      {
        key: "pushEnabled",
        label: "Push alerts",
        description: "Allow this device to receive Android push notifications.",
      },
    ],
  },
  {
    id: "notification-activity",
    title: "Activity alerts",
    summary: "In-app activity and account updates",
    items: [
      {
        key: "inAppEnabled",
        label: "In-app activity",
        description: "Keep recent activity visible in your Profile Feed.",
      },
    ],
  },
  {
    id: "notification-live",
    title: "Live alerts",
    summary: "Followed creators and Chi'lly Circle live sessions",
    items: [
      {
        key: "followedCreatorLiveEnabled",
        label: "Followed creators live",
        description: "A followed creator starts an eligible public live session.",
      },
      {
        key: "circleFriendLiveEnabled",
        label: "Chi'lly Circle live",
        description: "A mutual Chi'lly Circle connection starts an eligible public live session.",
      },
    ],
  },
  {
    id: "notification-upload-event",
    title: "Upload and event alerts",
    summary: "Saved events, public uploads, and replays",
    items: [
      {
        key: "eventStartsSoonEnabled",
        label: "Events starting soon",
        description: "A saved public event is about 15 minutes away.",
      },
      {
        key: "publicUploadEnabled",
        label: "Public uploads",
        description: "A followed creator publishes a public rights-safe upload.",
      },
      {
        key: "replayLaterEnabled",
        label: "Replay later",
        description: "An eligible saved replay becomes available.",
      },
    ],
  },
];

const LEGAL_POLICY_DESCRIPTIONS: Record<string, string> = {
  "account-deletion": "How to request account and data deletion.",
  "community-guidelines": "Rules for safe participation across Chi'llywood.",
  copyright: "Copyright reports, counter notices, and DMCA process.",
  "creator-monetization": "Creator revenue disclaimers and monetization boundaries.",
  "creator-rules": "Creator publishing and Platform rules.",
  "law-enforcement": "How legal requests are handled.",
  "live-chat-rules": "Rules for live rooms, watch parties, and chat.",
  "moderation-policy": "Moderation, enforcement, and appeal process.",
  "premium-terms": "Subscription terms and Premium billing support.",
  privacy: "How account, app, and provider data is handled.",
  "support-help": "Support contact, account help, and safety routing.",
  terms: "Core service terms for using Chi'llywood.",
};

const LEGAL_POLICY_CATEGORIES = [
  {
    id: "legal-core",
    title: "Core policies",
    summary: "Terms, privacy, and community rules",
    slugs: ["terms", "privacy", "community-guidelines"],
  },
  {
    id: "legal-creator-premium",
    title: "Creator and Premium",
    summary: "Creator terms, subscriptions, and monetization",
    slugs: ["creator-rules", "premium-terms", "creator-monetization"],
  },
  {
    id: "legal-safety",
    title: "Safety and Enforcement",
    summary: "Moderation, live rules, and copyright",
    slugs: ["moderation-policy", "live-chat-rules", "copyright"],
  },
  {
    id: "legal-account",
    title: "Account and Support",
    summary: "Support, account deletion, and legal requests",
    slugs: ["support-help", "account-deletion", "law-enforcement"],
  },
] as const;

function StatusPill({ label, tone = "default" }: { label: string; tone?: "default" | "muted" | "warning" | "danger" }) {
  return (
    <View style={[
      styles.statusPill,
      tone === "warning" && styles.statusPillWarning,
      tone === "danger" && styles.statusPillDanger,
      tone === "muted" && styles.statusPillMuted,
    ]}>
      <Text style={[
        styles.statusPillText,
        tone === "warning" && styles.statusPillTextWarning,
        tone === "danger" && styles.statusPillTextDanger,
        tone === "muted" && styles.statusPillTextMuted,
      ]}>
        {label}
      </Text>
    </View>
  );
}

function SettingsAccordion({
  id,
  kicker,
  title,
  summary,
  value,
  expandedSections,
  onToggle,
  children,
}: SettingsAccordionProps) {
  const isOpen = !!expandedSections[id];

  return (
    <View style={styles.groupCard}>
      <TouchableOpacity
        style={styles.groupHeader}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => onToggle(id)}
      >
        <View style={styles.groupCopy}>
          {kicker ? <Text style={styles.groupKicker}>{kicker}</Text> : null}
          <Text style={styles.groupTitle}>{title}</Text>
          <Text style={styles.groupSummary}>{summary}</Text>
        </View>
        <View style={styles.groupRight}>
          {value ? <StatusPill label={value} tone="muted" /> : null}
          <Text style={styles.chevron}>{isOpen ? "⌄" : "›"}</Text>
        </View>
      </TouchableOpacity>
      {isOpen ? <View style={styles.groupBody}>{children}</View> : null}
    </View>
  );
}

function InlineAccordion({
  id,
  title,
  summary,
  expandedSections,
  onToggle,
  children,
}: Omit<SettingsAccordionProps, "kicker" | "value">) {
  const isOpen = !!expandedSections[id];

  return (
    <View style={styles.inlineAccordion}>
      <TouchableOpacity
        style={styles.inlineAccordionHeader}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => onToggle(id)}
      >
        <View style={styles.inlineAccordionCopy}>
          <Text style={styles.inlineAccordionTitle}>{title}</Text>
          <Text style={styles.inlineAccordionSummary}>{summary}</Text>
        </View>
        <Text style={styles.inlineChevron}>{isOpen ? "⌄" : "›"}</Text>
      </TouchableOpacity>
      {isOpen ? <View style={styles.inlineAccordionBody}>{children}</View> : null}
    </View>
  );
}

function SettingsRow({ title, subtitle, value, onPress, tone = "default", children }: SettingsRowProps) {
  const content = (
    <>
      <View style={styles.settingsRowMain}>
        <View style={styles.settingsRowCopy}>
          <Text style={[
            styles.settingsRowTitle,
            tone === "danger" && styles.settingsRowTitleDanger,
            tone === "muted" && styles.settingsRowTitleMuted,
          ]}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.settingsRowSubtitle}>{subtitle}</Text> : null}
        </View>
        {value ? <Text style={styles.settingsRowValue}>{value}</Text> : null}
        {onPress ? <Text style={styles.rowChevron}>›</Text> : null}
      </View>
      {children ? <View style={styles.settingsRowChildren}>{children}</View> : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={styles.settingsRow}
        activeOpacity={0.86}
        accessibilityRole="button"
        onPress={onPress}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.settingsRow}>{content}</View>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading, isSignedIn, user } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [monetizationSnapshot, setMonetizationSnapshot] = useState(() => getCachedMonetizationSnapshot());
  const [monetizationLoading, setMonetizationLoading] = useState(false);
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>("everyone");
  const [profileVisibilityLoading, setProfileVisibilityLoading] = useState(false);
  const [profileVisibilitySaving, setProfileVisibilitySaving] = useState<ProfileVisibility | null>(null);
  const [profileVisibilityNotice, setProfileVisibilityNotice] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [profileAppearanceSheetKind, setProfileAppearanceSheetKind] = useState<ProfileMediaKind | null>(null);
  const [profileAppearanceBusy, setProfileAppearanceBusy] = useState<ProfileMediaKind | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<{
    title: string;
    imageUrl?: string;
    fitMode?: ProfileAppearanceFitMode;
  } | null>(null);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferenceSettings | null>(null);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationSavingKey, setNotificationSavingKey] = useState<string | null>(null);
  const [pushRegistration, setPushRegistration] = useState<PushRegistrationState | null>(null);
  const [canOpenAdminDashboard, setCanOpenAdminDashboard] = useState(false);
  const [adminAccessLoading, setAdminAccessLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const legalConfig = useMemo(() => getRuntimeLegalConfig(), []);
  const moderationAccess = useMemo(() => getModerationAccess({
    email: user?.email ?? null,
    userId: user?.id ?? null,
  }), [user?.email, user?.id]);
  const activeProfilePhotoUrl = isProfileMediaActive(myProfile?.profileAvatarMediaStatus)
    ? myProfile?.avatarUrl
    : undefined;
  const activeProfileBackgroundUrl = isProfileMediaActive(myProfile?.profileBackgroundMediaStatus)
    ? myProfile?.profileBackgroundUrl
    : undefined;

  useEffect(() => {
    if (isLoading || isSignedIn) return;
    router.replace("/(auth)/login");
  }, [isLoading, isSignedIn, router]);

  useEffect(() => {
    const unsubscribe = subscribeToMonetizationSnapshot(() => {
      setMonetizationSnapshot(getCachedMonetizationSnapshot());
    });
    return unsubscribe;
  }, []);

  const refreshMonetizationStatus = useCallback(async (forceRefresh = true) => {
    setMonetizationLoading(true);
    try {
      const snapshot = await readMonetizationSnapshot({ forceRefresh });
      setMonetizationSnapshot(snapshot);
    } finally {
      setMonetizationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoading || !isSignedIn) return;
    void refreshMonetizationStatus(false);
  }, [isLoading, isSignedIn, refreshMonetizationStatus]);

  useEffect(() => {
    let active = true;

    if (isLoading || !isSignedIn) {
      setCanOpenAdminDashboard(false);
      setAdminAccessLoading(false);
      return () => {
        active = false;
      };
    }

    setAdminAccessLoading(true);
    void readMyPlatformRoleMemberships()
      .then((memberships) => {
        if (!active) return;
        setCanOpenAdminDashboard(canAccessAdminConsole(moderationAccess, memberships));
      })
      .catch(() => {
        if (active) setCanOpenAdminDashboard(false);
      })
      .finally(() => {
        if (active) setAdminAccessLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isLoading, isSignedIn, moderationAccess]);

  useEffect(() => {
    let active = true;

    if (isLoading || !isSignedIn) return () => {
      active = false;
    };

    setProfileVisibilityLoading(true);
    void readMyProfileVisibility()
      .then((visibility) => {
        if (active) setProfileVisibility(visibility);
      })
      .catch(() => {
        if (active) setProfileVisibility("everyone");
      })
      .finally(() => {
        if (active) setProfileVisibilityLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isLoading, isSignedIn]);

  useEffect(() => {
    let active = true;

    if (isLoading || !isSignedIn) {
      setMyProfile(null);
      return () => {
        active = false;
      };
    }

    void readUserProfile()
      .then((profile) => {
        if (active) setMyProfile(profile);
      })
      .catch(() => {
        if (active) setMyProfile(null);
      });

    return () => {
      active = false;
    };
  }, [isLoading, isSignedIn]);

  const refreshNotifications = useCallback(async () => {
    if (!isSignedIn) return;
    setNotificationLoading(true);
    try {
      const [preferences, permissionState] = await Promise.all([
        readNotificationPreferences(),
        readPushPermissionState(),
      ]);
      setNotificationPreferences(preferences);
      setPushRegistration((current) => current ?? {
        message: permissionState === "granted"
          ? "Notifications are allowed on this Android device. Register this device to receive push alerts."
          : permissionState === "denied"
            ? "Notifications are off for this device. You can still use Chi'llywood normally."
            : "Register this Android device when you want live, upload, event, and replay alerts.",
        permissionState,
        provider: "expo",
        status: permissionState === "denied" ? "denied" : "not_registered",
        tokenFingerprint: null,
      });
    } finally {
      setNotificationLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (isLoading || !isSignedIn) return;
    void refreshNotifications();
  }, [isLoading, isSignedIn, refreshNotifications]);

  const onToggleNotificationPreference = useCallback(async (
    key: keyof Omit<NotificationPreferenceSettings, "updatedAt">,
    value: boolean,
  ) => {
    if (!notificationPreferences || notificationSavingKey) return;

    setNotificationSavingKey(key);
    try {
      const updated = await updateNotificationPreferences({ [key]: value } as NotificationPreferencePatch);
      setNotificationPreferences(updated);
      if (key === "pushEnabled" && !value) {
        const revoked = await revokeCurrentPushInstall();
        setPushRegistration(revoked);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update notification preferences.";
      Alert.alert("Notifications", message);
    } finally {
      setNotificationSavingKey(null);
    }
  }, [notificationPreferences, notificationSavingKey]);

  const onPressRegisterPush = useCallback(async () => {
    if (notificationSavingKey) return;

    setNotificationSavingKey("push-register");
    try {
      const result = await requestAndroidPushPermissionAndRegister();
      setPushRegistration(result);
      if (result.status === "registered") {
        const updated = await updateNotificationPreferences({ pushEnabled: true });
        setNotificationPreferences(updated);
      }
    } finally {
      setNotificationSavingKey(null);
    }
  }, [notificationSavingKey]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  const premiumTarget = monetizationSnapshot.targets.premium_subscription;
  const hasPremium = !!premiumTarget?.hasEntitlement;
  const premiumPurchaseAvailable = isPremiumPurchaseShellAvailable()
    && monetizationSnapshot.configuration.shouldConfigure
    && monetizationSnapshot.canMakePayments
    && !!premiumTarget?.offeringAvailable
    && (premiumTarget?.packageCount ?? 0) > 0;
  const premiumStatusLabel = hasPremium ? "Active" : "Not active";
  const premiumPurchaseLabel = premiumPurchaseAvailable ? "Available" : "Temporarily unavailable";
  const premiumSummary = hasPremium
    ? "Premium is active on this account."
    : "Premium-only features stay locked until your account has an active Premium subscription.";
  const premiumAvailabilitySummary = premiumPurchaseAvailable
    ? "A real store subscription is ready for this account."
    : "Premium purchases are temporarily unavailable while setup is being finalized.";

  const pushStatusLabel = useMemo(() => {
    if (pushRegistration?.status === "registered") return "Registered";
    if (pushRegistration?.permissionState === "denied") return "Off";
    return "Not registered";
  }, [pushRegistration?.permissionState, pushRegistration?.status]);

  const profileVisibilityLabel = profileVisibilityLoading ? "Loading" : getProfileVisibilityLabel(profileVisibility);

  const legalPolicyBySlug = useMemo(() => (
    new Map(LEGAL_POLICY_ROUTES.map((policy) => [policy.slug, policy]))
  ), []);

  const onPressSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    trackEvent("auth_sign_out_requested", {
      source: "settings",
    });

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        trackEvent("auth_sign_out_failed", {
          reason: error.message,
          source: "settings",
        });
        Alert.alert("Log Out", error.message);
        return;
      }

      trackEvent("auth_sign_out_success", {
        source: "settings",
      });
      router.replace("/(auth)/login");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to log out right now.";
      trackEvent("auth_sign_out_failed", {
        reason: message,
        source: "settings",
      });
      Alert.alert("Log Out", message);
    } finally {
      setSigningOut(false);
    }
  };

  const onPressOpenProfile = useCallback(() => {
    if (!user?.id) return;
    router.push({ pathname: "/profile/[userId]", params: { userId: user.id, self: "1" } });
  }, [router, user?.id]);

  const onViewProfileImage = useCallback((kind: ProfileMediaKind) => {
    const imageUrl = kind === "avatar" ? activeProfilePhotoUrl : activeProfileBackgroundUrl;
    if (!imageUrl) {
      Alert.alert(
        kind === "avatar" ? "Profile Photo" : "Profile Background",
        kind === "avatar" ? "No Profile photo is available yet." : "No Profile background is available yet.",
      );
      return;
    }

    setProfileImagePreview({
      title: kind === "avatar" ? "Profile Photo" : "Profile Background",
      imageUrl,
      fitMode: kind === "avatar" ? myProfile?.profileAvatarFitMode : myProfile?.profileBackgroundFitMode,
    });
  }, [activeProfileBackgroundUrl, activeProfilePhotoUrl, myProfile]);

  const onChooseProfileMedia = useCallback(async (kind: ProfileMediaKind) => {
    if (profileAppearanceBusy) return;

    setProfileAppearanceBusy(kind);
    try {
      const file = await pickProfileMediaImage(kind);
      if (!file) return;
      const nextProfile = await uploadProfileMedia(kind, file);
      setMyProfile(nextProfile);
      Alert.alert("Profile Appearance", kind === "avatar" ? "Profile photo updated." : "Profile background updated.");
    } catch (error) {
      Alert.alert(
        "Profile Appearance",
        error instanceof Error ? error.message : "Unable to update Profile appearance right now.",
      );
    } finally {
      setProfileAppearanceBusy(null);
    }
  }, [profileAppearanceBusy]);

  const onRemoveProfileMedia = useCallback((kind: ProfileMediaKind) => {
    const imageUrl = kind === "avatar" ? activeProfilePhotoUrl : activeProfileBackgroundUrl;
    if (!imageUrl || profileAppearanceBusy) return;

    Alert.alert(
      kind === "avatar" ? "Remove Profile photo?" : "Remove Profile background?",
      kind === "avatar"
        ? "Your Profile will return to the default avatar."
        : "Your Profile will return to the default background.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: kind === "avatar" ? "Remove Photo" : "Remove Background",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setProfileAppearanceBusy(kind);
              try {
                const nextProfile = await removeProfileMedia(kind);
                setMyProfile(nextProfile);
                Alert.alert("Profile Appearance", kind === "avatar" ? "Profile photo removed." : "Profile background removed.");
              } catch (error) {
                Alert.alert(
                  "Profile Appearance",
                  error instanceof Error ? error.message : "Unable to remove this Profile image right now.",
                );
              } finally {
                setProfileAppearanceBusy(null);
              }
            })();
          },
        },
      ],
    );
  }, [activeProfileBackgroundUrl, activeProfilePhotoUrl, profileAppearanceBusy]);

  const onSelectProfileMediaFitMode = useCallback(async (kind: ProfileMediaKind, fitMode: ProfileAppearanceFitMode) => {
    if (profileAppearanceBusy) return;
    const currentFitMode = kind === "avatar" ? myProfile?.profileAvatarFitMode : myProfile?.profileBackgroundFitMode;
    if (currentFitMode === fitMode) return;

    setProfileAppearanceBusy(kind);
    try {
      const nextProfile = await updateProfileMediaFitMode(kind, fitMode);
      setMyProfile(nextProfile);
    } catch (error) {
      Alert.alert(
        "Profile Appearance",
        error instanceof Error ? error.message : "Unable to update this image fit right now.",
      );
    } finally {
      setProfileAppearanceBusy(null);
    }
  }, [myProfile?.profileAvatarFitMode, myProfile?.profileBackgroundFitMode, profileAppearanceBusy]);

  const onPressAdminDashboard = useCallback(() => {
    router.push("/admin" as Parameters<typeof router.push>[0]);
  }, [router]);

  const onPressManageChannel = useCallback(() => {
    router.push("/channel-studio");
  }, [router]);

  const onPressChillyCircle = useCallback(() => {
    router.push("/chilly-circle" as Parameters<typeof router.push>[0]);
  }, [router]);

  const onPressProfileVisibility = useCallback(async (visibility: ProfileVisibility) => {
    if (profileVisibilitySaving || visibility === profileVisibility) return;

    setProfileVisibilitySaving(visibility);
    setProfileVisibilityNotice(null);
    try {
      const savedVisibility = await updateMyProfileVisibility(visibility);
      setProfileVisibility(savedVisibility);
      setProfileVisibilityNotice(`Profile privacy set to ${getProfileVisibilityLabel(savedVisibility)}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update profile privacy right now.";
      setProfileVisibilityNotice(message);
      Alert.alert("Profile Privacy", message);
    } finally {
      setProfileVisibilitySaving(null);
    }
  }, [profileVisibility, profileVisibilitySaving]);

  const onPressChangePassword = useCallback(async () => {
    if (passwordSaving) return;

    setPasswordNotice(null);
    if (!newPassword || !confirmPassword) {
      Alert.alert("Change Password", "Enter and confirm your new password.");
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert("Change Password", "Use at least 8 characters for your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Change Password", "The new passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordNotice(error.message);
        Alert.alert("Change Password", error.message);
        return;
      }

      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice("Password updated.");
      Alert.alert("Change Password", "Your password has been updated.");
    } catch {
      const message = "Unable to update your password right now.";
      setPasswordNotice(message);
      Alert.alert("Change Password", message);
    } finally {
      setPasswordSaving(false);
    }
  }, [confirmPassword, newPassword, passwordSaving]);

  const openExternalDestination = useCallback(async (url: string, label: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(label, `Unable to open ${label.toLowerCase()} right now.`);
        return;
      }

      await Linking.openURL(url);
    } catch {
      Alert.alert(label, `Unable to open ${label.toLowerCase()} right now.`);
    }
  }, []);

  const openLocalLegalRoute = useCallback((path: LegalPolicy["path"]) => {
    router.push(path as Parameters<typeof router.push>[0]);
  }, [router]);

  const onPressLegalPolicy = useCallback((policy: (typeof LEGAL_POLICY_ROUTES)[number]) => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: policy.slug,
      destination: "bundled_policy_viewer",
    });

    openLocalLegalRoute(policy.path);
  }, [openLocalLegalRoute]);

  const onPressPrivacyPolicy = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "privacy_policy",
      destination: legalConfig.privacyPolicyUrl ? "external" : "local",
    });

    openLocalLegalRoute("/privacy");
  }, [legalConfig.privacyPolicyUrl, openLocalLegalRoute]);

  const onPressTerms = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "terms_of_use",
      destination: legalConfig.termsOfServiceUrl ? "external" : "local",
    });

    openLocalLegalRoute("/terms");
  }, [legalConfig.termsOfServiceUrl, openLocalLegalRoute]);

  const onPressAccountDeletion = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "account_deletion",
      destination: legalConfig.accountDeletionUrl ? "external" : "local",
    });

    openLocalLegalRoute("/account-deletion");
  }, [legalConfig.accountDeletionUrl, openLocalLegalRoute]);

  const onPressCommunityGuidelines = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "community_guidelines",
      destination: "local",
    });

    openLocalLegalRoute("/community-guidelines");
  }, [openLocalLegalRoute]);

  const onPressCreatorRules = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "creator_rules",
      destination: "local",
    });

    openLocalLegalRoute("/creator-rules");
  }, [openLocalLegalRoute]);

  const onPressCopyright = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "copyright_dmca",
      destination: "local",
    });

    openLocalLegalRoute("/copyright");
  }, [openLocalLegalRoute]);

  const onPressCopyrightReport = useCallback(() => {
    const hostedUrl = legalConfig.copyrightReportUrl;
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "copyright_report",
      destination: hostedUrl ? "external" : "local",
    });

    if (hostedUrl) {
      void openExternalDestination(hostedUrl, "Copyright Report");
      return;
    }

    router.push("/copyright-report" as Parameters<typeof router.push>[0]);
  }, [legalConfig.copyrightReportUrl, openExternalDestination, router]);

  const onPressCounterNotice = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "counter_notice",
      destination: "local",
    });

    router.push("/counter-notice" as Parameters<typeof router.push>[0]);
  }, [router]);

  const onPressSupport = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "support",
      destination: "local",
    });

    openLocalLegalRoute("/support-policy");
  }, [openLocalLegalRoute]);

  const onPressSupportContact = useCallback(() => {
    trackEvent("settings_support_contact_opened", {
      source: "settings",
    });

    router.push("/support" as Parameters<typeof router.push>[0]);
  }, [router]);

  const onPressSupportEmail = useCallback(() => {
    const supportEmail = legalConfig.supportEmail || LEGAL_SUPPORT_EMAIL;
    void openExternalDestination(`mailto:${supportEmail}`, "Support Email");
  }, [legalConfig.supportEmail, openExternalDestination]);

  const onPressManagePremium = useCallback(() => {
    trackEvent("settings_premium_manage_opened", {
      source: "settings",
      snapshotStatus: monetizationSnapshot.status,
      hasPremium: !!monetizationSnapshot.targets.premium_subscription?.hasEntitlement,
    });
    router.push("/subscribe" as Parameters<typeof router.push>[0]);
  }, [monetizationSnapshot.status, monetizationSnapshot.targets.premium_subscription?.hasEntitlement, router]);

  const renderNotificationToggle = useCallback((item: NotificationPreferenceItem) => {
    if (!notificationPreferences) {
      return (
        <SettingsRow
          key={item.key}
          title={item.label}
          subtitle="Refresh notification settings to edit this alert."
          value="Loading"
        />
      );
    }

    const value = !!notificationPreferences[item.key];
    return (
      <View key={item.key} style={styles.preferenceRow}>
        <View style={styles.preferenceTextWrap}>
          <Text style={styles.preferenceLabel}>{item.label}</Text>
          <Text style={styles.preferenceDescription}>{item.description}</Text>
        </View>
        <Switch
          value={value}
          disabled={!!notificationSavingKey}
          onValueChange={(nextValue) => {
            void onToggleNotificationPreference(item.key, nextValue);
          }}
          thumbColor={value ? "#FFE4EA" : "#A5AEC0"}
          trackColor={{ false: "rgba(255,255,255,0.16)", true: "rgba(220,20,60,0.52)" }}
        />
      </View>
    );
  }, [notificationPreferences, notificationSavingKey, onToggleNotificationPreference]);

  const renderLegalPolicyRow = useCallback((slug: string) => {
    const policy = legalPolicyBySlug.get(slug);
    if (!policy) return null;

    return (
      <SettingsRow
        key={policy.slug}
        title={policy.title}
        subtitle={LEGAL_POLICY_DESCRIPTIONS[policy.slug] ?? policy.summary}
        value="View policy"
        onPress={() => onPressLegalPolicy(policy)}
      />
    );
  }, [legalPolicyBySlug, onPressLegalPolicy]);

  const appearanceInitial = String(
    myProfile?.displayName
    ?? myProfile?.username
    ?? user?.email
    ?? "P",
  ).slice(0, 1).toUpperCase();

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#DC143C" />
        <Text style={styles.loadingText}>Loading settings…</Text>
      </View>
    );
  }

  return (
    <ImageBackground source={CHILLYWOOD_BACKGROUND_SOURCE} style={styles.background} resizeMode="cover">
      <View style={styles.backgroundOverlay} />
      <ScrollView
        style={[styles.screen, { marginTop: insets.top }]}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom + 28, 28),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.82}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>SETTINGS</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryCopy}>
            <Text style={styles.cardKicker}>CONTROL CENTER</Text>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.body}>Signed in as {String(user?.email ?? "Unknown account")}.</Text>
          </View>
          {monetizationLoading || notificationLoading ? <ActivityIndicator color="#DC143C" size="small" /> : null}
        </View>
        <View style={styles.statusRow}>
          <StatusPill label={`Premium ${premiumStatusLabel}`} tone={hasPremium ? "default" : "muted"} />
          <StatusPill label={`Push ${pushStatusLabel}`} tone={pushStatusLabel === "Registered" ? "default" : "muted"} />
          <StatusPill label={profileVisibilityLabel} tone="muted" />
        </View>
        <View style={styles.utilityRow}>
          <TouchableOpacity
            style={[styles.utilityButton, !user?.id && styles.utilityButtonDisabled]}
            activeOpacity={0.86}
            onPress={onPressOpenProfile}
            disabled={!user?.id}
          >
            <Text style={styles.utilityButtonText}>Open Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressManageChannel}>
            <Text style={styles.utilityButtonText}>Platform Studio</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressManagePremium}>
            <Text style={styles.utilityButtonText}>Manage Premium</Text>
          </TouchableOpacity>
        </View>
      </View>

      <SettingsAccordion
        id="profile-appearance"
        kicker="PROFILE"
        title="Profile Appearance"
        summary="Personal Profile photo and background"
        value={myProfile ? "Ready" : "Loading"}
        expandedSections={expandedSections}
        onToggle={toggleSection}
      >
        <SettingsRow
          title="Profile Photo"
          subtitle="Change the photo shown on your Profile, posts, and comments."
          value={activeProfilePhotoUrl ? "Change" : "Add"}
          onPress={() => setProfileAppearanceSheetKind("avatar")}
        >
          <View style={styles.appearancePreviewRow}>
            <View style={styles.appearanceAvatarPreview}>
              {activeProfilePhotoUrl ? (
                <Image
                  source={{ uri: activeProfilePhotoUrl }}
                  style={styles.appearancePreviewImage}
                  resizeMode={resolveProfileImageResizeMode(myProfile?.profileAvatarFitMode)}
                />
              ) : (
                <Text style={styles.appearanceAvatarInitial}>{appearanceInitial}</Text>
              )}
            </View>
            <Text style={styles.appearancePreviewMeta}>
              {activeProfilePhotoUrl ? "Photo is active." : "Default avatar is active."}
            </Text>
          </View>
        </SettingsRow>
        <SettingsRow
          title="Profile Background"
          subtitle="Change the personal Profile header background."
          value={activeProfileBackgroundUrl ? "Change" : "Add"}
          onPress={() => setProfileAppearanceSheetKind("background")}
        >
          <View style={styles.appearancePreviewRow}>
            <View style={styles.appearanceBackgroundPreview}>
              {activeProfileBackgroundUrl ? (
                <Image
                  source={{ uri: activeProfileBackgroundUrl }}
                  style={styles.appearancePreviewImage}
                  resizeMode={resolveProfileImageResizeMode(myProfile?.profileBackgroundFitMode)}
                />
              ) : (
                <Text style={styles.appearanceBackgroundFallback}>Profile</Text>
              )}
            </View>
            <Text style={styles.appearancePreviewMeta}>
              This background appears only on your Profile. Platform branding stays in Brand Studio.
            </Text>
          </View>
        </SettingsRow>
        <SettingsRow title="Preview Profile" subtitle="Review your personal Profile after changes." value="Open" onPress={onPressOpenProfile} />
      </SettingsAccordion>

      <SettingsAccordion
        id="account"
        kicker="ACCOUNT"
        title="Account"
        summary="Password, visibility, activity presentation, and logout"
        value="Signed in"
        expandedSections={expandedSections}
        onToggle={toggleSection}
      >
        <InlineAccordion
          id="account-privacy"
          title="Profile visibility"
          summary={`Current visibility: ${profileVisibilityLabel}`}
          expandedSections={expandedSections}
          onToggle={toggleSection}
        >
          <Text style={styles.statusNote}>
            Choose who can see your full Profile posts, comments, attachments, and activity. Follow remains separate.
          </Text>
          <View style={styles.privacyOptionRow}>
            {PROFILE_VISIBILITY_OPTIONS.map((option) => {
              const active = profileVisibility === option.value;
              const saving = profileVisibilitySaving === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.privacyOptionButton,
                    active && styles.privacyOptionButtonActive,
                    (profileVisibilityLoading || !!profileVisibilitySaving) && styles.utilityButtonDisabled,
                  ]}
                  activeOpacity={0.86}
                  disabled={profileVisibilityLoading || !!profileVisibilitySaving}
                  onPress={() => {
                    void onPressProfileVisibility(option.value);
                  }}
                >
                  {saving ? <ActivityIndicator color="#FFE4EA" size="small" /> : null}
                  <Text style={[
                    styles.privacyOptionButtonText,
                    active && styles.privacyOptionButtonTextActive,
                  ]}>
                    {saving ? "Saving" : option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {profileVisibilityNotice ? <Text style={styles.metaText}>{profileVisibilityNotice}</Text> : null}
        </InlineAccordion>

        <InlineAccordion
          id="account-password"
          title="Password and security"
          summary="Change the password for this signed-in account"
          expandedSections={expandedSections}
          onToggle={toggleSection}
        >
          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor="#7A859A"
            secureTextEntry
            value={newPassword}
            onChangeText={(value) => {
              setNewPassword(value);
              setPasswordNotice(null);
            }}
            editable={!passwordSaving}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor="#7A859A"
            secureTextEntry
            value={confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              setPasswordNotice(null);
            }}
            editable={!passwordSaving}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
          />
          <TouchableOpacity
            style={[styles.utilityButton, styles.fullWidthButton, passwordSaving && styles.utilityButtonDisabled]}
            activeOpacity={0.86}
            onPress={() => {
              void onPressChangePassword();
            }}
            disabled={passwordSaving}
          >
            {passwordSaving
              ? <ActivityIndicator color="#E5ECF8" size="small" />
              : <Text style={styles.utilityButtonText}>Change Password</Text>}
          </TouchableOpacity>
          {passwordNotice ? <Text style={styles.metaText}>{passwordNotice}</Text> : null}
        </InlineAccordion>

        <SettingsRow
          title="Chi'lly Circle and activity visibility"
          subtitle="Review your private circle and social activity surface."
          value="Open"
          onPress={onPressChillyCircle}
        />
        <SettingsRow
          title="Public presentation"
          subtitle="Profile and Platform Studio control how your public presence appears."
        >
          <View style={styles.utilityRow}>
            <TouchableOpacity
              style={[styles.utilityButton, !user?.id && styles.utilityButtonDisabled]}
              activeOpacity={0.86}
              onPress={onPressOpenProfile}
              disabled={!user?.id}
            >
              <Text style={styles.utilityButtonText}>Open Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressManageChannel}>
              <Text style={styles.utilityButtonText}>Platform Studio</Text>
            </TouchableOpacity>
          </View>
        </SettingsRow>
        <SettingsRow title="Account actions" subtitle="Log out of this device when you are finished." tone="danger">
          <TouchableOpacity
            style={[styles.signOutButton, signingOut && styles.signOutButtonDisabled]}
            activeOpacity={0.86}
            onPress={onPressSignOut}
            disabled={signingOut}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            testID="settings-logout-button"
          >
            <Text style={styles.signOutButtonText}>{signingOut ? "Logging out..." : "Log Out"}</Text>
          </TouchableOpacity>
        </SettingsRow>
      </SettingsAccordion>

      <SettingsAccordion
        id="profile-channel"
        kicker="PROFILE"
        title="Profile and Platform"
        summary="Quick links for your public profile, creator tools, and circle"
        expandedSections={expandedSections}
        onToggle={toggleSection}
      >
        <SettingsRow title="Open Profile" subtitle="Review your public profile and profile feed." value="Open" onPress={onPressOpenProfile} />
        <SettingsRow title="Platform Studio" subtitle="Manage Platform presentation and creator tools." value="Open" onPress={onPressManageChannel} />
        <SettingsRow title="Chi'lly Circle" subtitle="Open your private circle and activity surface." value="Open" onPress={onPressChillyCircle} />
        {canOpenAdminDashboard ? (
          <SettingsRow title="Admin Dashboard" subtitle="Available only for authorized staff accounts." value="Open" onPress={onPressAdminDashboard} />
        ) : adminAccessLoading ? (
          <SettingsRow title="Admin Dashboard" subtitle="Checking access for this account." value="Checking" />
        ) : null}
      </SettingsAccordion>

      <SettingsAccordion
        id="notifications"
        kicker="ALERTS"
        title="Notifications"
        summary="Device push, activity, live, upload, and event alerts"
        value={pushStatusLabel}
        expandedSections={expandedSections}
        onToggle={toggleSection}
      >
        <SettingsRow
          title="Device push status"
          subtitle={pushRegistration?.message ?? "Register this Android device for production push alerts."}
          value={pushStatusLabel}
        >
          {pushRegistration?.tokenFingerprint ? (
            <Text style={styles.metaText}>Device fingerprint {pushRegistration.tokenFingerprint}</Text>
          ) : null}
          <View style={styles.utilityRow}>
            <TouchableOpacity
              style={[styles.utilityButton, notificationSavingKey === "push-register" && styles.utilityButtonDisabled]}
              activeOpacity={0.86}
              disabled={notificationSavingKey === "push-register"}
              onPress={() => {
                void onPressRegisterPush();
              }}
            >
              {notificationSavingKey === "push-register"
                ? <ActivityIndicator color="#E5ECF8" size="small" />
                : <Text style={styles.utilityButtonText}>Register Device</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.utilityButton}
              activeOpacity={0.86}
              onPress={() => {
                void refreshNotifications();
              }}
            >
              <Text style={styles.utilityButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </SettingsRow>
        {NOTIFICATION_GROUPS.map((group) => (
          <InlineAccordion
            key={group.id}
            id={group.id}
            title={group.title}
            summary={group.summary}
            expandedSections={expandedSections}
            onToggle={toggleSection}
          >
            <View style={styles.preferenceList}>
              {group.items.map(renderNotificationToggle)}
            </View>
          </InlineAccordion>
        ))}
      </SettingsAccordion>

      <SettingsAccordion
        id="privacy-safety"
        kicker="PRIVACY"
        title="Privacy and Safety"
        summary="Visibility, community rules, copyright reports, and account help"
        value={profileVisibilityLabel}
        expandedSections={expandedSections}
        onToggle={toggleSection}
      >
        <SettingsRow title="Profile visibility" subtitle="Change detailed visibility from the Account section." value={profileVisibilityLabel} />
        <SettingsRow title="Community Guidelines" subtitle="Rules for safe participation." value="View policy" onPress={() => openLocalLegalRoute("/community-guidelines")} />
        <SettingsRow title="Report Copyright" subtitle="Open the copyright report flow." value="Open" onPress={onPressCopyrightReport} />
        <SettingsRow title="Account deletion" subtitle="Open account and data deletion policy." value="View policy" onPress={onPressAccountDeletion} />
      </SettingsAccordion>

      <SettingsAccordion
        id="premium"
        kicker="PREMIUM"
        title="Premium"
        summary={premiumSummary}
        value={premiumStatusLabel}
        expandedSections={expandedSections}
        onToggle={toggleSection}
      >
        <SettingsRow title="Premium status" subtitle={premiumSummary} value={premiumStatusLabel} />
        <SettingsRow title="Purchase status" subtitle={premiumAvailabilitySummary} value={premiumPurchaseLabel} />
        <View style={styles.utilityRow}>
          <TouchableOpacity
            style={[styles.utilityButton, monetizationLoading && styles.utilityButtonDisabled]}
            onPress={() => {
              void refreshMonetizationStatus(true);
            }}
            activeOpacity={0.86}
            disabled={monetizationLoading}
          >
            {monetizationLoading
              ? <ActivityIndicator color="#E5ECF8" size="small" />
              : <Text style={styles.utilityButtonText}>Refresh status</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.utilityButton}
            onPress={onPressManagePremium}
            activeOpacity={0.86}
            disabled={monetizationLoading}
          >
            <Text style={styles.utilityButtonText}>Manage Premium</Text>
          </TouchableOpacity>
        </View>
      </SettingsAccordion>

      <SettingsAccordion
        id="legal-support"
        kicker="LEGAL"
        title="Legal and Support"
        summary="Policies, support, copyright requests, and account deletion"
        value="Version 1.0"
        expandedSections={expandedSections}
        onToggle={toggleSection}
      >
        <SettingsRow
          title="Policy bundle"
          subtitle="Version 1.0. Effective May 21, 2026."
          value="In-app"
        />
        {LEGAL_POLICY_CATEGORIES.map((category) => (
          <InlineAccordion
            key={category.id}
            id={category.id}
            title={category.title}
            summary={category.summary}
            expandedSections={expandedSections}
            onToggle={toggleSection}
          >
            {category.slugs.map(renderLegalPolicyRow)}
          </InlineAccordion>
        ))}
        <InlineAccordion
          id="legal-help-requests"
          title="Help and Requests"
          summary="Copyright, counter notice, support, email, and account deletion"
          expandedSections={expandedSections}
          onToggle={toggleSection}
        >
          <View style={styles.utilityRow}>
            <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressCopyrightReport}>
              <Text style={styles.utilityButtonText}>Report Copyright</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressCounterNotice}>
              <Text style={styles.utilityButtonText}>Counter Notice</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressSupportContact}>
              <Text style={styles.utilityButtonText}>Contact Support</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressSupportEmail}>
              <Text style={styles.utilityButtonText}>Email Support</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.secondaryActionButton} activeOpacity={0.86} onPress={onPressAccountDeletion}>
            <Text style={styles.secondaryActionButtonText}>Open Account Deletion Policy</Text>
          </TouchableOpacity>
        </InlineAccordion>
      </SettingsAccordion>

      <SettingsAccordion
        id="app-info"
        kicker="APP"
        title="App Info"
        summary="Launch policy references and support routing"
        expandedSections={expandedSections}
        onToggle={toggleSection}
      >
        <SettingsRow title="Privacy Policy" subtitle="Open the bundled privacy policy." value="View policy" onPress={() => openLocalLegalRoute("/privacy")} />
        <SettingsRow title="Terms of Use" subtitle="Open the bundled service terms." value="View policy" onPress={() => openLocalLegalRoute("/terms")} />
        <SettingsRow title="Support" subtitle={`Contact ${legalConfig.supportEmail || LEGAL_SUPPORT_EMAIL} for help.`} value="Open" onPress={onPressSupportContact} />
      </SettingsAccordion>
      </ScrollView>
      <ProfileAppearanceSheet
        visible={profileAppearanceSheetKind === "avatar"}
        kind="avatar"
        imageUrl={activeProfilePhotoUrl}
        fitMode={myProfile?.profileAvatarFitMode}
        busy={profileAppearanceBusy === "avatar"}
        onView={() => onViewProfileImage("avatar")}
        onChoose={() => {
          void onChooseProfileMedia("avatar");
        }}
        onRemove={() => onRemoveProfileMedia("avatar")}
        onSelectFitMode={(fitMode) => {
          void onSelectProfileMediaFitMode("avatar", fitMode);
        }}
        onClose={() => {
          if (!profileAppearanceBusy) setProfileAppearanceSheetKind(null);
        }}
      />
      <ProfileAppearanceSheet
        visible={profileAppearanceSheetKind === "background"}
        kind="background"
        imageUrl={activeProfileBackgroundUrl}
        fitMode={myProfile?.profileBackgroundFitMode}
        busy={profileAppearanceBusy === "background"}
        onView={() => onViewProfileImage("background")}
        onChoose={() => {
          void onChooseProfileMedia("background");
        }}
        onRemove={() => onRemoveProfileMedia("background")}
        onSelectFitMode={(fitMode) => {
          void onSelectProfileMediaFitMode("background", fitMode);
        }}
        onClose={() => {
          if (!profileAppearanceBusy) setProfileAppearanceSheetKind(null);
        }}
      />
      <ProfileImagePreviewSheet
        visible={!!profileImagePreview}
        title={profileImagePreview?.title ?? "Profile Preview"}
        imageUrl={profileImagePreview?.imageUrl}
        fitMode={profileImagePreview?.fitMode}
        onClose={() => setProfileImagePreview(null)}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: "#06070B",
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,5,10,0.72)",
  },
  screen: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 18,
  },
  content: {
    gap: 14,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06070B",
    gap: 10,
  },
  loadingText: {
    color: "#F4F7FC",
    fontSize: 13,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  backArrow: {
    color: "#aaa",
    fontSize: 20,
    fontWeight: "700",
    paddingRight: 8,
  },
  kicker: {
    color: "#555",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  headerSpacer: {
    width: 18,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 18,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardHeaderText: {
    flex: 1,
    gap: 8,
  },
  cardKicker: {
    color: "#7B7B7B",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
  },
  secondaryTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  body: {
    color: "#B8C1D6",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  identityBlock: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
    gap: 4,
  },
  identityLabel: {
    color: "#7A859A",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  identityValue: {
    color: "#F4F7FC",
    fontSize: 14,
    fontWeight: "700",
  },
  statusNote: {
    color: "#D9E3F9",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  legalStatusCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 14,
    gap: 5,
  },
  legalStatusLabel: {
    color: "#FFB7C6",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  legalStatusValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  legalStatusBody: {
    color: "#B8C1D6",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  legalPolicyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  legalPolicyButton: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 138,
    minHeight: 82,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    justifyContent: "space-between",
    padding: 12,
  },
  legalPolicyButtonTitle: {
    color: "#F4F7FC",
    fontSize: 12.5,
    fontWeight: "900",
    lineHeight: 17,
  },
  legalPolicyButtonMeta: {
    color: "#8D97AE",
    fontSize: 11,
    fontWeight: "800",
  },
  signOutButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#DC143C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  signOutButtonDisabled: {
    opacity: 0.72,
  },
  signOutButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  utilityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  utilityButton: {
    flex: 1,
    minWidth: 132,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  fullWidthButton: {
    flex: 0,
    width: "100%",
  },
  utilityButtonDisabled: {
    opacity: 0.72,
  },
  utilityButtonText: {
    color: "#F4F7FC",
    fontSize: 12.5,
    fontWeight: "800",
  },
  privacyOptionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  privacyOptionButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
  },
  privacyOptionButtonActive: {
    borderColor: "rgba(220,20,60,0.45)",
    backgroundColor: "rgba(220,20,60,0.18)",
  },
  privacyOptionButtonText: {
    color: "#EAF0FF",
    fontSize: 12,
    fontWeight: "900",
  },
  privacyOptionButtonTextActive: {
    color: "#FFE4EA",
  },
  preferenceList: {
    gap: 10,
  },
  preferenceRow: {
    minHeight: 62,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  preferenceTextWrap: {
    flex: 1,
    gap: 3,
  },
  preferenceLabel: {
    color: "#F4F7FC",
    fontSize: 13,
    fontWeight: "900",
  },
  preferenceDescription: {
    color: "#98A4BA",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#F4F7FC",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "700",
  },
  activityRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 10,
    gap: 10,
  },
  activityMain: {
    gap: 4,
  },
  activityTitle: {
    color: "#F4F7FC",
    fontSize: 13,
    fontWeight: "900",
  },
  activityBody: {
    color: "#C4CEE2",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  activityMeta: {
    color: "#7A859A",
    fontSize: 10.5,
    fontWeight: "800",
  },
  activityDismissButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  activityDismissText: {
    color: "#EAF0FF",
    fontSize: 11,
    fontWeight: "900",
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(16,18,25,0.96)",
    padding: 16,
    gap: 12,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryCopy: {
    flex: 1,
    gap: 6,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusPill: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(112,211,166,0.26)",
    backgroundColor: "rgba(112,211,166,0.12)",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillMuted: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  statusPillWarning: {
    borderColor: "rgba(244,181,84,0.32)",
    backgroundColor: "rgba(244,181,84,0.12)",
  },
  statusPillDanger: {
    borderColor: "rgba(220,20,60,0.32)",
    backgroundColor: "rgba(220,20,60,0.13)",
  },
  statusPillText: {
    color: "#CFF7E3",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
  },
  statusPillTextMuted: {
    color: "#C4CEE2",
  },
  statusPillTextWarning: {
    color: "#FFE0A8",
  },
  statusPillTextDanger: {
    color: "#FFD4DD",
  },
  groupCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(15,17,24,0.95)",
    overflow: "hidden",
  },
  groupHeader: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  groupCopy: {
    flex: 1,
    gap: 4,
  },
  groupKicker: {
    color: "#7F8AA0",
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  groupTitle: {
    color: "#F6F8FE",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  groupSummary: {
    color: "#9EA9BC",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "600",
  },
  groupRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
  },
  chevron: {
    color: "#DCE4F2",
    fontSize: 23,
    lineHeight: 24,
    fontWeight: "700",
  },
  groupBody: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  inlineAccordion: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 10,
  },
  inlineAccordionHeader: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  inlineAccordionCopy: {
    flex: 1,
    gap: 3,
  },
  inlineAccordionTitle: {
    color: "#F4F7FC",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
  },
  inlineAccordionSummary: {
    color: "#9EA9BC",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  inlineChevron: {
    color: "#C9D2E5",
    fontSize: 21,
    lineHeight: 22,
    fontWeight: "700",
  },
  inlineAccordionBody: {
    gap: 10,
    paddingBottom: 4,
  },
  settingsRow: {
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
  },
  settingsRowMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  settingsRowCopy: {
    flex: 1,
    gap: 3,
  },
  settingsRowTitle: {
    color: "#F4F7FC",
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "900",
  },
  settingsRowTitleMuted: {
    color: "#C2CBDB",
  },
  settingsRowTitleDanger: {
    color: "#FFD4DD",
  },
  settingsRowSubtitle: {
    color: "#9AA6BA",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  settingsRowValue: {
    color: "#DDE6F8",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    textAlign: "right",
    flexShrink: 1,
  },
  rowChevron: {
    color: "#D5DDEC",
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "700",
  },
  settingsRowChildren: {
    gap: 10,
  },
  appearancePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  appearanceAvatarPreview: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  appearanceBackgroundPreview: {
    width: 92,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(20,25,36,0.96)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  appearancePreviewImage: {
    width: "100%",
    height: "100%",
  },
  appearanceAvatarInitial: {
    color: "#F4F7FC",
    fontSize: 18,
    fontWeight: "900",
  },
  appearanceBackgroundFallback: {
    color: "#AAB5C8",
    fontSize: 11,
    fontWeight: "900",
  },
  appearancePreviewMeta: {
    flex: 1,
    color: "#9AA6BA",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  secondaryActionButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.34)",
    backgroundColor: "rgba(220,20,60,0.14)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryActionButtonText: {
    color: "#FFE4EA",
    fontSize: 13,
    fontWeight: "900",
  },
  metaText: {
    color: "#8D97AE",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
});
