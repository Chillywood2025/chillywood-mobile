import type { User } from "@supabase/supabase-js";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { Json } from "../supabase/database.types";
import { trackEvent } from "./analytics";
import { reportRuntimeError } from "./logger";
import { isClosedBetaEnvironment } from "./runtimeConfig";
import { useSession } from "./session";
import { supabase } from "./supabase";

export const BETA_ACCESS_TABLE = "beta_access_memberships";
export const BETA_FEEDBACK_TABLE = "beta_feedback_items";

export type BetaMembershipStatus = "invited" | "active" | "paused" | "revoked";
export type BetaAccessStatus = "loading" | "signed_out" | "not_invited" | "invited" | "active" | "paused" | "revoked" | "error";
export type BetaFeedbackType = "bug" | "product_feedback" | "onboarding_feedback";
export type BetaFeedbackCategory =
  | "auth"
  | "onboarding"
  | "home"
  | "player"
  | "watch_party"
  | "live_stage"
  | "communication"
  | "monetization"
  | "moderation"
  | "performance"
  | "ui_copy"
  | "other";
export type BetaFeedbackSeverity = "blocking" | "major" | "polish" | "insight";

export type BetaAccessMembership = {
  id: string;
  email: string | null;
  userId: string | null;
  accessStatus: BetaMembershipStatus;
  cohort: string | null;
  notes: string | null;
  invitedBy: string | null;
  invitedAt: string | null;
  activatedAt: string | null;
  lastSeenAt: string | null;
  onboardingAckAt: string | null;
};

export type BetaAccessState = {
  status: BetaAccessStatus;
  membership: BetaAccessMembership | null;
  issue: string | null;
  needsOnboarding: boolean;
};

export type BetaFeedbackInput = {
  feedbackType: BetaFeedbackType;
  category: BetaFeedbackCategory;
  severity: BetaFeedbackSeverity;
  summary: string;
  details?: string;
  routePath?: string | null;
  sourceSurface?: string | null;
  titleId?: string | null;
  roomId?: string | null;
  context?: Record<string, unknown>;
};

type BetaProgramContextValue = {
  accessState: BetaAccessState;
  membership: BetaAccessMembership | null;
  isLoading: boolean;
  isActive: boolean;
  refreshBetaAccess: () => Promise<BetaAccessMembership | null>;
  acknowledgeOnboarding: () => Promise<BetaAccessMembership | null>;
};

type BetaAccessMembershipRow = {
  id?: string | number | null;
  email?: string | null;
  user_id?: string | null;
  access_status?: string | null;
  cohort?: string | null;
  notes?: string | null;
  invited_by?: string | null;
  invited_at?: string | null;
  activated_at?: string | null;
  last_seen_at?: string | null;
  onboarding_ack_at?: string | null;
};

const BetaProgramContext = createContext<BetaProgramContextValue | null>(null);

export const BETA_FEEDBACK_TYPES: BetaFeedbackType[] = [
  "bug",
  "product_feedback",
  "onboarding_feedback",
];

export const BETA_FEEDBACK_CATEGORIES: BetaFeedbackCategory[] = [
  "auth",
  "onboarding",
  "home",
  "player",
  "watch_party",
  "live_stage",
  "communication",
  "monetization",
  "moderation",
  "performance",
  "ui_copy",
  "other",
];

export const BETA_FEEDBACK_SEVERITIES: BetaFeedbackSeverity[] = [
  "blocking",
  "major",
  "polish",
  "insight",
];

const toText = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const toJsonValue = (value: unknown): Json => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJsonValue(entry));
  }

  if (typeof value === "object") {
    const normalized: { [key: string]: Json | undefined } = {};
    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = entry === undefined ? undefined : toJsonValue(entry);
    }
    return normalized;
  }

  return String(value);
};

const normalizeMembershipStatus = (value: unknown): BetaMembershipStatus => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "invited") return "invited";
  if (normalized === "paused") return "paused";
  if (normalized === "revoked") return "revoked";
  return "active";
};

const getSignedOutState = (): BetaAccessState => ({
  status: "signed_out",
  membership: null,
  issue: null,
  needsOnboarding: false,
});

const getSignedInPublicState = (): BetaAccessState => ({
  status: "active",
  membership: null,
  issue: null,
  needsOnboarding: false,
});

