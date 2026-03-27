import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { getBetaAccessBlockCopy, submitBetaFeedback, useBetaProgram } from "../../_lib/betaProgram";
import { isClosedBetaEnvironment } from "../../_lib/runtimeConfig";
import { useSession } from "../../_lib/session";
import { BetaFeedbackSheet } from "../beta/beta-feedback-sheet";

const SKYLINE_SOURCE = require("../../assets/images/chicago-skyline.jpg");

const PUBLIC_SUPPORT_FLOWS = [
  "Browse Home, Explore, Title, and Player while signed out.",
  "Sign in, then create or join a watch party and leave cleanly.",
  "Open a communication room, background the app, then reconnect.",
  "Try premium or Party Pass gating and confirm retry works.",
  "Send a safety report and one support feedback item from a signed-in account.",
];

const CLOSED_BETA_FLOWS = [
  "Sign in and confirm invite-only access resolves cleanly.",
  "Home -> Title -> Player with normal playback and return flow.",
  "Watch-party create/join -> room -> live stage -> leave/rejoin.",
  "Communication room create/join with reconnect after backgrounding.",
  "Premium or Party Pass gates, unlock retry, and room re-entry.",
  "Safety reports after sign-in is fully restored for beta accounts.",
];

export function SupportScreen() {
  const router = useRouter();
  const { isSignedIn, user } = useSession();
  const { accessState, isActive } = useBetaProgram();
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const closedBeta = isClosedBetaEnvironment();
  const routePath = closedBeta ? "/beta-support" : "/support";

  const blockedCopy = useMemo(
    () => getBetaAccessBlockCopy(accessState.status, closedBeta ? "Support tools" : "Support"),
    [accessState.status, closedBeta],
  );

  const focusFlows = closedBeta ? CLOSED_BETA_FLOWS : PUBLIC_SUPPORT_FLOWS;

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

      <ScrollView contentContainerStyle={styles.content}>
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
              ? "Keep the beta tight, learn fast, and log the right issues."
              : "Send the right issue with the right context."}
          </Text>
          <Text style={styles.heroBody}>
            {closedBeta
              ? "This closed beta is intentionally small. Use it to verify the most-used flows, capture real friction, and separate must-fix issues from later ideas."
              : "Use this space to report bugs, confusing flows, playback issues, or room problems without losing the screen context you are already in."}
          </Text>
        </View>

        {!isSignedIn ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in to send feedback</Text>
            <Text style={styles.cardBody}>
              {closedBeta
                ? "Support, room access, and structured feedback all depend on a real signed-in tester identity."
                : "Support feedback, room access, and safety reports all depend on a real signed-in Chi'llywood account."}
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
                  ? `You are active in the closed beta${accessState.membership?.cohort ? ` for cohort ${accessState.membership.cohort}` : ""}. Send structured bugs and product feedback from here so issues land in the queue with your tester context.`
                  : "Report broken flows, confusing copy, playback issues, room reliability problems, or launch friction from here so the team can triage them with screen context attached."}
              </Text>
              <TouchableOpacity style={styles.primaryButton} activeOpacity={0.86} onPress={() => setFeedbackVisible(true)}>
                <Text style={styles.primaryButtonText}>Send Feedback</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{closedBeta ? "What to test first" : "Most-used flows to watch"}</Text>
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
            Use `blocking` for broken room entry, dead-end playback, sign-in failures, or crashes. Use `major` when a critical flow works badly but still recovers. Use `polish` for non-blocking roughness. Use `insight` for product learning or unclear copy.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Privacy and capture reminder</Text>
          <Text style={styles.cardBody}>
            Capture protection remains best-effort on supported devices. Do not assume DRM-grade guarantees, and report any misleading copy or unsafe capture behavior through the support flow.
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
    paddingTop: 56,
    paddingBottom: 48,
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
