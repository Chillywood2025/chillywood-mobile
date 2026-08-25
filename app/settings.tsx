import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ActivityIndicator, ImageBackground, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, Vibration, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../_lib/analytics";
import {
  readMyAccountDeletionStatus,
  restoreScheduledAccountDeletion,
  scheduleAccountDeletion,
  getAccountDeletionRequestErrorMessage,
  type AccountDeletionRequestResult,
} from "../_lib/accountDeletionRequests";
import { getUserFacingErrorMessage } from "../_lib/userFacingErrors";
import {
  getCachedMonetizationSnapshot,
  isPremiumPurchaseShellAvailable,
  readMonetizationSnapshot,
  subscribeToMonetizationSnapshot,
} from "../_lib/monetization";
import {
  readNotificationPreferences,
  readCurrentPushRegistration,
  readNativeCallAlertStatus,
  requestPushPermissionAndRegister,
  openNativeCallAlertSettings,
  revokeCurrentPushInstall,
  updateNotificationPreferences,
  type NativeCallAlertStatus,
  type NotificationPreferencePatch,
  type NotificationPreferenceSettings,
  type PushRegistrationState,
} from "../_lib/notifications";
import { CHILLY_CHAT_RINGTONE_OPTIONS, type ChillyChatRingtoneKey } from "../_lib/chillyChatCalls";
import {
  playChillyChatCallSound,
  stopChillyChatCallSound,
  type ChillyChatPlayingSound,
} from "../_lib/chillyChatCallSoundAssets";
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
  ACCESS_VISIBILITY_OPTIONS,
  getAccessVisibilityLabel,
  type AccessVisibility,
} from "../_lib/accessVisibility";
import { getRuntimeLegalConfig } from "../_lib/runtimeConfig";
import { revokeIosVoipRegistration } from "../_lib/iosNativeCalls";
import {
  formatReleaseDiagnosticsSummary,
  readReleaseDiagnostics,
  sanitizeReleaseDiagnosticsForDisplay,
  type ReleaseDiagnosticsDisplay,
} from "../_lib/releaseDiagnostics";
import { supabase } from "../_lib/supabase";
import { maskEmailAddress } from "../_lib/displayText";
import {
  checkUsernameAvailability,
  formatUsernameHandle,
  getUsernameErrorMessage,
  normalizeUsernameHandle,
  updateMyUsername,
  validateUsernameHandle,
  type UsernameAvailability,
} from "../_lib/usernameHandles";
import { useSession } from "../_lib/session";
import {
  isProfileMediaActive,
  readMyProfileAccessVisibility,
  readUserProfile,
  saveUserProfile,
  updateMyDisplayName,
  updateMyProfileAccessVisibility,
  type ProfileAppearanceFitMode,
  type UserProfile,
} from "../_lib/userData";
import {
  pickProfileMediaImage,
  removeProfileMedia,
  updateProfileMediaFitMode,
  uploadProfileMedia,
  type ProfileMediaImageFile,
  type ProfileMediaKind,
} from "../_lib/profileMedia";
import {
  ProfileAppearanceSheet,
  ProfileImagePreviewSheet,
  ProfileMediaReviewSheet,
} from "../components/profile/profile-media-sheets";
import { AppBackButton } from "../components/navigation/app-back-button";
import { ProfileMediaImage as Image } from "../components/ui/ProfileMediaImage";

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
  kind?: "default" | "chilly-chat-ring";
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