const getLoadingState = (membership: BetaAccessMembership | null = null): BetaAccessState => ({
  status: "loading",
  membership,
  issue: null,
  needsOnboarding: false,
});

const resolveMembershipAccessState = (membership: BetaAccessMembership | null): BetaAccessState => {
  if (!membership) {
    return {
      status: "not_invited",
      membership: null,
      issue: null,
      needsOnboarding: false,
    };
  }

  return {
    status: membership.accessStatus,
    membership,
    issue: null,
    needsOnboarding: membership.accessStatus === "active" && !membership.onboardingAckAt,
  };
};

const normalizeMembership = (row: BetaAccessMembershipRow | null | undefined): BetaAccessMembership | null => {
  if (!row || typeof row !== "object") return null;

  const id = toText(row.id);
  if (!id) return null;

  return {
    id,
    email: toText(row.email),
    userId: toText(row.user_id),
    accessStatus: normalizeMembershipStatus(row.access_status),
    cohort: toText(row.cohort),
    notes: toText(row.notes),
    invitedBy: toText(row.invited_by),
    invitedAt: toText(row.invited_at),
    activatedAt: toText(row.activated_at),
    lastSeenAt: toText(row.last_seen_at),
    onboardingAckAt: toText(row.onboarding_ack_at),
  };
};

const deriveReporterDisplayName = (user: User | null) => {
  const metadata = user?.user_metadata as Record<string, unknown> | undefined;
  const directName = toText(metadata?.display_name ?? metadata?.full_name ?? metadata?.name);
  if (directName) return directName;

  const email = String(user?.email ?? "").trim();
  if (email.includes("@")) {
    return email.split("@")[0] || "Chi'llywood User";
  }

  return "Chi'llywood User";
};

export async function activateBetaMembership(): Promise<BetaAccessMembership | null> {
  const { data, error } = await supabase.rpc("activate_beta_membership");
  if (error) throw error;
  return normalizeMembership((data ?? null) as BetaAccessMembershipRow | null);
}

export async function acknowledgeBetaOnboarding(): Promise<BetaAccessMembership | null> {
  const { data, error } = await supabase.rpc("acknowledge_beta_onboarding");
  if (error) throw error;
  return normalizeMembership((data ?? null) as BetaAccessMembershipRow | null);
}

