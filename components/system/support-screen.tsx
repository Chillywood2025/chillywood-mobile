import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  ImageBackground,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getBetaAccessBlockCopy, submitBetaFeedback, useBetaProgram } from "../../_lib/betaProgram";
import { getRuntimeLegalConfig, isClosedBetaEnvironment } from "../../_lib/runtimeConfig";
import { useSession } from "../../_lib/session";
import { BetaFeedbackSheet } from "../beta/beta-feedback-sheet";

const SKYLINE_SOURCE = require("../../assets/images/chicago-skyline.jpg");

const PUBLIC_SUPPORT_FLOWS = [
  "Browse Home, Explore, Title, and Player while signed out.",
  "Sign in, then create or join a watch party and leave cleanly.",
  "Open Chi'lly Chat, start a thread or call handoff, then reconnect cleanly.",
  "Try premium or Party Pass gating and confirm retry works.",
  "Send a safety report and one support feedback item from a signed-in account.",
];

const CLOSED_BETA_FLOWS = [
  "Sign in and confirm invite-only access resolves cleanly.",
  "Home -> Title -> Player with normal playback and return flow.",
  "Watch-party create/join -> room -> live stage -> leave/rejoin.",
  "Chi'lly Chat thread and call handoff with reconnect after backgrounding.",
  "Premium or Party Pass gates, unlock retry, and room re-entry.",
  "Safety reports after sign-in is fully restored for beta accounts.",
];