const toSettingsTestId = (prefix: string, value: string) => {
  const slug = value
    .toLowerCase()
    .replace(/chi'?lly/g, "chilly")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}-${slug || "item"}`;
};

const formatSettingsAccountIdentity = ({
  displayName,
  username,
  email,
}: {
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
}) => {
  const resolvedDisplayName = String(displayName ?? "").trim();
  if (resolvedDisplayName) return resolvedDisplayName;

  const resolvedHandle = formatUsernameHandle(username);
  if (resolvedHandle) return resolvedHandle;

  return maskEmailAddress(email) || "Signed in";
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
        description: "Allow this device to receive push notifications.",
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
        description: "Show account activity in the bell tray while you are in the app.",
      },
      {
        key: "creatorMoneyPurchasesEnabled",
        label: "Creator purchase receipts",
        description: "Show buyer-side receipts for creator videos, Seat Passes, subscriptions, VIP, events, and tips.",
      },
      {
        key: "creatorMoneySalesEnabled",
        label: "Creator sale alerts",
        description: "Show creator-side sale and support alerts that route to Money Center transactions.",
      },
    ],
  },
  {
    id: "notification-chat-calls",
    title: "Chi'lly Chat calls",
    summary: "Incoming call alerts, vibration, and in-app ring behavior",
    items: [
      {
        key: "chillyChatCallsEnabled",
        label: "Call alerts",
        description: "Allow Chi'lly Chat incoming call sheets and call notifications for this account.",
      },
      {
        key: "chillyChatCallVibrateEnabled",
        label: "Vibrate on calls",
        description: "Use a soft vibration pattern while in-app call alerts are ringing.",
      },
      {
        key: "chillyChatCallSoundKey",
        kind: "chilly-chat-ring",
        label: "Ring on calls",
        description: "Play the selected Chi'lly Chat ringtone while in-app call alerts are ringing.",
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

const CHILLY_CHAT_SOUND_PLAYBACK_ERROR = Platform.OS === "android"
  ? "Sound could not play. Check media volume, notification volume, or Android sound settings."
  : "Sound could not play. Check media volume, notification volume, or iOS sound settings.";

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

function ReleaseDiagnosticItem({
  label,
  testID,
  value,
}: {
  label: string;
  testID?: string;
  value: boolean | string | null;
}) {
  const displayValue = value === null ? "null" : String(value);

  return (
    <View style={styles.releaseDiagnosticItem}>
      <Text style={styles.releaseDiagnosticLabel}>{label}</Text>
      <Text selectable style={styles.releaseDiagnosticValue} testID={testID}>{displayValue}</Text>
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
        accessibilityLabel={`${isOpen ? "Collapse" : "Expand"} ${title}`}
        accessibilityState={{ expanded: isOpen }}
        onPress={() => onToggle(id)}
        testID={`settings-section-${id}`}
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
        accessibilityLabel={`${isOpen ? "Collapse" : "Expand"} ${title}`}
        accessibilityState={{ expanded: isOpen }}
        onPress={() => onToggle(id)}
        testID={`settings-inline-section-${id}`}
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
        accessibilityLabel={title}
        onPress={onPress}
        testID={toSettingsTestId("settings-row", title)}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.settingsRow}>{content}</View>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const onSettingsBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/profile");
  }, [router]);
  const params = useLocalSearchParams<{ section?: string }>();
  const insets = useSafeAreaInsets();
  const { isLoading, isSignedIn, user } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [deletionRequestSaving, setDeletionRequestSaving] = useState(false);
  const [deletionRequestNotice, setDeletionRequestNotice] = useState<string | null>(null);
  const [accountDeletionStatus, setAccountDeletionStatus] = useState<AccountDeletionRequestResult | null>(null);
  const [accountDeletionStatusLoading, setAccountDeletionStatusLoading] = useState(false);
  const [monetizationSnapshot, setMonetizationSnapshot] = useState(() => getCachedMonetizationSnapshot());
  const [monetizationLoading, setMonetizationLoading] = useState(false);
  const [profileVisibility, setProfileVisibility] = useState<AccessVisibility>("public");
  const [profileVisibilityLoading, setProfileVisibilityLoading] = useState(false);
  const [profileVisibilitySaving, setProfileVisibilitySaving] = useState<AccessVisibility | null>(null);
  const [profileVisibilityNotice, setProfileVisibilityNotice] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [profileAppearanceSheetKind, setProfileAppearanceSheetKind] = useState<ProfileMediaKind | null>(null);
  const [profileAppearanceBusy, setProfileAppearanceBusy] = useState<ProfileMediaKind | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<{
    title: string;
    imageUrl?: string;
    fitMode?: ProfileAppearanceFitMode;
  } | null>(null);
  const [profileMediaReview, setProfileMediaReview] = useState<{
    kind: ProfileMediaKind;
    file: ProfileMediaImageFile;
    fitMode: ProfileAppearanceFitMode;
  } | null>(null);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferenceSettings | null>(null);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationSavingKey, setNotificationSavingKey] = useState<string | null>(null);
  const [pushRegistration, setPushRegistration] = useState<PushRegistrationState | null>(null);
  const [nativeCallAlertStatus, setNativeCallAlertStatus] = useState<NativeCallAlertStatus | null>(null);
  const ringtonePreviewSoundRef = useRef<ChillyChatPlayingSound | null>(null);
  const [canOpenAdminDashboard, setCanOpenAdminDashboard] = useState(false);
  const [adminAccessLoading, setAdminAccessLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [displayNameNotice, setDisplayNameNotice] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameNotice, setUsernameNotice] = useState<string | null>(null);
  const [usernameAvailability, setUsernameAvailability] = useState<UsernameAvailability>({
    username: "",
    available: false,
    status: "idle",
    message: "Choose your username",
  });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [releaseDiagnostics, setReleaseDiagnostics] = useState<ReleaseDiagnosticsDisplay>(() => (
    sanitizeReleaseDiagnosticsForDisplay(readReleaseDiagnostics())
  ));
  const legalConfig = useMemo(() => getRuntimeLegalConfig(), []);
  const releaseDiagnosticsSummary = useMemo(
    () => formatReleaseDiagnosticsSummary(releaseDiagnostics),
    [releaseDiagnostics],
  );
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
    const section = String(params.section ?? "").trim().toLowerCase();
    if (section === "notifications" || section === "activity") {
      setExpandedSections((current) => ({ ...current, notifications: true }));
    } else if (section === "app-info" || section === "diagnostics") {
      setExpandedSections((current) => ({ ...current, "app-info": true }));
    }
  }, [params.section]);

  useEffect(() => {
    setReleaseDiagnostics(sanitizeReleaseDiagnosticsForDisplay(readReleaseDiagnostics()));
  }, []);

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
    void readMyProfileAccessVisibility()
      .then((visibility) => {
        if (active) setProfileVisibility(visibility);
      })
      .catch(() => {
        if (active) setProfileVisibility("public");
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
        if (active) setDisplayNameDraft(profile.displayName ?? "");
        if (active) setUsernameDraft(normalizeUsernameHandle(profile.username));
      })
      .catch(() => {
        if (active) setMyProfile(null);
      });

    return () => {
      active = false;
    };
  }, [isLoading, isSignedIn]);

  useEffect(() => {
    let active = true;

    if (isLoading || !isSignedIn) {
      setAccountDeletionStatus(null);
      setDeletionRequestNotice(null);
      return () => {
        active = false;
      };
    }

    setAccountDeletionStatusLoading(true);
    void readMyAccountDeletionStatus()
      .then((status) => {
        if (!active) return;
        setAccountDeletionStatus(status);
        setDeletionRequestNotice(status.scheduled ? status.message : null);
      })
      .catch(() => {
        if (active) setAccountDeletionStatus(null);
      })
      .finally(() => {
        if (active) setAccountDeletionStatusLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isLoading, isSignedIn]);

  useEffect(() => {
    const local = validateUsernameHandle(usernameDraft);
    setUsernameAvailability(local);
    if (!local.available || local.username === normalizeUsernameHandle(myProfile?.username)) return;

    setUsernameAvailability({ ...local, status: "checking", available: false, message: "Checking..." });
    const timeout = setTimeout(() => {
      void checkUsernameAvailability(local.username)
        .then(setUsernameAvailability)
        .catch(() => {
          setUsernameAvailability({
            username: local.username,
            available: false,
            status: "not_allowed",
            message: "Not available",
          });
        });
    }, 400);

    return () => clearTimeout(timeout);
  }, [myProfile?.username, usernameDraft]);

  const refreshNotifications = useCallback(async () => {
    if (!isSignedIn) return;
    setNotificationLoading(true);
    try {
      const [preferences, registration, callAlertStatus] = await Promise.all([
        readNotificationPreferences(),
        readCurrentPushRegistration(),
        readNativeCallAlertStatus(),
      ]);
      setNotificationPreferences(preferences);
      setPushRegistration(registration);
      setNativeCallAlertStatus(callAlertStatus);
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
      const message = getUserFacingErrorMessage(error, "Unable to update notification preferences.");
      Alert.alert("Notifications", message);
    } finally {
      setNotificationSavingKey(null);
    }
  }, [notificationPreferences, notificationSavingKey]);

  const onPressRegisterPush = useCallback(async () => {
    if (notificationSavingKey) return;

    setNotificationSavingKey("push-register");
    try {
      const result = await requestPushPermissionAndRegister();
      let nextRegistration = result;
      if (result.status === "registered") {
        const updated = await updateNotificationPreferences({ pushEnabled: true });
        setNotificationPreferences(updated);
        nextRegistration = await readCurrentPushRegistration();
      }
      setPushRegistration(nextRegistration);
    } finally {
      setNotificationSavingKey(null);
    }
  }, [notificationSavingKey]);

  const onPressOpenNotificationSettings = useCallback(async () => {
    await Linking.openSettings().catch(() => {
      Alert.alert("Notifications", "Open this device's Settings app to change notification permission.");
    });
  }, []);

  const onPressRefreshPushRegistration = useCallback(async () => {
    if (notificationSavingKey) return;

    setNotificationSavingKey("push-refresh");
    try {
      const [nextRegistration, callAlertStatus] = await Promise.all([
        readCurrentPushRegistration(),
        readNativeCallAlertStatus(),
      ]);
      setPushRegistration(nextRegistration);
      setNativeCallAlertStatus(callAlertStatus);
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "Unable to verify this device push registration.");
      setPushRegistration({
        message: `${message} In-app Activity is tied to your account and still works in the app.`,
        permissionState: "error",
        provider: "expo",
        status: "error",
        tokenFingerprint: null,
        nativeTokenFingerprint: null,
      });
    } finally {
      setNotificationSavingKey(null);
    }
  }, [notificationSavingKey]);

  const onPressNativeCallAlertSettings = useCallback(async () => {
    const opened = await openNativeCallAlertSettings();
    if (!opened) {
      Alert.alert(
        "Chi'lly Chat calls",
        "Android full-screen call alert settings are not available on this device.",
      );
    }
  }, []);

  const onSelectChillyChatRingtone = useCallback(async (key: ChillyChatRingtoneKey) => {
    if (!notificationPreferences || notificationSavingKey) return;
    setNotificationSavingKey("chillyChatCallSoundKey");
    try {
      const updated = await updateNotificationPreferences({ chillyChatCallSoundKey: key });
      setNotificationPreferences(updated);
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "Unable to update Chi'lly Chat call sound.");
      Alert.alert("Chi'lly Chat calls", message);
    } finally {
      setNotificationSavingKey(null);
    }
  }, [notificationPreferences, notificationSavingKey]);

  const onToggleChillyChatCallRing = useCallback(async (enabled: boolean) => {
    if (!notificationPreferences || notificationSavingKey) return;

    const nextSoundKey: ChillyChatRingtoneKey = enabled
      ? notificationPreferences.chillyChatCallSoundKey === "silent_vibrate"
        ? "chilly_ring"
        : notificationPreferences.chillyChatCallSoundKey
      : "silent_vibrate";

    setNotificationSavingKey("chillyChatCallSoundKey");
    try {
      const updated = await updateNotificationPreferences({ chillyChatCallSoundKey: nextSoundKey });
      setNotificationPreferences(updated);
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "Unable to update Chi'lly Chat call ring.");
      Alert.alert("Chi'lly Chat calls", message);
    } finally {
      setNotificationSavingKey(null);
    }
  }, [notificationPreferences, notificationSavingKey]);

  const onPreviewChillyChatRingtone = useCallback(async () => {
    if (!notificationPreferences) return;
    await stopChillyChatCallSound(ringtonePreviewSoundRef.current);
    ringtonePreviewSoundRef.current = null;
    if (notificationPreferences.chillyChatCallVibrateEnabled) {
      Vibration.vibrate(notificationPreferences.chillyChatCallSoundKey === "quiet_buzz" ? [0, 120, 80, 120] : [0, 220, 120, 220]);
    }
    if (notificationPreferences.chillyChatCallSoundKey !== "silent_vibrate") {
      try {
        const sound = await playChillyChatCallSound(notificationPreferences.chillyChatCallSoundKey, { volume: 0.85 });
        if (!sound) {
          Alert.alert("Chi'lly Chat preview", CHILLY_CHAT_SOUND_PLAYBACK_ERROR);
          return;
        }
        ringtonePreviewSoundRef.current = sound;
        setTimeout(() => {
          void stopChillyChatCallSound(sound);
          if (ringtonePreviewSoundRef.current === sound) {
            ringtonePreviewSoundRef.current = null;
          }
        }, 1800);
      } catch {
        Alert.alert("Chi'lly Chat preview", CHILLY_CHAT_SOUND_PLAYBACK_ERROR);
        return;
      }
    }
    const previewMessage = notificationPreferences.chillyChatCallSoundKey === "silent_vibrate"
      ? "Silent / Vibrate Only is selected. In-app calls will not play a ringtone."
      : notificationPreferences.chillyChatCallSoundKey === "quiet_buzz"
        ? "Quiet Buzz preview started. It is a quieter, vibration-first alert, so keep Vibrate on calls enabled if you want the buzz pattern."
        : Platform.OS === "android"
          ? "Preview sound started. Background push sound uses the Android call channel and Android settings may override it."
          : "Preview sound started. iOS system notification settings may override alert sound behavior.";
    Alert.alert(
      "Chi'lly Chat preview",
      previewMessage,
    );
  }, [notificationPreferences]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  useEffect(() => {
    return () => {
      void stopChillyChatCallSound(ringtonePreviewSoundRef.current);
      ringtonePreviewSoundRef.current = null;
    };
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
    if (pushRegistration?.status === "error") return "Unable to verify";
    if (pushRegistration?.status === "blocked") return "Unavailable";
    if (pushRegistration?.status === "unsupported") return "Unsupported";
    return "Not registered";
  }, [pushRegistration?.permissionState, pushRegistration?.status]);
  const showRegisterPushButton = !pushRegistration
    || pushRegistration.status === "not_registered"
    || pushRegistration.status === "denied"
    || pushRegistration.status === "error";
  const nativeCallAlertStatusLabel = useMemo(() => {
    if (!nativeCallAlertStatus) return "Checking";
    if (!nativeCallAlertStatus.available) return "Build update needed";
    if (nativeCallAlertStatus.granted === true) return "On";
    if (nativeCallAlertStatus.granted === false) return "Needs Android permission";
    return "Not available";
  }, [nativeCallAlertStatus]);

  const profileVisibilityLabel = profileVisibilityLoading ? "Loading" : getAccessVisibilityLabel(profileVisibility);
  const accountDeletionScheduled = accountDeletionStatus?.scheduled === true;
  const accountDeletionRestoreDate = useMemo(() => {
    const rawDate = accountDeletionStatus?.restoreDeadline || accountDeletionStatus?.deleteAfter;
    if (!rawDate) return "";

    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) return "";

    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [accountDeletionStatus?.deleteAfter, accountDeletionStatus?.restoreDeadline]);

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
      await revokeCurrentPushInstall().catch(() => null);
      await revokeIosVoipRegistration().catch(() => null);
      const { error } = await supabase.auth.signOut();

      if (error) {
        const message = getUserFacingErrorMessage(error, "Unable to log out right now.");
        trackEvent("auth_sign_out_failed", {
          reason: message,
          source: "settings",
        });
        Alert.alert("Log Out", message);
        return;
      }

      trackEvent("auth_sign_out_success", {
        source: "settings",
      });
      router.replace("/(auth)/login");
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "Unable to log out right now.");
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

    setProfileAppearanceSheetKind(null);
    try {
      const file = await pickProfileMediaImage(kind);
      if (!file) return;
      setProfileMediaReview({
        kind,
        file,
        fitMode: kind === "avatar"
          ? myProfile?.profileAvatarFitMode ?? "fill"
          : myProfile?.profileBackgroundFitMode ?? "fill",
      });
    } catch (error) {
      Alert.alert(
        "Profile Appearance",
        getUserFacingErrorMessage(error, "Unable to choose a Profile image right now."),
      );
    }
  }, [myProfile?.profileAvatarFitMode, myProfile?.profileBackgroundFitMode, profileAppearanceBusy]);

  const onSaveProfileMediaReview = useCallback(async () => {
    if (!profileMediaReview || profileAppearanceBusy) return;

    setProfileAppearanceBusy(profileMediaReview.kind);
    try {
      const nextProfile = await uploadProfileMedia(profileMediaReview.kind, profileMediaReview.file, {
        fitMode: profileMediaReview.fitMode,
      });
      setMyProfile(nextProfile);
      setProfileMediaReview(null);
      Alert.alert(
        "Profile Appearance",
        profileMediaReview.kind === "avatar" ? "Profile photo updated." : "Profile background updated.",
      );
    } catch (error) {
      Alert.alert(
        "Profile Appearance",
        getUserFacingErrorMessage(error, "Unable to update Profile appearance right now."),
      );
    } finally {
      setProfileAppearanceBusy(null);
    }
  }, [profileAppearanceBusy, profileMediaReview]);

  const onRemoveProfileMedia = useCallback((kind: ProfileMediaKind) => {
    const imageUrl = kind === "avatar" ? activeProfilePhotoUrl : activeProfileBackgroundUrl;
    if (!imageUrl || profileAppearanceBusy) return;

    setProfileAppearanceSheetKind(null);
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
                  getUserFacingErrorMessage(error, "Unable to remove this Profile image right now."),
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
        getUserFacingErrorMessage(error, "Unable to update this image fit right now."),
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

  const onPressProfileVisibility = useCallback(async (visibility: AccessVisibility) => {
    if (profileVisibilitySaving || visibility === profileVisibility) return;

    setProfileVisibilitySaving(visibility);
    setProfileVisibilityNotice(null);
    try {
      const savedVisibility = await updateMyProfileAccessVisibility(visibility);
      setProfileVisibility(savedVisibility);
      setProfileVisibilityNotice(`Profile visibility set to ${getAccessVisibilityLabel(savedVisibility)}.`);
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "Unable to update profile privacy right now.");
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
        const message = getUserFacingErrorMessage(error, "Unable to update your password right now.");
        setPasswordNotice(message);
        Alert.alert("Change Password", message);
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

  const onPressSaveDisplayName = useCallback(async () => {
    if (displayNameSaving) return;

    const normalizedDisplayName = displayNameDraft.trim().replace(/\s+/g, " ");
    const currentDisplayName = (myProfile?.displayName ?? "").trim().replace(/\s+/g, " ");
    setDisplayNameNotice(null);

    if (!normalizedDisplayName) {
      const message = "Enter a display name.";
      setDisplayNameNotice(message);
      Alert.alert("Display Name", message);
      return;
    }
    if (normalizedDisplayName.length > 60) {
      const message = "Display name must be 60 characters or less.";
      setDisplayNameNotice(message);
      Alert.alert("Display Name", message);
      return;
    }
    if (normalizedDisplayName === currentDisplayName) {
      setDisplayNameDraft(normalizedDisplayName);
      setDisplayNameNotice("Display name is current.");
      return;
    }

    setDisplayNameSaving(true);
    try {
      const result = await updateMyDisplayName(normalizedDisplayName);
      setMyProfile(result);
      setDisplayNameDraft(result.displayName ?? "");
      setDisplayNameNotice("Display name updated.");
      Alert.alert("Display Name", "Display name updated.");
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "Unable to update your display name right now.");
      setDisplayNameNotice(message);
      Alert.alert("Display Name", message);
    } finally {
      setDisplayNameSaving(false);
    }
  }, [displayNameDraft, displayNameSaving, myProfile?.displayName]);

  const onPressSaveUsername = useCallback(async () => {
    if (usernameSaving) return;

    const normalizedUsername = normalizeUsernameHandle(usernameDraft);
    const currentUsername = normalizeUsernameHandle(myProfile?.username);
    if (normalizedUsername === currentUsername) {
      setUsernameNotice("Handle is current.");
      return;
    }

    if (!usernameAvailability.available || usernameAvailability.username !== normalizedUsername) {
      const message = usernameAvailability.message || "Choose an available username.";
      setUsernameNotice(message);
      Alert.alert("Choose your handle", message);
      return;
    }

    setUsernameSaving(true);
    setUsernameNotice(null);
    try {
      const result = await updateMyUsername(normalizedUsername);
      const baseProfile = myProfile ?? await readUserProfile().catch(() => null);
      const updatedProfile = baseProfile ? { ...baseProfile, username: result.username } : null;
      if (updatedProfile) await saveUserProfile(updatedProfile);
      setMyProfile(updatedProfile);
      setUsernameDraft(result.username);
      setUsernameNotice("Handle updated.");
      Alert.alert("Handle", "Handle updated.");
    } catch (error) {
      const message = getUsernameErrorMessage(error);
      setUsernameNotice(message);
      Alert.alert("Handle", message);
    } finally {
      setUsernameSaving(false);
    }
  }, [myProfile, usernameAvailability.available, usernameAvailability.message, usernameAvailability.username, usernameDraft, usernameSaving]);

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

  const onPressSubmitAccountDeletionRequest = useCallback(() => {
    if (!isSignedIn) {
      Alert.alert("Sign in required", "Sign in before deleting your account.");
      return;
    }

    Alert.alert(
      "Delete account?",
      "Your account will be scheduled for deletion now. You have 30 days to sign back in and restore it before permanent deletion processing.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            setDeletionRequestSaving(true);
            setDeletionRequestNotice(null);
            void scheduleAccountDeletion({
              reason: "User scheduled account deletion from Settings.",
            })
              .then((result) => {
                setAccountDeletionStatus(result);
                const message = result.alreadyExists
                  ? "Account deletion is already scheduled."
                  : "Account deletion scheduled. You have 30 days to restore your account.";
                setDeletionRequestNotice(message);
                Alert.alert("Account deletion", `${message} You will be signed out now.`, [
                  {
                    text: "OK",
                    onPress: () => {
                      void revokeCurrentPushInstall()
                        .catch(() => null)
                        .then(() => revokeIosVoipRegistration().catch(() => null))
                        .then(() => supabase.auth.signOut())
                        .finally(() => {
                          router.replace("/(auth)/login");
                        });
                    },
                  },
                ]);
              })
              .catch((error) => {
                const message = getAccountDeletionRequestErrorMessage(error);
                setDeletionRequestNotice(message);
                Alert.alert("Account deletion", message);
              })
              .finally(() => setDeletionRequestSaving(false));
          },
        },
      ],
    );
  }, [isSignedIn, router]);

  const onPressRestoreAccountDeletion = useCallback(() => {
    if (!isSignedIn) {
      Alert.alert("Sign in required", "Sign in before restoring your account.");
      return;
    }

    Alert.alert(
      "Restore account?",
      "This cancels the scheduled deletion and keeps your Chi'llywood account active.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Restore Account",
          onPress: () => {
            setDeletionRequestSaving(true);
            void restoreScheduledAccountDeletion()
              .then((result) => {
                setAccountDeletionStatus({ ...result, scheduled: false });
                setDeletionRequestNotice("Account deletion canceled.");
                Alert.alert("Account restored", "Account deletion canceled.");
              })
              .catch((error) => {
                const message = getAccountDeletionRequestErrorMessage(error);
                setDeletionRequestNotice(message);
                Alert.alert("Account deletion", message);
              })
              .finally(() => setDeletionRequestSaving(false));
          },
        },
      ],
    );
  }, [isSignedIn]);

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

  const onPressCopyReleaseDiagnostics = useCallback(() => {
    void Clipboard.setStringAsync(releaseDiagnosticsSummary)
      .then(() => {
        Alert.alert("App diagnostics", "Release diagnostics copied.");
      })
      .catch(() => {
        Alert.alert("App diagnostics", "Diagnostics could not be copied on this device.");
      });
  }, [releaseDiagnosticsSummary]);

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

    const value = item.kind === "chilly-chat-ring"
      ? notificationPreferences.chillyChatCallSoundKey !== "silent_vibrate"
      : !!notificationPreferences[item.key];
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
            if (item.kind === "chilly-chat-ring") {
              void onToggleChillyChatCallRing(nextValue);
              return;
            }
            void onToggleNotificationPreference(item.key, nextValue);
          }}
          thumbColor={value ? "#FFE4EA" : "#A5AEC0"}
          trackColor={{ false: "rgba(255,255,255,0.16)", true: "rgba(220,20,60,0.52)" }}
        />
      </View>
    );
  }, [notificationPreferences, notificationSavingKey, onToggleChillyChatCallRing, onToggleNotificationPreference]);

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
  const settingsAccountIdentity = formatSettingsAccountIdentity({
    displayName: myProfile?.displayName,
    username: myProfile?.username,
    email: user?.email,
  });

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
        <AppBackButton
          accessibilityLabel="Go back from Settings"
          onPress={onSettingsBack}
          style={styles.headerBackButton}
          testID="settings-back-button"
        />
        <Text style={styles.kicker}>SETTINGS</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryCopy}>
            <Text style={styles.cardKicker}>CONTROL CENTER</Text>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.body}>
              {settingsAccountIdentity === "Signed in" ? "Signed in." : `Signed in as ${settingsAccountIdentity}.`}
            </Text>
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
          id="account-display-name"
          title="Display name"
          summary={`Current name: ${myProfile?.displayName || "Not set"}`}
          expandedSections={expandedSections}
          onToggle={toggleSection}
        >
          <Text style={styles.statusNote}>
            This is the name people see on your Profile, posts, comments, and rooms. It can be different from your @handle.
          </Text>
          <View style={styles.usernameEditorCard}>
            <TextInput
              style={styles.input}
              value={displayNameDraft}
              onChangeText={(value) => {
                setDisplayNameDraft(value);
                setDisplayNameNotice(null);
              }}
              placeholder="Display name"
              placeholderTextColor="#788196"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={60}
              editable={!displayNameSaving}
            />
            <View style={styles.usernameStatusRow}>
              <View style={styles.usernameStatusPill}>
                <Text style={styles.usernameStatusText}>
                  {(myProfile?.displayName ?? "").trim() ? "Current display name" : "Not set yet"}
                </Text>
              </View>
              <Text style={styles.usernamePreview} numberOfLines={1}>
                {displayNameDraft.trim() || "Display name"}
              </Text>
            </View>
            {displayNameNotice ? <Text style={styles.inlineNotice}>{displayNameNotice}</Text> : null}
            <TouchableOpacity
              style={[
                styles.inlinePrimaryButton,
                (displayNameSaving || !displayNameDraft.trim() || displayNameDraft.trim().replace(/\s+/g, " ") === (myProfile?.displayName ?? "").trim().replace(/\s+/g, " ")) && styles.inlinePrimaryButtonDisabled,
              ]}
              activeOpacity={0.86}
              disabled={displayNameSaving || !displayNameDraft.trim() || displayNameDraft.trim().replace(/\s+/g, " ") === (myProfile?.displayName ?? "").trim().replace(/\s+/g, " ")}
              onPress={onPressSaveDisplayName}
            >
              <Text style={styles.inlinePrimaryButtonText}>{displayNameSaving ? "Saving..." : "Save Display Name"}</Text>
            </TouchableOpacity>
          </View>
        </InlineAccordion>

        <InlineAccordion
          id="account-username"
          title="Username"
          summary={`Current handle: ${formatUsernameHandle(myProfile?.username) || "Not set"}`}
          expandedSections={expandedSections}
          onToggle={toggleSection}
        >
          <Text style={styles.statusNote}>
            This is how people find you. Your @handle can be different from your display name.
          </Text>
          <View style={styles.usernameEditorCard}>
            <View style={styles.usernameInputWrap}>
              <Text style={styles.usernameAtPrefix}>@</Text>
              <TextInput
                style={styles.usernameInput}
                value={usernameDraft}
                onChangeText={(value) => setUsernameDraft(normalizeUsernameHandle(value))}
                placeholder="creatorname"
                placeholderTextColor="#788196"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.usernameStatusRow}>
              <View style={[
                styles.usernameStatusPill,
                usernameAvailability.available && styles.usernameStatusPillAvailable,
                (usernameAvailability.status === "taken" || usernameAvailability.status === "reserved" || usernameAvailability.status === "not_allowed") && styles.usernameStatusPillBlocked,
              ]}>
                <Text style={[
                  styles.usernameStatusText,
                  usernameAvailability.available && styles.usernameStatusTextAvailable,
                  (usernameAvailability.status === "taken" || usernameAvailability.status === "reserved" || usernameAvailability.status === "not_allowed") && styles.usernameStatusTextBlocked,
                ]}>
                  {normalizeUsernameHandle(myProfile?.username) === normalizeUsernameHandle(usernameDraft)
                    ? "Current handle"
                    : usernameAvailability.message}
                </Text>
              </View>
              <Text style={styles.usernamePreview}>{formatUsernameHandle(usernameDraft)}</Text>
            </View>
            {usernameNotice ? <Text style={styles.inlineNotice}>{usernameNotice}</Text> : null}
            <TouchableOpacity
              style={[
                styles.inlinePrimaryButton,
                usernameSaving && styles.inlinePrimaryButtonDisabled,
              ]}
              activeOpacity={0.86}
              disabled={usernameSaving}
              onPress={onPressSaveUsername}
            >
              <Text style={styles.inlinePrimaryButtonText}>{usernameSaving ? "Saving..." : "Save Handle"}</Text>
            </TouchableOpacity>
          </View>
        </InlineAccordion>
        <InlineAccordion
          id="account-privacy"
          title="Profile visibility"
          summary={`Current visibility: ${profileVisibilityLabel}`}
          expandedSections={expandedSections}
          onToggle={toggleSection}
        >
          <Text style={styles.statusNote}>
            Profile is your person/social identity. Followers are public social signals only and do not unlock private or subscriber-only access.
          </Text>
          <View style={styles.privacyOptionRow}>
            {ACCESS_VISIBILITY_OPTIONS.map((option) => {
              const active = profileVisibility === option.value;
              const saving = profileVisibilitySaving === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  testID={option.profileTestID}
                  accessibilityLabel={`${option.label} Profile visibility`}
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
                  <Text style={styles.privacyOptionDescription}>{option.profileDescription}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            testID="profile-visibility-save-button"
            accessibilityLabel="Save Profile visibility"
            style={[styles.inlinePrimaryButton, (profileVisibilityLoading || !!profileVisibilitySaving) && styles.inlinePrimaryButtonDisabled]}
            activeOpacity={0.86}
            disabled={profileVisibilityLoading || !!profileVisibilitySaving}
            onPress={() => {
              void onPressProfileVisibility(profileVisibility);
            }}
          >
            <Text style={styles.inlinePrimaryButtonText}>
              {profileVisibilitySaving ? "Saving..." : "Save Profile Visibility"}
            </Text>
          </TouchableOpacity>
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
        <SettingsRow title="Account actions" subtitle="Log out, review the deletion policy, or delete this signed-in account." tone="danger">
          <View style={styles.accountDeletionPanel}>
            <View style={styles.accountDeletionPanelHeader}>
              <View style={styles.accountDeletionCopy}>
                <Text style={styles.accountDeletionTitle}>Delete account</Text>
                <Text style={styles.accountDeletionBody}>
                  {accountDeletionScheduled
                    ? `Deletion is scheduled. Restore by ${accountDeletionRestoreDate || "the restore deadline"} to keep this account.`
                    : "Schedules account deletion immediately with a 30-day restore window."}
                </Text>
              </View>
              <StatusPill
                label={accountDeletionStatusLoading ? "Checking" : accountDeletionScheduled ? "Scheduled" : "30-day restore"}
                tone={accountDeletionScheduled ? "danger" : "warning"}
              />
            </View>
            {deletionRequestNotice ? (
              <Text style={styles.accountDeletionNotice}>{deletionRequestNotice}</Text>
            ) : null}
          </View>
          {accountDeletionScheduled ? (
            <TouchableOpacity
              style={[
                styles.restoreAccountButton,
                styles.fullWidthButton,
                deletionRequestSaving && styles.utilityButtonDisabled,
              ]}
              activeOpacity={0.86}
              onPress={onPressRestoreAccountDeletion}
              disabled={deletionRequestSaving}
              accessibilityRole="button"
              accessibilityLabel="Restore account"
              testID="settings-restore-account-button"
            >
              {deletionRequestSaving
                ? <ActivityIndicator color="#CFF7E3" size="small" />
                : <Text style={styles.restoreAccountButtonText}>Restore Account</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.dangerOutlineButton,
                styles.fullWidthButton,
                deletionRequestSaving && styles.utilityButtonDisabled,
              ]}
              activeOpacity={0.86}
              onPress={onPressSubmitAccountDeletionRequest}
              disabled={deletionRequestSaving || accountDeletionStatusLoading}
              accessibilityRole="button"
              accessibilityLabel="Delete account"
              testID="settings-delete-account-button"
            >
              {deletionRequestSaving
                ? <ActivityIndicator color="#FFD4DD" size="small" />
                : <Text style={styles.dangerOutlineButtonText}>Delete Account</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.secondaryActionButton}
            activeOpacity={0.86}
            onPress={onPressAccountDeletion}
            accessibilityRole="button"
            accessibilityLabel="Open account deletion policy"
          >
            <Text style={styles.secondaryActionButtonText}>Read Deletion Policy</Text>
          </TouchableOpacity>
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
          subtitle={pushRegistration?.message ?? "Register this device for push alerts."}
          value={pushStatusLabel}
        >
          {pushRegistration?.tokenFingerprint ? (
            <Text style={styles.metaText}>Device fingerprint {pushRegistration.tokenFingerprint}</Text>
          ) : null}
          {pushRegistration?.nativeTokenFingerprint ? (
            <Text style={styles.metaText}>Native call fingerprint {pushRegistration.nativeTokenFingerprint}</Text>
          ) : null}
          <Text style={styles.metaText}>
            Device push registration controls phone push alerts. In-app Activity lives in the bell tray and still works in the app.
          </Text>
          <View style={styles.utilityRow}>
            {Platform.OS === "ios" && pushRegistration?.permissionState === "denied" ? (
              <TouchableOpacity
                style={[styles.utilityButton, !!notificationSavingKey && styles.utilityButtonDisabled]}
                activeOpacity={0.86}
                disabled={!!notificationSavingKey}
                onPress={() => {
                  void onPressOpenNotificationSettings();
                }}
              >
                <Text style={styles.utilityButtonText}>Open Settings</Text>
              </TouchableOpacity>
            ) : showRegisterPushButton ? (
              <TouchableOpacity
                style={[styles.utilityButton, !!notificationSavingKey && styles.utilityButtonDisabled]}
                activeOpacity={0.86}
                disabled={!!notificationSavingKey}
                onPress={() => {
                  void onPressRegisterPush();
                }}
              >
                {notificationSavingKey === "push-register"
                  ? <ActivityIndicator color="#E5ECF8" size="small" />
                  : <Text style={styles.utilityButtonText}>Register Device</Text>}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.utilityButton,
                (!!notificationSavingKey || notificationLoading) && styles.utilityButtonDisabled,
              ]}
              activeOpacity={0.86}
              disabled={!!notificationSavingKey || notificationLoading}
              onPress={() => {
                void onPressRefreshPushRegistration();
              }}
            >
              {notificationSavingKey === "push-refresh"
                ? <ActivityIndicator color="#E5ECF8" size="small" />
                : <Text style={styles.utilityButtonText}>Refresh</Text>}
            </TouchableOpacity>
          </View>
        </SettingsRow>
        <SettingsRow
          title="Bell Activity"
          subtitle="Use the bell icon for account activity, important alerts, timestamps, read state, dismiss, and routing."
          value="Bell tray"
        >
          <Text style={styles.metaText}>
            Settings manages alert preferences and device push registration only. The bell tray is the notification Activity inbox for creator-money receipts, creator sale alerts, event reminders, calls, and system alerts.
          </Text>
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
        {Platform.OS === "android" ? (
          <SettingsRow
            title="Full-screen call alerts"
            subtitle="Android controls whether Chi'lly Chat calls can open over the lock screen."
            value={nativeCallAlertStatusLabel}
          >
            <Text style={styles.metaText}>
              {nativeCallAlertStatus?.message
                ?? "Requires the native Google Play build with Android CallStyle support."}
            </Text>
            <Text style={styles.metaText}>
              Channel: {nativeCallAlertStatus?.channelId ?? "chilly_chat_calls_fullscreen_v1"}. DND, notification volume, and Android channel settings can still silence ringing.
            </Text>
            {nativeCallAlertStatus?.canOpenSettings ? (
              <TouchableOpacity
                style={styles.utilityButton}
                activeOpacity={0.86}
                onPress={() => {
                  void onPressNativeCallAlertSettings();
                }}
              >
                <Text style={styles.utilityButtonText}>Open Android call alert settings</Text>
              </TouchableOpacity>
            ) : null}
          </SettingsRow>
        ) : null}
        <SettingsRow
          title="Incoming call sound"
          subtitle={Platform.OS === "android"
            ? "Choose the ringtone used when Ring on calls is on. Background call alerts use the Android call channel, and Android settings may override it."
            : "Choose the in-app ringtone used when Ring on calls is on. Native iOS incoming calls remain disabled pending a later device-tested phase."}
          value={
            notificationPreferences?.chillyChatCallSoundKey === "silent_vibrate"
              ? "Ring off"
              : (CHILLY_CHAT_RINGTONE_OPTIONS.find((option) => option.key === notificationPreferences?.chillyChatCallSoundKey)?.label
                ?? "Chi'lly Ring")
          }
        >
          <View style={styles.preferenceList}>
            {CHILLY_CHAT_RINGTONE_OPTIONS.filter((option) => option.key !== "silent_vibrate").map((option) => {
              const selected = notificationPreferences?.chillyChatCallSoundKey === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.ringtoneOptionRow, selected && styles.ringtoneOptionRowSelected]}
                  activeOpacity={0.86}
                  disabled={!!notificationSavingKey}
                  onPress={() => {
                    void onSelectChillyChatRingtone(option.key);
                  }}
                >
                  <View style={styles.preferenceTextWrap}>
                    <Text style={styles.preferenceLabel}>{option.label}</Text>
                    <Text style={styles.preferenceDescription}>{option.description}</Text>
                  </View>
                  <Text style={styles.ringtoneSelectedText}>{selected ? "Selected" : "Choose"}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.utilityButton}
              activeOpacity={0.86}
              disabled={!notificationPreferences}
              onPress={() => {
                void onPreviewChillyChatRingtone();
              }}
            >
              <Text style={styles.utilityButtonText}>Preview sound</Text>
            </TouchableOpacity>
            <Text style={styles.metaText}>
              {Platform.OS === "android"
                ? "Downloaded/imported sounds are in-app only for V1. Background push sounds use the Android call notification channel, not downloaded sounds."
                : "Downloaded/imported sounds are in-app only. Ordinary iOS push alerts use the system notification sound."}
            </Text>
          </View>
        </SettingsRow>
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
        <View style={styles.releaseDiagnosticsCard} testID="release-diagnostics-card">
          <View style={styles.releaseDiagnosticsHeader}>
            <View style={styles.releaseDiagnosticsCopy}>
              <Text style={styles.releaseDiagnosticsTitle}>App diagnostics</Text>
              <Text style={styles.releaseDiagnosticsBody}>
                Non-secret release identity for support and installed OTA proof.
              </Text>
            </View>
            <StatusPill label={releaseDiagnostics.isEmergencyLaunch ? "Emergency" : "Release"} tone={releaseDiagnostics.isEmergencyLaunch ? "danger" : "muted"} />
          </View>
          <View style={styles.releaseDiagnosticsGrid}>
            <ReleaseDiagnosticItem label="Application ID" value={releaseDiagnostics.applicationId} />
            <ReleaseDiagnosticItem label="App version" value={releaseDiagnostics.appVersion} />
            <ReleaseDiagnosticItem label="Native build" value={releaseDiagnostics.nativeBuildVersion ?? releaseDiagnostics.buildVersion} />
            <ReleaseDiagnosticItem label="Runtime" value={releaseDiagnostics.runtimeVersion} testID="release-diagnostics-runtime-version" />
            <ReleaseDiagnosticItem label="Channel" value={releaseDiagnostics.channel} testID="release-diagnostics-channel" />
            <ReleaseDiagnosticItem label="Update ID" value={releaseDiagnostics.updateId} testID="release-diagnostics-update-id" />
            <ReleaseDiagnosticItem label="Created at" value={releaseDiagnostics.createdAt} />
            <ReleaseDiagnosticItem label="Embedded launch" value={releaseDiagnostics.isEmbeddedLaunch} testID="release-diagnostics-embedded-launch" />
            <ReleaseDiagnosticItem label="Emergency launch" value={releaseDiagnostics.isEmergencyLaunch} testID="release-diagnostics-emergency-launch" />
            <ReleaseDiagnosticItem
              label="HEIC native module"
              value={releaseDiagnostics.imageManipulatorNativeModuleAvailable ? "Available" : "Missing"}
              testID="release-diagnostics-image-manipulator-module"
            />
            <ReleaseDiagnosticItem label="Auto check" value={releaseDiagnostics.checkAutomatically} />
            <ReleaseDiagnosticItem
              label="Last update check"
              value={releaseDiagnostics.latestKnownUpdateCheckResult
                ? `${releaseDiagnostics.latestKnownUpdateCheckResult.status} · ${releaseDiagnostics.latestKnownUpdateCheckResult.reason}`
                : null}
            />
          </View>
          <TouchableOpacity
            style={styles.secondaryActionButton}
            activeOpacity={0.86}
            onPress={onPressCopyReleaseDiagnostics}
            testID="release-diagnostics-copy-button"
          >
            <Text style={styles.secondaryActionButtonText}>Copy App Diagnostics</Text>
          </TouchableOpacity>
        </View>
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
      <ProfileMediaReviewSheet
        visible={!!profileMediaReview}
        kind={profileMediaReview?.kind ?? "avatar"}
        imageUri={profileMediaReview?.file.uri}
        fitMode={profileMediaReview?.fitMode}
        busy={profileMediaReview ? profileAppearanceBusy === profileMediaReview.kind : false}
        onSelectFitMode={(fitMode) => {
          setProfileMediaReview((current) => current ? { ...current, fitMode } : current);
        }}
        onChooseAnother={() => {
          if (!profileMediaReview || profileAppearanceBusy) return;
          const { kind } = profileMediaReview;
          setProfileMediaReview(null);
          void onChooseProfileMedia(kind);
        }}
        onSave={() => {
          void onSaveProfileMediaReview();
        }}
        onCancel={() => {
          if (!profileAppearanceBusy) setProfileMediaReview(null);
        }}
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
  headerBackButton: { width: 74 },
  kicker: {
    color: "#555",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  headerSpacer: {
    width: 74,
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
  usernameEditorCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 10,
  },
  usernameInputWrap: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.18)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  usernameAtPrefix: {
    color: "#FF5A76",
    fontSize: 15,
    fontWeight: "900",
  },
  usernameInput: {
    flex: 1,
    color: "#F8FAFF",
    fontSize: 14,
    fontWeight: "800",
    paddingVertical: 10,
  },
  usernameStatusRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  usernameStatusPill: {
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.16)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  usernameStatusPillAvailable: {
    backgroundColor: "rgba(34,197,94,0.18)",
  },
  usernameStatusPillBlocked: {
    backgroundColor: "rgba(248,113,113,0.16)",
  },
  usernameStatusText: {
    color: "#B8C2D6",
    fontSize: 11.5,
    fontWeight: "800",
  },
  usernameStatusTextAvailable: {
    color: "#7EF0A1",
  },
  usernameStatusTextBlocked: {
    color: "#FF9AA8",
  },
  usernamePreview: {
    color: "#DDE6F8",
    fontSize: 12,
    fontWeight: "800",
    flexShrink: 1,
  },
  inlineNotice: {
    color: "#C4CEE2",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  inlinePrimaryButton: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: "#DC143C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  inlinePrimaryButtonDisabled: {
    opacity: 0.48,
  },
  inlinePrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
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
    alignItems: "flex-start",
    justifyContent: "center",
    flexDirection: "column",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
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
  privacyOptionDescription: {
    color: "#AAB3C8",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
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
  ringtoneOptionRow: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ringtoneOptionRowSelected: {
    borderColor: "rgba(220,20,60,0.58)",
    backgroundColor: "rgba(220,20,60,0.16)",
  },
  ringtoneSelectedText: {
    color: "#FFE4EA",
    fontSize: 11,
    fontWeight: "900",
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
  releaseDiagnosticsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    padding: 12,
    gap: 12,
  },
  releaseDiagnosticsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  releaseDiagnosticsCopy: {
    flex: 1,
    gap: 4,
  },
  releaseDiagnosticsTitle: {
    color: "#F4F7FC",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
  },
  releaseDiagnosticsBody: {
    color: "#9AA6BA",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  releaseDiagnosticsGrid: {
    gap: 8,
  },
  releaseDiagnosticItem: {
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  releaseDiagnosticLabel: {
    color: "#7F8AA0",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  releaseDiagnosticValue: {
    color: "#EAF0FF",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
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
  accountDeletionPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(244,181,84,0.2)",
    backgroundColor: "rgba(244,181,84,0.08)",
    padding: 12,
    gap: 10,
  },
  accountDeletionPanelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  accountDeletionCopy: {
    flex: 1,
    gap: 4,
  },
  accountDeletionTitle: {
    color: "#F8FAFF",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  accountDeletionBody: {
    color: "#B8C1D6",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  accountDeletionNotice: {
    color: "#CFF7E3",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  dangerOutlineButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,90,118,0.5)",
    backgroundColor: "rgba(220,20,60,0.12)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  dangerOutlineButtonText: {
    color: "#FFD4DD",
    fontSize: 13,
    fontWeight: "900",
  },
  restoreAccountButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(112,211,166,0.38)",
    backgroundColor: "rgba(112,211,166,0.12)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  restoreAccountButtonText: {
    color: "#CFF7E3",
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryActionButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.045)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryActionButtonText: {
    color: "#EAF0FF",
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