export async function submitBetaFeedback(input: BetaFeedbackInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUser = sessionData.session?.user ?? null;
  const reporterUserId = String(sessionUser?.id ?? "").trim();

  if (!reporterUserId) {
    throw new Error("Sign in is required before you can send feedback.");
  }

  if (isClosedBetaEnvironment()) {
    const membership = await activateBetaMembership();
    if (!membership || membership.accessStatus !== "active") {
      throw new Error("Invite-only access is required before you can send feedback.");
    }
  }

  const summary = String(input.summary ?? "").trim();
  if (!summary) {
    throw new Error("Feedback summary is required.");
  }

  const payload = {
    reporter_user_id: reporterUserId,
    reporter_email: String(sessionUser?.email ?? "").trim() || null,
    reporter_display_name: deriveReporterDisplayName(sessionUser),
    feedback_type: input.feedbackType,
    category: input.category,
    severity: input.severity,
    source_surface: String(input.sourceSurface ?? "").trim() || null,
    route_path: String(input.routePath ?? "").trim() || null,
    title_id: String(input.titleId ?? "").trim() || null,
    room_id: String(input.roomId ?? "").trim() || null,
    summary,
    details: String(input.details ?? "").trim() || null,
    context: toJsonValue(input.context ?? {}),
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(BETA_FEEDBACK_TABLE)
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;

  trackEvent("beta_feedback_submitted", {
    feedbackType: input.feedbackType,
    category: input.category,
    severity: input.severity,
    sourceSurface: payload.source_surface,
  });

  return data;
}

export function getBetaAccessBlockCopy(status: BetaAccessStatus, featureLabel: string) {
  if (!isClosedBetaEnvironment()) {
    return {
      title: "This account can't access this area right now",
      body: `${featureLabel} are unavailable for this account right now. Sign in again or contact support if this looks unexpected.`,
    };
  }

  if (status === "paused") {
    return {
      title: "This beta invite is currently paused",
      body: `${featureLabel} stay limited while this invite is paused. Contact the Chi'llywood beta operator who shared your invite.`,
    };
  }

  if (status === "revoked") {
    return {
      title: "This beta invite is no longer active",
      body: `${featureLabel} are currently unavailable for this account. Contact the Chi'llywood beta operator if this looks unexpected.`,
    };
  }

  if (status === "invited") {
    return {
      title: "Your closed-beta invite is still being prepared",
      body: `${featureLabel} stay behind invite-only access during this closed beta. Sign back in after your invite is confirmed or contact the operator who shared it.`,
    };
  }

  if (status === "error") {
    return {
      title: "Unable to confirm closed-beta access right now",
      body: `Chi'llywood couldn't confirm your tester access for ${featureLabel.toLowerCase()}. Retry in a moment or review the beta support guide.`,
    };
  }

  return {
    title: "This account is not on the closed-beta invite list",
    body: `${featureLabel} stay limited to invited testers during this small closed beta. Use the invited account or contact the Chi'llywood beta operator who shared your invite.`,
  };
}

export function BetaProgramProvider({ children }: { children: React.ReactNode }) {
  const { isLoading: sessionLoading, isSignedIn, user } = useSession();
  const [accessState, setAccessState] = useState<BetaAccessState>(getLoadingState());
  const lastTrackedStatusRef = useRef<string>("");
  const requiresInviteAccess = isClosedBetaEnvironment();

  const refreshBetaAccess = useCallback(async () => {
    if (!isSignedIn || !user) {
      const nextState = getSignedOutState();
      setAccessState(nextState);
      return null;
    }

    if (!requiresInviteAccess) {
      const nextState = getSignedInPublicState();
      setAccessState(nextState);
      return null;
    }

    setAccessState((current) => getLoadingState(current.membership));

    try {
      const membership = await activateBetaMembership();
      setAccessState(resolveMembershipAccessState(membership));
      return membership;
    } catch (error) {
      reportRuntimeError("beta-access-refresh", error, {
        userId: user.id,
      });
      setAccessState({
        status: "error",
        membership: null,
        issue: "Unable to confirm access right now.",
        needsOnboarding: false,
      });
      return null;
    }
  }, [isSignedIn, requiresInviteAccess, user]);

  const acknowledgeOnboarding = useCallback(async () => {
    if (!requiresInviteAccess) {
      const nextState = getSignedInPublicState();
      setAccessState(nextState);
      return null;
    }

    try {
      const membership = await acknowledgeBetaOnboarding();
      const nextState = resolveMembershipAccessState(membership);
      setAccessState(nextState);
      return membership;
    } catch (error) {
      reportRuntimeError("beta-access-acknowledge", error, {
        userId: user?.id ?? null,
      });
      throw error;
    }
  }, [requiresInviteAccess, user?.id]);

  useEffect(() => {
    if (sessionLoading) {
      setAccessState((current) => getLoadingState(current.membership));
      return;
    }

    if (!isSignedIn || !user) {
      setAccessState(getSignedOutState());
      return;
    }

    if (!requiresInviteAccess) {
      setAccessState(getSignedInPublicState());
      return;
    }

    void refreshBetaAccess();
  }, [isSignedIn, refreshBetaAccess, requiresInviteAccess, sessionLoading, user]);

  useEffect(() => {
    if (!requiresInviteAccess) {
      return;
    }

    if (!user || accessState.status === "loading" || accessState.status === "signed_out") {
      return;
    }

    const nextKey = `${user.id}:${accessState.status}`;
    if (lastTrackedStatusRef.current === nextKey) {
      return;
    }

    lastTrackedStatusRef.current = nextKey;

    if (accessState.status === "active") {
      trackEvent("beta_access_granted", {
        cohort: accessState.membership?.cohort ?? null,
      });
      return;
    }

    trackEvent("beta_access_blocked", {
      status: accessState.status,
    });
  }, [accessState.membership?.cohort, accessState.status, requiresInviteAccess, user]);

  const value = useMemo<BetaProgramContextValue>(() => ({
    accessState,
    membership: accessState.membership,
    isLoading: accessState.status === "loading",
    isActive: accessState.status === "active",
    refreshBetaAccess,
    acknowledgeOnboarding,
  }), [accessState, acknowledgeOnboarding, refreshBetaAccess]);

  return React.createElement(BetaProgramContext.Provider, { value }, children);
}

export function useBetaProgram() {
  const context = useContext(BetaProgramContext);
  if (!context) {
    throw new Error("useBetaProgram must be used inside BetaProgramProvider.");
  }
  return context;
}
