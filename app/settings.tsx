import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../_lib/analytics";
import {
  getCachedMonetizationSnapshot,
  readMonetizationSnapshot,
  subscribeToMonetizationSnapshot,
} from "../_lib/monetization";
import {
  dismissNotification,
  markNotificationRead,
  readNotificationList,
  readNotificationPreferences,
  readPushPermissionState,
  requestAndroidPushPermissionAndRegister,
  revokeCurrentPushInstall,
  updateNotificationPreferences,
  type NotificationPreferencePatch,
  type NotificationPreferenceSettings,
  type NotificationRecord,
  type PushRegistrationState,
} from "../_lib/notifications";
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
  const [notificationActivity, setNotificationActivity] = useState<NotificationRecord[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationSavingKey, setNotificationSavingKey] = useState<string | null>(null);
  const [pushRegistration, setPushRegistration] = useState<PushRegistrationState | null>(null);
  const legalConfig = useMemo(() => getRuntimeLegalConfig(), []);

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
      const [preferences, activity, permissionState] = await Promise.all([
        readNotificationPreferences(),
        readNotificationList(undefined, 8),
        readPushPermissionState(),
      ]);
      setNotificationPreferences(preferences);
      setNotificationActivity(activity);
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

  const onPressNotification = useCallback((notification: NotificationRecord) => {
    void markNotificationRead(notification.id).then(() => refreshNotifications());
    const path = notification.deepLink?.replace(/^chillywoodmobile:\/\//u, "/") || "";
    if (path.startsWith("/")) {
      router.push(path as Parameters<typeof router.push>[0]);
    }
  }, [refreshNotifications, router]);

  const onPressDismissNotification = useCallback((notificationId: string) => {
    void dismissNotification(notificationId).then(() => refreshNotifications());
  }, [refreshNotifications]);

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

  const openLocalLegalRoute = useCallback((
    path: "/privacy" | "/terms" | "/account-deletion" | "/community-guidelines" | "/creator-rules" | "/copyright",
  ) => {
    router.push(path as Parameters<typeof router.push>[0]);
  }, [router]);

  const onPressPrivacyPolicy = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "privacy_policy",
      destination: legalConfig.privacyPolicyUrl ? "external" : "local",
    });

    if (legalConfig.privacyPolicyUrl) {
      void openExternalDestination(legalConfig.privacyPolicyUrl, "Privacy Policy");
      return;
    }

    openLocalLegalRoute("/privacy");
  }, [legalConfig.privacyPolicyUrl, openExternalDestination, openLocalLegalRoute]);

  const onPressTerms = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "terms_of_use",
      destination: legalConfig.termsOfServiceUrl ? "external" : "local",
    });

    if (legalConfig.termsOfServiceUrl) {
      void openExternalDestination(legalConfig.termsOfServiceUrl, "Terms of Use");
      return;
    }

    openLocalLegalRoute("/terms");
  }, [legalConfig.termsOfServiceUrl, openExternalDestination, openLocalLegalRoute]);

  const onPressAccountDeletion = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "account_deletion",
      destination: legalConfig.accountDeletionUrl ? "external" : "local",
    });

    if (legalConfig.accountDeletionUrl) {
      void openExternalDestination(legalConfig.accountDeletionUrl, "Account Deletion");
      return;
    }

    openLocalLegalRoute("/account-deletion");
  }, [legalConfig.accountDeletionUrl, openExternalDestination, openLocalLegalRoute]);

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

  const onPressSupport = useCallback(() => {
    trackEvent("settings_legal_opened", {
      source: "settings",
      target: "support",
      destination: "local",
    });

    router.push("/support" as Parameters<typeof router.push>[0]);
  }, [router]);

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
        <TouchableOpacity style={styles.secondaryActionButton} activeOpacity={0.86} onPress={onPressChillyCircle}>
          <Text style={styles.secondaryActionButtonText}>{"Chi'lly Circle"}</Text>
        </TouchableOpacity>
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
              ["inAppEnabled", "In-app activity", "Keep recent activity visible in Settings."],
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

        <View style={styles.identityBlock}>
          <Text style={styles.identityLabel}>Recent activity</Text>
          {notificationActivity.length ? notificationActivity.map((notification) => (
            <View key={notification.id} style={styles.activityRow}>
              <TouchableOpacity
                style={styles.activityMain}
                activeOpacity={0.84}
                onPress={() => onPressNotification(notification)}
              >
                <Text style={styles.activityTitle}>{notification.title}</Text>
                {notification.body ? <Text style={styles.activityBody}>{notification.body}</Text> : null}
                <Text style={styles.activityMeta}>
                  {notification.isRead ? "Read" : "Unread"} · {new Date(notification.createdAt).toLocaleString()}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.activityDismissButton}
                activeOpacity={0.84}
                onPress={() => onPressDismissNotification(notification.id)}
              >
                <Text style={styles.activityDismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          )) : (
            <Text style={styles.statusNote}>No backed notification activity yet.</Text>
          )}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>LEGAL & SUPPORT</Text>
        <Text style={styles.secondaryTitle}>Privacy, terms, and account help</Text>
        <Text style={styles.body}>
          Open the current policy pages or start an account-deletion request from the canonical account-help path.
        </Text>
        <View style={styles.utilityRow}>
          <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressPrivacyPolicy}>
            <Text style={styles.utilityButtonText}>Privacy Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressTerms}>
            <Text style={styles.utilityButtonText}>Terms of Use</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.utilityRow}>
          <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressCommunityGuidelines}>
            <Text style={styles.utilityButtonText}>Community Guidelines</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressCreatorRules}>
            <Text style={styles.utilityButtonText}>Creator Rules</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.utilityRow}>
          <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressCopyright}>
            <Text style={styles.utilityButtonText}>Copyright / DMCA</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.utilityButton} activeOpacity={0.86} onPress={onPressSupport}>
            <Text style={styles.utilityButtonText}>Support</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.secondaryActionButton} activeOpacity={0.86} onPress={onPressAccountDeletion}>
          <Text style={styles.secondaryActionButtonText}>Request Account Deletion</Text>
        </TouchableOpacity>
        <Text style={styles.metaText}>
          If a public legal link is not configured on this build yet, Settings opens the bundled launch policy page or hands off to Chi&apos;llywood Support for account help.
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
