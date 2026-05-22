import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, Linking, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../_lib/analytics";
import {
  getCachedMonetizationSnapshot,
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
import { readMyProfileVisibility, updateMyProfileVisibility } from "../_lib/userData";

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
  const legalConfig = useMemo(() => getRuntimeLegalConfig(), []);
  const moderationAccess = useMemo(() => getModerationAccess({
    email: user?.email ?? null,
    userId: user?.id ?? null,
  }), [user?.email, user?.id]);

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

  const monetizationStatusLabel = useMemo(() => {
    if (!monetizationSnapshot.configuration.shouldConfigure) return "Premium is not enabled on this build";
    if (monetizationSnapshot.status === "ready") return "Premium can resolve on supported locked routes";
    if (monetizationSnapshot.status === "store_unavailable") return "Premium billing is unavailable on this device";
    if (monetizationSnapshot.status === "partial") return "Premium configuration is still being finalized";
    return "Premium is not currently available";
  }, [monetizationSnapshot.configuration.shouldConfigure, monetizationSnapshot.status]);

  const planLabel = useMemo(() => (
    monetizationSnapshot.targets.premium_subscription?.hasEntitlement ? "Premium is active on this account" : "No active Premium access on this account"
  ), [monetizationSnapshot.targets.premium_subscription?.hasEntitlement]);

  const entitlementsLabel = useMemo(() => (
    monetizationSnapshot.targets.premium_subscription?.hasEntitlement
      ? "This account already clears Premium-gated routes."
      : "Premium-gated routes still need an active Premium entitlement."
  ), [monetizationSnapshot.targets.premium_subscription?.hasEntitlement]);

  const offeringsLabel = useMemo(() => {
    if (monetizationSnapshot.currentOfferingId) return "A Premium offer is configured for supported unlock surfaces";
    if (monetizationSnapshot.availableOfferingIds.length) return "Premium offer configuration is present for supported unlock surfaces";
    return "No premium offer is currently available";
  }, [monetizationSnapshot.availableOfferingIds, monetizationSnapshot.currentOfferingId]);

  const issueLabel = useMemo(() => (
    monetizationSnapshot.targets.premium_subscription?.hasEntitlement
      ? "Manage Premium opens the account-owned Premium surface for restore, subscription management, and rechecking entitlement truth."
      : "Manage Premium opens the account-owned Premium surface. It will not grant access unless store billing and backend entitlement truth are active."
  ), [monetizationSnapshot.targets.premium_subscription?.hasEntitlement]);

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

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#DC143C" />
        <Text style={styles.loadingText}>Loading settings…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top + 16, 24),
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

      <View style={styles.card}>
        <Text style={styles.cardKicker}>ACCOUNT</Text>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.body}>
          Keep sign-out and account-level access here. Public channel presentation still stays on your profile surface.
        </Text>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Signed in as</Text>
          <Text style={styles.identityValue}>{String(user?.email ?? "Unknown account")}</Text>
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
            <Text style={styles.utilityButtonText}>Channel Studio</Text>
          </TouchableOpacity>
        </View>
        {canOpenAdminDashboard ? (
          <TouchableOpacity style={styles.secondaryActionButton} activeOpacity={0.86} onPress={onPressAdminDashboard}>
            <Text style={styles.secondaryActionButtonText}>Admin Dashboard</Text>
          </TouchableOpacity>
        ) : adminAccessLoading ? (
          <Text style={styles.metaText}>Checking admin access...</Text>
        ) : null}
        <TouchableOpacity style={styles.secondaryActionButton} activeOpacity={0.86} onPress={onPressChillyCircle}>
          <Text style={styles.secondaryActionButtonText}>{"Chi'lly Circle"}</Text>
        </TouchableOpacity>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Change password</Text>
          <Text style={styles.statusNote}>Update the password for this signed-in account.</Text>
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
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Profile privacy</Text>
          <Text style={styles.identityValue}>
            {profileVisibilityLoading ? "Loading privacy" : getProfileVisibilityLabel(profileVisibility)}
          </Text>
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
          {profileVisibilityNotice ? (
            <Text style={styles.metaText}>{profileVisibilityNotice}</Text>
          ) : null}
        </View>
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
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardKicker}>NOTIFICATIONS</Text>
            <Text style={styles.secondaryTitle}>Activity and Android alerts</Text>
          </View>
          {notificationLoading ? <ActivityIndicator color="#DC143C" size="small" /> : null}
        </View>
        <Text style={styles.body}>
          {"Choose which backed Chi'llywood activity can notify you. Private, blocked, ticketed, protected, or ineligible items stay silent."}
        </Text>

        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Android push status</Text>
          <Text style={styles.identityValue}>{pushRegistration?.message ?? "Register this Android device for production push alerts."}</Text>
          {pushRegistration?.tokenFingerprint ? (
            <Text style={styles.statusNote}>Device fingerprint {pushRegistration.tokenFingerprint}</Text>
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
        </View>

        {notificationPreferences ? (
          <View style={styles.preferenceList}>
            {[
              ["pushEnabled", "Push alerts", "Allow this device to receive Android push notifications."],
              ["inAppEnabled", "In-app activity", "Keep recent activity visible in your Profile News Feed."],
              ["followedCreatorLiveEnabled", "Followed creators live", "A followed creator starts an eligible public live session."],
              ["circleFriendLiveEnabled", "Chi'lly Circle live", "A mutual Chi'lly Circle connection starts an eligible public live session."],
              ["eventStartsSoonEnabled", "Events starting soon", "A saved public event is about 15 minutes away."],
              ["publicUploadEnabled", "Public uploads", "A followed creator publishes a public rights-safe upload."],
              ["replayLaterEnabled", "Replay later", "An eligible saved replay becomes available."],
            ].map(([key, label, description]) => {
              const preferenceKey = key as keyof Omit<NotificationPreferenceSettings, "updatedAt">;
              const value = !!notificationPreferences[preferenceKey];
              return (
                <View key={key} style={styles.preferenceRow}>
                  <View style={styles.preferenceTextWrap}>
                    <Text style={styles.preferenceLabel}>{label}</Text>
                    <Text style={styles.preferenceDescription}>{description}</Text>
                  </View>
                  <Switch
                    value={value}
                    disabled={!!notificationSavingKey}
                    onValueChange={(nextValue) => {
                      void onToggleNotificationPreference(preferenceKey, nextValue);
                    }}
                    thumbColor={value ? "#FFE4EA" : "#A5AEC0"}
                    trackColor={{ false: "rgba(255,255,255,0.16)", true: "rgba(220,20,60,0.52)" }}
                  />
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>LEGAL & SUPPORT</Text>
        <Text style={styles.secondaryTitle}>Legal-ready policy center</Text>
        <Text style={styles.body}>
          Open the full Chi&apos;llwood policies, request account deletion help, or contact support from one polished launch surface.
        </Text>
        <View style={styles.legalStatusCard}>
          <Text style={styles.legalStatusLabel}>Production policy bundle</Text>
          <Text style={styles.legalStatusValue}>Version 1.0 · Effective May 21, 2026</Text>
          <Text style={styles.legalStatusBody}>
            Full bundled policies are available in-app; public web links stay available where configured for store and browser review.
          </Text>
        </View>
        <View style={styles.legalPolicyGrid}>
          {LEGAL_POLICY_ROUTES.map((policy) => (
            <TouchableOpacity
              key={policy.slug}
              style={styles.legalPolicyButton}
              activeOpacity={0.86}
              onPress={() => onPressLegalPolicy(policy)}
            >
              <Text style={styles.legalPolicyButtonTitle}>{policy.title}</Text>
              <Text style={styles.legalPolicyButtonMeta}>{policy.wordCount.toLocaleString()} words</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.utilityRow}>
          <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressCopyrightReport}>
            <Text style={styles.utilityButtonText}>Report Copyright</Text>
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
        <Text style={styles.metaText}>
          Short Settings copy is only a launcher; the full bundled policy pages control where policy details are needed.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>PREMIUM ACCOUNT</Text>
        <Text style={styles.secondaryTitle}>Premium access on this account</Text>
        <Text style={styles.body}>
          Settings shows the Premium status Chi&apos;llywood can verify for this signed-in account. Manage Premium opens restore, purchase, and subscription-management options when they are available.
        </Text>

        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Account status</Text>
          <Text style={styles.identityValue}>{planLabel}</Text>
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Purchase readiness</Text>
          <Text style={styles.identityValue}>{monetizationStatusLabel}</Text>
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Protected access</Text>
          <Text style={styles.identityValue}>{entitlementsLabel}</Text>
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Offer readiness</Text>
          <Text style={styles.identityValue}>{offeringsLabel}</Text>
        </View>
        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Next step</Text>
          <Text style={styles.statusNote}>{issueLabel}</Text>
        </View>

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
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#06070B",
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
    gap: 10,
  },
  utilityButton: {
    flex: 1,
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
