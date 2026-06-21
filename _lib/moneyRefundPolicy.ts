export type MoneyRefundPolicyKey =
  | "premium_subscription"
  | "creator_tip"
  | "paid_creator_video"
  | "watch_party_ticket"
  | "live_watch_party_access_pass"
  | "live_watch_party_seat_pass"
  | "channel_subscription"
  | "vip_pass"
  | "event_pass"
  | "merch_physical_good"
  | "payout_readiness";

export type RefundRemedyType =
  | "none"
  | "cash_refund_review"
  | "in_app_credit_review"
  | "provider_refund_required"
  | "admin_review_required";

export type MoneyConsumptionState =
  | "not_started"
  | "access_granted"
  | "entered_room"
  | "attended_event"
  | "playback_started"
  | "seat_review_pending"
  | "seat_approved"
  | "fulfilled"
  | "shipped"
  | "consumed";

export type CreatorObligationState =
  | "not_applicable"
  | "pending"
  | "met"
  | "failed"
  | "review_required"
  | "waived_by_policy";

export type PayoutHoldState =
  | "not_applicable"
  | "hold_required"
  | "held"
  | "eligible_later"
  | "blocked"
  | "released_later";

export type MoneyRefundPolicy = {
  key: MoneyRefundPolicyKey;
  title: string;
  policySummary: string;
  defaultRemedy: RefundRemedyType;
  eligibleBeforeUse: readonly MoneyConsumptionState[];
  noStandardRefundAfter: readonly MoneyConsumptionState[];
  creatorObligationRequired: boolean;
  payoutHoldRequired: boolean;
  providerActionRequired: boolean;
  creditFirst: boolean;
  userCopy: string;
  creatorCopy: string;
  adminCopy: string;
};

export type MoneyRefundPolicyDecisionInput = {
  key: MoneyRefundPolicyKey;
  consumptionState?: MoneyConsumptionState;
  creatorObligationState?: CreatorObligationState;
  platformFault?: boolean;
  providerOrLegalRequired?: boolean;
};

export type MoneyRefundPolicyDecision = {
  key: MoneyRefundPolicyKey;
  refundEligibility: boolean;
  creditEligibility: boolean;
  cashRefundEligibility: boolean;
  providerActionRequired: boolean;
  adminReviewRequired: boolean;
  creatorPayoutHoldRequired: boolean;
  payoutHoldState: PayoutHoldState;
  reasonCodes: string[];
  userFacingExplanation: string;
  creatorFacingExplanation: string;
  adminFacingExplanation: string;
};

export const REFUND_CREDIT_PAYOUT_HOLD_COPY = {
  refundReviewRequired: "Refund review required",
  creatorCreditMaybe: "Credit may be issued if creator obligations are not met.",
  noStandardRefundAfterUse: "No standard refunds after access is used.",
  tipsUnlockNothing: "Tips unlock nothing and are generally non-refundable.",
  payoutHeld: "Payout held until obligation and refund window clear.",
  creditsInactive: "Credits are not cash, not withdrawable, and not active until approved.",
} as const;

export const MONEY_REFUND_POLICY_KEYS: readonly MoneyRefundPolicyKey[] = [
  "premium_subscription",
  "creator_tip",
  "paid_creator_video",
  "watch_party_ticket",
  "live_watch_party_access_pass",
  "live_watch_party_seat_pass",
  "channel_subscription",
  "vip_pass",
  "event_pass",
  "merch_physical_good",
  "payout_readiness",
];

