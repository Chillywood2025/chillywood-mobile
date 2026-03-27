import { usePathname } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { trackEvent } from "../../_lib/analytics";
import { submitBetaFeedback, useBetaProgram } from "../../_lib/betaProgram";
import { reportRuntimeError } from "../../_lib/logger";
import { useSession } from "../../_lib/session";
import { BetaFeedbackSheet } from "../beta/beta-feedback-sheet";

type RootErrorBoundaryState = {
  error: Error | null;
};

export class RootErrorBoundary extends React.Component<React.PropsWithChildren, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    reportRuntimeError("root-boundary", error, {
      componentStack: errorInfo.componentStack,
    });
    trackEvent("fatal_boundary_hit", {
      message: error.message,
    });
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return <RootBoundaryFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />;
  }
}

function RootBoundaryFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const pathname = usePathname();
  const { isSignedIn } = useSession();
  const { accessState, isActive } = useBetaProgram();
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  const canSendFeedback = isSignedIn && isActive;

  const onSubmitFeedback = async (input: {
    feedbackType: "bug" | "product_feedback" | "onboarding_feedback";
    category: "auth" | "onboarding" | "home" | "player" | "watch_party" | "live_stage" | "communication" | "monetization" | "moderation" | "performance" | "ui_copy" | "other";
    severity: "blocking" | "major" | "polish" | "insight";
    summary: string;
    details: string;
  }) => {
    setReportBusy(true);

    try {
      await submitBetaFeedback({
        feedbackType: input.feedbackType,
        category: input.category,
        severity: input.severity,
        summary: input.summary,
        details: input.details,
        routePath: pathname,
        sourceSurface: "root-boundary",
        context: {
          errorName: error.name,
          errorMessage: error.message,
          betaAccessStatus: accessState.status,
        },
      });
      setReportVisible(false);
    } catch (submitError) {
      reportRuntimeError("root-boundary-feedback", submitError, {
        routePath: pathname,
      });
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <View style={styles.outer}>
      <View style={styles.card}>
        <Text style={styles.kicker}>RECOVERABLE APP ERROR</Text>
        <Text style={styles.title}>Chi&apos;llywood hit a runtime issue.</Text>
        <Text style={styles.body}>
          Retry the app shell, or send this issue to support so the team can investigate with route context attached.
        </Text>
        <TouchableOpacity style={styles.button} activeOpacity={0.86} onPress={onRetry}>
          <Text style={styles.buttonText}>Retry App Shell</Text>
        </TouchableOpacity>
        {canSendFeedback ? (
          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.82} onPress={() => setReportVisible(true)}>
            <Text style={styles.secondaryButtonText}>Report This Crash</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.helperText}>
            Sign in to send crash feedback from inside the app.
          </Text>
        )}
      </View>

      <BetaFeedbackSheet
        visible={reportVisible}
        title="Report runtime issue"
        description="Send this crash or runtime issue to Chi'llywood support with the current route context attached."
        busy={reportBusy}
        defaultFeedbackType="bug"
        defaultCategory="other"
        defaultSeverity="major"
        defaultSummary={`Runtime issue: ${error.message}`}
        onSubmit={onSubmitFeedback}
        onClose={() => setReportVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: "#06070B",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(14,15,20,0.96)",
    padding: 22,
    gap: 12,
  },
  kicker: {
    color: "#7A859D",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: "#F4F7FC",
    fontSize: 24,
    fontWeight: "900",
  },
  body: {
    color: "#A6B0C6",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  button: {
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: "#DC143C",
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#C8D0E2",
    fontSize: 13,
    fontWeight: "800",
  },
  helperText: {
    color: "#8F99B1",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
});