export function SupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ topic?: string }>();
  const { isSignedIn, user } = useSession();
  const { accessState, isActive } = useBetaProgram();
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const closedBeta = isClosedBetaEnvironment();
  const routePath = closedBeta ? "/beta-support" : "/support";
  const legalConfig = useMemo(() => getRuntimeLegalConfig(), []);
  const topic = String(params.topic ?? "").trim().toLowerCase();

  const blockedCopy = useMemo(
    () => getBetaAccessBlockCopy(accessState.status, closedBeta ? "Support tools" : "Support"),
    [accessState.status, closedBeta],
  );

  const focusFlows = closedBeta ? CLOSED_BETA_FLOWS : PUBLIC_SUPPORT_FLOWS;
  const legalBody = useMemo(() => {
    if (topic === "account-deletion") {
      return legalConfig.accountDeletionUrl
        ? "Open the account deletion request in your browser, or use support from this signed-in account if you need help completing it."
        : "Use this support surface to request permanent account deletion from the signed-in Chi'llywood account. The support team reviews and confirms manual deletion requests until a dedicated deletion portal is published.";
    }

    if (topic === "community-guidelines") {
      return "Review Chi'llywood's launch community and content rules for creator uploads, profiles, Chi'lly Chat, Watch-Party rooms, and Live Stage behavior.";
    }

    if (topic === "copyright") {
      return "Review the copyright and DMCA contact path for creator-upload rights issues, takedown requests, and counter-notices.";
    }

    if (topic === "privacy") {
      return legalConfig.privacyPolicyUrl
        ? "Open the current Privacy Policy in your browser, or use support if you need help reviewing the latest policy for your account."
        : "Use this support surface if you need the current Privacy Policy while the public legal URL is not configured in this build.";
    }

    if (topic === "terms") {
      return legalConfig.termsOfServiceUrl
        ? "Open the current Terms of Use in your browser, or use support if you need help reviewing the latest terms for your account."
        : "Use this support surface if you need the current Terms of Use while the public legal URL is not configured in this build.";
    }

    return "Open the current Privacy Policy, review the Terms of Use, check community and copyright policies, or request account deletion from the same support surface that already owns signed-in feedback and launch help.";
  }, [legalConfig.accountDeletionUrl, legalConfig.privacyPolicyUrl, legalConfig.termsOfServiceUrl, topic]);

  const legalCardTitle = useMemo(() => {
    if (topic === "account-deletion") return "Account deletion help";
    if (topic === "community-guidelines") return "Community guidelines";
    if (topic === "copyright") return "Copyright and DMCA help";
    if (topic === "privacy") return "Privacy help";
    if (topic === "terms") return "Terms help";
    return "Privacy, terms, and account help";
  }, [topic]);

  const primaryLegalAction = topic === "account-deletion"
    ? "account-deletion"
    : topic === "community-guidelines"
      ? "community-guidelines"
      : topic === "copyright"
        ? "copyright"
    : topic === "terms"
      ? "terms"
      : "privacy";

  const openExternalDestination = async (
    url: string,
    label: string,
    fallbackMessage?: string,
  ) => {
    try {
      const isMailto = url.startsWith("mailto:");
      if (!isMailto) {
        const supported = await Linking.canOpenURL(url);
        if (!supported) {
          Alert.alert(label, fallbackMessage ?? `Unable to open ${label.toLowerCase()} right now.`);
          return;
        }
      }

      await Linking.openURL(url);
    } catch {
      Alert.alert(label, fallbackMessage ?? `Unable to open ${label.toLowerCase()} right now.`);
    }
  };

  const onPressPrivacyPolicy = async () => {
    if (legalConfig.privacyPolicyUrl) {
      await openExternalDestination(legalConfig.privacyPolicyUrl, "Privacy Policy");
      return;
    }

    router.push("/privacy");
  };

  const onPressTerms = async () => {
    if (legalConfig.termsOfServiceUrl) {
      await openExternalDestination(legalConfig.termsOfServiceUrl, "Terms of Use");
      return;
    }

    router.push("/terms");
  };

  const onPressCommunityGuidelines = () => {
    router.push("/community-guidelines" as Parameters<typeof router.push>[0]);
  };

  const onPressCopyright = () => {
    router.push("/copyright" as Parameters<typeof router.push>[0]);
  };

  const onPressAccountDeletion = () => {
    if (legalConfig.accountDeletionUrl) {
      void openExternalDestination(legalConfig.accountDeletionUrl, "Account Deletion");
      return;
    }

    if (!isSignedIn) {
      router.push({ pathname: "/(auth)/login", params: { redirectTo: `${routePath}?topic=account-deletion` } });
      return;
    }

    Alert.alert(
      "Request Account Deletion",
      "Use Send Feedback from this screen to request permanent account deletion from your signed-in Chi'llywood account. The support team verifies and processes manual deletion requests.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Continue", onPress: () => setFeedbackVisible(true) },
      ],
    );
  };

  const onPressSupportEmail = async () => {
    if (!legalConfig.supportEmail) {
      return;
    }

    await openExternalDestination(
      `mailto:${legalConfig.supportEmail}`,
      "Support Email",
      `No email compose app is available right now. Contact Chi'llywood Support at ${legalConfig.supportEmail}.`,
    );
  };

  const onSubmitFeedback = async (input: {
    feedbackType: "bug" | "product_feedback" | "onboarding_feedback";
    category: "auth" | "onboarding" | "home" | "player" | "watch_party" | "live_stage" | "communication" | "monetization" | "moderation" | "performance" | "ui_copy" | "other";
    severity: "blocking" | "major" | "polish" | "insight";
    summary: string;
    details: string;
  }) => {
    setFeedbackBusy(true);

    try {
      await submitBetaFeedback({
        feedbackType: input.feedbackType,
        category: input.category,
        severity: input.severity,
        summary: input.summary,
        details: input.details,
        routePath,
        sourceSurface: closedBeta ? "beta-support" : "support",
        context: {
          betaAccessStatus: accessState.status,
          cohort: accessState.membership?.cohort ?? null,
          environment: closedBeta ? "closed-beta" : "public-v1",
        },
      });
      setFeedbackVisible(false);
      Alert.alert("Feedback sent", "Thanks. This went into the Chi'llywood support queue.");
    } catch (error) {
      Alert.alert("Unable to send feedback", error instanceof Error ? error.message : "Try again in a moment.");
    } finally {
      setFeedbackBusy(false);
    }
  };

  return (
    <ImageBackground source={SKYLINE_SOURCE} style={styles.background} resizeMode="cover">
      <View style={styles.overlay} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top + 16, 24),
            paddingBottom: Math.max(insets.bottom + 48, 48),
          },
        ]}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>
            {closedBeta ? "CHI'LLYWOOD · CLOSED BETA" : "CHI'LLYWOOD · SUPPORT"}
          </Text>
          <View style={{ width: 18 }} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>{closedBeta ? "BETA SUPPORT" : "SUPPORT & FEEDBACK"}</Text>
          <Text style={styles.heroTitle}>
            {closedBeta
              ? "Keep the beta sharp and send the issue that matters."
              : "Report the issue without losing your place."}
          </Text>
          <Text style={styles.heroBody}>
            {closedBeta
              ? "This beta stays intentionally small. Focus on the real flows, capture the friction, and separate must-fix problems from later ideas."
              : "Use this space for bugs, confusing copy, playback issues, room problems, and launch friction without dropping the screen context you are already in."}
          </Text>
        </View>

        {!isSignedIn ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in to send feedback</Text>
            <Text style={styles.cardBody}>
              {closedBeta
                ? "Support, room access, and structured feedback all depend on a real signed-in tester identity."
                : "Support feedback, room access, and safety reports all depend on a real signed-in Chi&apos;llywood account."}
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.86}
              onPress={() => router.push({ pathname: "/(auth)/login", params: { redirectTo: routePath } })}
            >
              <Text style={styles.primaryButtonText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : closedBeta && !isActive ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{blockedCopy.title}</Text>
            <Text style={styles.cardBody}>{blockedCopy.body}</Text>
            <Text style={styles.metaText}>Signed-in account: {user?.email ?? "Unknown email"}</Text>
            <Text style={styles.metaText}>
              If this account should be invited, ask the Chi&apos;llywood operator to add or reactivate it in the beta membership table.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{closedBeta ? "Current tester status" : "Send support feedback"}</Text>
              <Text style={styles.cardBody}>
                {closedBeta
                  ? `You are active in the closed beta${accessState.membership?.cohort ? ` for cohort ${accessState.membership.cohort}` : ""}. Send structured bugs and product feedback from here so they land with your tester context.`
                  : "Report broken flows, confusing copy, playback issues, room reliability problems, or launch friction from here so the team can triage them with screen context attached."}
              </Text>
              <TouchableOpacity style={styles.primaryButton} activeOpacity={0.86} onPress={() => setFeedbackVisible(true)}>
                <Text style={styles.primaryButtonText}>Send Feedback</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{closedBeta ? "What to test first" : "Priority flows to watch"}</Text>
              <View style={styles.list}>
                {focusFlows.map((item) => (
                  <Text key={item} style={styles.listItem}>• {item}</Text>
                ))}
              </View>
            </View>
          </>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How issues are triaged</Text>
          <Text style={styles.cardBody}>
            Use `blocking` for broken entry, dead-end playback, sign-in failures, or crashes. Use `major` when a key flow still recovers but feels bad. Use `polish` for non-blocking roughness. Use `insight` for product learning or unclear copy.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{legalCardTitle}</Text>
          <Text style={styles.cardBody}>{legalBody}</Text>
          <View style={styles.list}>
            <TouchableOpacity
              style={primaryLegalAction === "privacy" ? styles.primaryButton : styles.secondaryButton}
              activeOpacity={0.86}
              onPress={() => { void onPressPrivacyPolicy(); }}
            >
              <Text style={primaryLegalAction === "privacy" ? styles.primaryButtonText : styles.secondaryButtonText}>Privacy Policy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={primaryLegalAction === "terms" ? styles.primaryButton : styles.secondaryButton}
              activeOpacity={0.86}
              onPress={() => { void onPressTerms(); }}
            >
              <Text style={primaryLegalAction === "terms" ? styles.primaryButtonText : styles.secondaryButtonText}>Terms of Use</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={primaryLegalAction === "account-deletion" ? styles.primaryButton : styles.secondaryButton}
              activeOpacity={0.86}
              onPress={onPressAccountDeletion}
            >
              <Text style={primaryLegalAction === "account-deletion" ? styles.primaryButtonText : styles.secondaryButtonText}>
                Request Account Deletion
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={primaryLegalAction === "community-guidelines" ? styles.primaryButton : styles.secondaryButton}
              activeOpacity={0.86}
              onPress={onPressCommunityGuidelines}
            >
              <Text style={primaryLegalAction === "community-guidelines" ? styles.primaryButtonText : styles.secondaryButtonText}>
                Community Guidelines
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={primaryLegalAction === "copyright" ? styles.primaryButton : styles.secondaryButton}
              activeOpacity={0.86}
              onPress={onPressCopyright}
            >
              <Text style={primaryLegalAction === "copyright" ? styles.primaryButtonText : styles.secondaryButtonText}>
                Copyright / DMCA
              </Text>
            </TouchableOpacity>
          </View>
          {legalConfig.supportEmail ? (
            <TouchableOpacity activeOpacity={0.86} onPress={() => { void onPressSupportEmail(); }}>
              <Text style={styles.metaText}>Support contact: {legalConfig.supportEmail}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Capture reminder</Text>
          <Text style={styles.cardBody}>
            Capture protection stays best-effort on supported devices. Do not assume DRM-grade guarantees, and report any misleading copy or unsafe capture behavior through support.
          </Text>
        </View>
      </ScrollView>

      <BetaFeedbackSheet
        visible={feedbackVisible}
        title="Send support feedback"
        description="Log a bug, onboarding issue, or product note so the team can triage it without losing the current screen context."
        busy={feedbackBusy}
        onSubmit={onSubmitFeedback}
        onClose={() => setFeedbackVisible(false)}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: "#06070B",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7,10,16,0.74)",
  },
  content: {
    paddingHorizontal: 18,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backArrow: {
    color: "#C8D0E2",
    fontSize: 20,
    fontWeight: "700",
    paddingRight: 8,
  },
  kicker: {
    color: "#7B869E",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,13,19,0.96)",
    padding: 20,
    gap: 10,
  },
  heroKicker: {
    color: "#8B95AC",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: "#F4F7FC",
    fontSize: 27,
    fontWeight: "900",
    lineHeight: 32,
  },
  heroBody: {
    color: "#ADB6CB",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(15,16,22,0.94)",
    padding: 18,
    gap: 10,
  },
  cardTitle: {
    color: "#F4F7FC",
    fontSize: 18,
    fontWeight: "800",
  },
  cardBody: {
    color: "#B6BFCE",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  metaText: {
    color: "#8D97AE",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: "#E9EDF7",
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#0A0C12",
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryButton: {
    marginTop: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingVertical: 13,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#E9EDF7",
    fontSize: 13,
    fontWeight: "900",
  },
  list: {
    gap: 8,
  },
  listItem: {
    color: "#D7DFEF",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
});