export const MONEY_REFUND_POLICIES: Record<MoneyRefundPolicyKey, MoneyRefundPolicy> = {
  premium_subscription: {
    key: "premium_subscription",
    title: "Chi'llywood Premium",
    policySummary: "Generally non-refundable after purchase/renewal except law, store/provider/admin decision, fraud, duplicate charge, unauthorized purchase, or platform technical failure.",
    defaultRemedy: "admin_review_required",
    eligibleBeforeUse: ["not_started"],
    noStandardRefundAfter: ["consumed"],
    creatorObligationRequired: false,
    payoutHoldRequired: false,
    providerActionRequired: true,
    creditFirst: false,
    userCopy: "Premium is app-wide platform access and is not creator income.",
    creatorCopy: "Premium does not create a creator payout hold.",
    adminCopy: "Provider/store/legal/admin exceptions require review; no creator payout hold is needed.",
  },
  creator_tip: {
    key: "creator_tip",
    title: "Creator Tip",
    policySummary: "No standard refunds. Exceptions include fraud, duplicate charge, unauthorized purchase, provider/legal/admin decision, or platform/creator abuse.",
    defaultRemedy: "admin_review_required",
    eligibleBeforeUse: ["not_started"],
    noStandardRefundAfter: ["consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: false,
    userCopy: REFUND_CREDIT_PAYOUT_HOLD_COPY.tipsUnlockNothing,
    creatorCopy: "Creator payout stays held until fraud, chargeback, and reversal windows clear.",
    adminCopy: "Tips remain support only. Any exception needs provider/admin/legal review.",
  },
  paid_creator_video: {
    key: "paid_creator_video",
    title: "Paid Creator Video",
    policySummary: "Refund or credit review when access never worked, content is removed before meaningful use, or admin finds misrepresentation.",
    defaultRemedy: "cash_refund_review",
    eligibleBeforeUse: ["not_started", "access_granted"],
    noStandardRefundAfter: ["playback_started", "consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: false,
    userCopy: "Access is scoped to this one paid creator video.",
    creatorCopy: "Creator payout is held until access delivery and the refund-risk window clear.",
    adminCopy: "Do not treat playback-started/consumed access as standard refundable unless platform/provider/admin review requires it.",
  },
  watch_party_ticket: {
    key: "watch_party_ticket",
    title: "Watch-Party Ticket",
    policySummary: "Refund eligible before room entry/use when the room is canceled, unavailable, or platform fault blocks access.",
    defaultRemedy: "cash_refund_review",
    eligibleBeforeUse: ["not_started", "access_granted"],
    noStandardRefundAfter: ["entered_room", "consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: false,
    userCopy: "Ticket access is for one room target only.",
    creatorCopy: "Creator payout is held until the room obligation and refund window clear.",
    adminCopy: "Ticket grants entry only; it does not grant host, speaker, moderator, admin, or LiveKit publish authority.",
  },
  live_watch_party_access_pass: {
    key: "live_watch_party_access_pass",
    title: "Live Watch-Party Access Pass",
    policySummary: "Refund eligible if access never worked or the live target canceled before entry.",
    defaultRemedy: "cash_refund_review",
    eligibleBeforeUse: ["not_started", "access_granted"],
    noStandardRefundAfter: ["entered_room", "consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: false,
    userCopy: "This is viewer/listener access only.",
    creatorCopy: "Creator payout is held until access/session obligations clear.",
    adminCopy: "Access pass does not grant speaker, host, moderator, admin, or camera/mic publish authority.",
  },
  live_watch_party_seat_pass: {
    key: "live_watch_party_seat_pass",
    title: "Live Watch-Party Seat Pass",
    policySummary: "Refund or credit review if seat opportunity is never provided or host never reviews/approves within the policy window.",
    defaultRemedy: "in_app_credit_review",
    eligibleBeforeUse: ["seat_review_pending"],
    noStandardRefundAfter: ["seat_approved", "consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: true,
    userCopy: "Seat pass grants eligibility only; host approval and LiveKit token rules still win.",
    creatorCopy: "Creator payout is held until seat obligation outcome is known.",
    adminCopy: "Do not mark seat pass consumed/refundable solely from payment; moderation removals can block standard refund.",
  },
  channel_subscription: {
    key: "channel_subscription",
    title: "Channel Subscription",
    policySummary: "Credit-first remedy when creator obligations are not met during the paid period.",
    defaultRemedy: "in_app_credit_review",
    eligibleBeforeUse: ["not_started", "access_granted"],
    noStandardRefundAfter: ["consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: true,
    userCopy: "Subscription is creator-specific and is not Chi'llywood Premium.",
    creatorCopy: "Creator payout is held until the creator obligation window clears.",
    adminCopy: "Cash refund only if law, store/provider, or admin decision requires it.",
  },
  vip_pass: {
    key: "vip_pass",
    title: "VIP Pass",
    policySummary: "Credit/refund review eligible if creator deactivates/removes VIP access early, misrepresents VIP, or admin finds obligation failure.",
    defaultRemedy: "in_app_credit_review",
    eligibleBeforeUse: ["not_started", "access_granted"],
    noStandardRefundAfter: ["consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: true,
    userCopy: "VIP is creator-specific and separate from Premium and subscription.",
    creatorCopy: "Creator payout is held until VIP obligation period/risk window clears.",
    adminCopy: "No standard refund after valid access period/use unless platform/admin/legal/provider decision requires it.",
  },
  event_pass: {
    key: "event_pass",
    title: "Event Pass",
    policySummary: "Refund eligible if event is canceled, materially changed, unavailable, or buyer has not entered/attended before cutoff.",
    defaultRemedy: "cash_refund_review",
    eligibleBeforeUse: ["not_started", "access_granted"],
    noStandardRefundAfter: ["attended_event", "consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: false,
    userCopy: "Event pass unlocks this one event only.",
    creatorCopy: "Creator payout is held until event completion plus review/refund window.",
    adminCopy: "Canceled, ended, expired, refunded, or revoked events should deny access clearly.",
  },
  merch_physical_good: {
    key: "merch_physical_good",
    title: "Physical Merch",
    policySummary: "Refund/return to original payment method under merch return policy when not shipped, defective, not delivered, canceled, or eligible return.",
    defaultRemedy: "provider_refund_required",
    eligibleBeforeUse: ["not_started", "fulfilled"],
    noStandardRefundAfter: ["shipped", "consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: false,
    userCopy: "Merch is a physical product only and unlocks no digital access.",
    creatorCopy: "Creator settlement is held until fulfillment and return/refund windows clear.",
    adminCopy: "Stripe/merch provider is separate from Android digital goods.",
  },
  payout_readiness: {
    key: "payout_readiness",
    title: "Payout Readiness",
    policySummary: "Setup/status only. Refund/credit rules must not make money payable while live money is off.",
    defaultRemedy: "none",
    eligibleBeforeUse: [],
    noStandardRefundAfter: ["consumed"],
    creatorObligationRequired: false,
    payoutHoldRequired: false,
    providerActionRequired: false,
    creditFirst: false,
    userCopy: "No cash-out, withdrawal, payable balance, or real payout is active.",
    creatorCopy: "Payout setup/status does not make creator money payable.",
    adminCopy: "Refund/credit rules must not activate payout release.",
  },
};

const usedStates = new Set<MoneyConsumptionState>([
  "entered_room",
  "attended_event",
  "playback_started",
  "seat_approved",
  "shipped",
  "consumed",
]);

export function resolveMoneyRefundPolicyDecision(input: MoneyRefundPolicyDecisionInput): MoneyRefundPolicyDecision {
  const policy = MONEY_REFUND_POLICIES[input.key];
  const consumptionState = input.consumptionState ?? "not_started";
  const obligationState = input.creatorObligationState ?? "not_applicable";
  const platformFault = input.platformFault === true;
  const providerOrLegalRequired = input.providerOrLegalRequired === true;
  const reasonCodes: string[] = [];

  let refundEligibility = false;
  let creditEligibility = false;
  let cashRefundEligibility = false;
  let providerActionRequired = false;
  let adminReviewRequired = policy.defaultRemedy !== "none";
  let payoutHoldState: PayoutHoldState = policy.payoutHoldRequired ? "hold_required" : "not_applicable";

  if (input.key === "payout_readiness") {
    reasonCodes.push("setup_status_only", "cashout_withdrawal_payout_inactive");
    return {
      key: input.key,
      refundEligibility: false,
      creditEligibility: false,
      cashRefundEligibility: false,
      providerActionRequired: false,
      adminReviewRequired: false,
      creatorPayoutHoldRequired: false,
      payoutHoldState: "not_applicable",
      reasonCodes,
      userFacingExplanation: policy.userCopy,
      creatorFacingExplanation: policy.creatorCopy,
      adminFacingExplanation: policy.adminCopy,
    };
  }

  if (platformFault || providerOrLegalRequired || obligationState === "failed" || obligationState === "review_required") {
    refundEligibility = policy.defaultRemedy !== "none";
    creditEligibility = policy.creditFirst || policy.defaultRemedy === "in_app_credit_review";
    cashRefundEligibility = !policy.creditFirst && policy.defaultRemedy !== "none";
    providerActionRequired = policy.providerActionRequired && (providerOrLegalRequired || cashRefundEligibility);
    reasonCodes.push(platformFault ? "platform_fault_review" : "provider_legal_admin_or_obligation_review");
  } else if (policy.eligibleBeforeUse.includes(consumptionState)) {
    refundEligibility = policy.defaultRemedy !== "none";
    creditEligibility = policy.creditFirst || policy.defaultRemedy === "in_app_credit_review";
    cashRefundEligibility = !policy.creditFirst && policy.defaultRemedy !== "none";
    providerActionRequired = policy.providerActionRequired && cashRefundEligibility;
    reasonCodes.push("eligible_before_meaningful_use");
  } else if (usedStates.has(consumptionState) || policy.noStandardRefundAfter.includes(consumptionState)) {
    refundEligibility = false;
    creditEligibility = false;
    cashRefundEligibility = false;
    providerActionRequired = false;
    reasonCodes.push("no_standard_refund_after_use");
  } else {
    refundEligibility = policy.defaultRemedy !== "none" && consumptionState === "not_started";
    creditEligibility = refundEligibility && policy.creditFirst;
    cashRefundEligibility = refundEligibility && !policy.creditFirst;
    providerActionRequired = refundEligibility && policy.providerActionRequired && cashRefundEligibility;
    reasonCodes.push(refundEligibility ? "eligible_before_use" : "admin_review_required");
  }

  if (policy.payoutHoldRequired) {
    payoutHoldState = obligationState === "failed" || obligationState === "review_required" ? "blocked" : "hold_required";
    reasonCodes.push("creator_payout_hold_required");
  }

  if (input.key === "creator_tip") {
    reasonCodes.push("tips_unlock_nothing", "tips_no_standard_refunds");
  }
  if (input.key === "live_watch_party_seat_pass") {
    reasonCodes.push("seat_eligibility_only", "host_approval_still_wins", "livekit_authority_rules_still_win");
  }

  return {
    key: input.key,
    refundEligibility,
    creditEligibility,
    cashRefundEligibility,
    providerActionRequired,
    adminReviewRequired,
    creatorPayoutHoldRequired: policy.payoutHoldRequired,
    payoutHoldState,
    reasonCodes,
    userFacingExplanation: refundEligibility || creditEligibility
      ? "This may qualify for review. No refund or credit is automatic, and provider/admin review may be required."
      : policy.userCopy,
    creatorFacingExplanation: policy.creatorCopy,
    adminFacingExplanation: policy.adminCopy,
  };
}

export function resolveCreatorPayoutHoldPolicy(input: {
  key: MoneyRefundPolicyKey;
  creatorObligationState?: CreatorObligationState;
  refundWindowCleared?: boolean;
  chargebackWindowCleared?: boolean;
  payoutsEnabled?: boolean;
  liveMoneyEnabled?: boolean;
}) {
  const policy = MONEY_REFUND_POLICIES[input.key];
  const obligationState = input.creatorObligationState ?? "pending";
  if (!policy.payoutHoldRequired) {
    return {
      payoutHoldState: "not_applicable" as PayoutHoldState,
      canReleasePayoutNow: false,
      reasonCodes: ["no_creator_payout_hold_needed"],
    };
  }
  if (obligationState === "failed" || obligationState === "review_required") {
    return {
      payoutHoldState: "blocked" as PayoutHoldState,
      canReleasePayoutNow: false,
      reasonCodes: ["creator_obligation_not_cleared"],
    };
  }
  if (!input.refundWindowCleared || !input.chargebackWindowCleared) {
    return {
      payoutHoldState: "held" as PayoutHoldState,
      canReleasePayoutNow: false,
      reasonCodes: ["refund_or_chargeback_window_open"],
    };
  }
  if (!input.payoutsEnabled || !input.liveMoneyEnabled) {
    return {
      payoutHoldState: "eligible_later" as PayoutHoldState,
      canReleasePayoutNow: false,
      reasonCodes: ["payouts_or_live_money_disabled"],
    };
  }
  return {
    payoutHoldState: "released_later" as PayoutHoldState,
    canReleasePayoutNow: false,
    reasonCodes: ["future_release_requires_separate_approval_and_evidence"],
  };
}
