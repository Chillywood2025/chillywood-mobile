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
  standardRefundReviewEligible: boolean;
  authoritativeReversalRequired: boolean;
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
  refundReviewRequired: "Standard remedy review required",
  creatorCreditMaybe: "Credit may be issued if creator obligations are not met.",
  noStandardRefundAfterUse: "No standard refunds after access is used.",
  tipsUnlockNothing: "Tips unlock nothing and are final and non-refundable through Chi'llywood.",
  payoutHeld: "Pending earnings are not payout-ready until server-owned settlement and risk holds clear.",
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
    policySummary: "Chi'llywood provides no standard refunds for Premium purchases or renewals. Canceling stops future renewal; authoritative store, provider, legal, fraud, duplicate-charge, or unauthorized-purchase reversals still reconcile.",
    defaultRemedy: "none",
    eligibleBeforeUse: [],
    noStandardRefundAfter: ["consumed"],
    creatorObligationRequired: false,
    payoutHoldRequired: false,
    providerActionRequired: true,
    creditFirst: false,
    userCopy: "Premium is app-wide access, not creator income. Canceling stops future renewal and is not a refund; paid-through access follows authoritative provider status.",
    creatorCopy: "Premium does not create a creator payout hold.",
    adminCopy: "There is no ordinary Chi'llywood Premium refund path. Reconcile authoritative provider/store/legal reversals without creating creator earnings or payout holds.",
  },
  creator_tip: {
    key: "creator_tip",
    title: "Creator Tip",
    policySummary: "No standard refunds. Exceptions include fraud, duplicate charge, unauthorized purchase, provider/legal/admin decision, or platform/creator abuse.",
    defaultRemedy: "none",
    eligibleBeforeUse: [],
    noStandardRefundAfter: ["consumed"],
    creatorObligationRequired: false,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: false,
    userCopy: REFUND_CREDIT_PAYOUT_HOLD_COPY.tipsUnlockNothing,
    creatorCopy: "Tip earnings begin Pending, clear a server-owned 7-day settlement hold, and remain subject to reserve and later provider reversal adjustments.",
    adminCopy: "Tips have no standard Chi'llywood refund. Reconcile authoritative fraud, duplicate, unauthorized, chargeback, provider, and legal reversals exactly once.",
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
    creatorCopy: "Direct-purchase earnings begin Pending and use the server-owned 7-day settlement hold; subscription-included views create no Paid Video earnings.",
    adminCopy: "Do not treat playback-started/consumed access as standard refundable unless platform/provider/admin review requires it.",
  },
  watch_party_ticket: {
    key: "watch_party_ticket",
    title: "Party Room Pass",
    policySummary: "Refund eligible before room entry/use when the room is canceled, unavailable, or platform fault blocks access.",
    defaultRemedy: "cash_refund_review",
    eligibleBeforeUse: ["not_started", "access_granted"],
    noStandardRefundAfter: ["entered_room", "consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: false,
    userCopy: "Party Room Pass entry is for one exact Party Room target only.",
    creatorCopy: "Earnings remain Pending until successful canonical room completion plus 48 hours; advance purchases are not withdrawable.",
    adminCopy: "Party Room Pass grants entry only; it does not grant Live Stage, host, speaker, moderator, admin, or LiveKit publish authority.",
  },
  live_watch_party_access_pass: {
    key: "live_watch_party_access_pass",
    title: "Live Stage Pass",
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
    title: "Live Stage Seat Pass",
    policySummary: "Refund or credit review if seat opportunity is never provided or host never reviews/approves within the policy window.",
    defaultRemedy: "in_app_credit_review",
    eligibleBeforeUse: ["seat_review_pending"],
    noStandardRefundAfter: ["seat_approved", "consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: true,
    userCopy: "A Live Stage Seat Pass grants eligibility only; host approval and LiveKit token rules still win.",
    creatorCopy: "Creator payout is held until seat obligation outcome is known.",
    adminCopy: "Do not mark a Live Stage Seat Pass consumed/refundable solely from payment; moderation removals can block standard refund.",
  },
  channel_subscription: {
    key: "channel_subscription",
    title: "Platform Subscription",
    policySummary: "Cancel anytime to stop future renewal. Paid-through access continues unless authoritative provider state ends it; there is no standard prorated refund for an already-started period.",
    defaultRemedy: "cash_refund_review",
    eligibleBeforeUse: ["not_started", "access_granted"],
    noStandardRefundAfter: ["consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: false,
    userCopy: "This recurring subscription is creator-specific. Canceling stops future renewal, not the current paid period, and VIP-only content is excluded.",
    creatorCopy: "Each verified billing period has its own server-owned 7-day settlement hold; included Paid Video views create no extra earnings.",
    adminCopy: "No standard prorated refund for a started period. Backed-access failure may enter remedy review; authoritative provider/store/legal reversals always reconcile.",
  },
  vip_pass: {
    key: "vip_pass",
    title: "VIP Pass",
    policySummary: "VIP provides 30 days of exact-creator access. There is no standard refund after valid access is delivered; failed delivery, early removal, or material misrepresentation may be reviewed.",
    defaultRemedy: "cash_refund_review",
    eligibleBeforeUse: ["not_started", "access_granted"],
    noStandardRefundAfter: ["consumed"],
    creatorObligationRequired: true,
    payoutHoldRequired: true,
    providerActionRequired: true,
    creditFirst: false,
    userCopy: "VIP is a creator-specific 30-day pass; verified refund or revocation ends access independently of Premium and subscriptions.",
    creatorCopy: "VIP access lasts 30 days, while creator earnings use a separate server-owned 7-day settlement hold and reserve rules.",
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
    userCopy: "An Event Pass unlocks this one exact Event only.",
    creatorCopy: "Earnings remain Pending until successful canonical event completion plus 48 hours; advance purchases are not withdrawable.",
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
    adminCopy: "Stripe/merch provider is separate from in-app digital goods billing.",
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
      standardRefundReviewEligible: false,
      authoritativeReversalRequired: false,
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

  if (providerOrLegalRequired) {
    providerActionRequired = policy.providerActionRequired;
    adminReviewRequired = true;
    reasonCodes.push("authoritative_provider_or_legal_reversal");
  } else if (platformFault || obligationState === "failed" || obligationState === "review_required") {
    refundEligibility = policy.defaultRemedy !== "none";
    creditEligibility = policy.creditFirst || policy.defaultRemedy === "in_app_credit_review";
    cashRefundEligibility = !policy.creditFirst && policy.defaultRemedy !== "none";
    providerActionRequired = policy.providerActionRequired && cashRefundEligibility;
    reasonCodes.push(platformFault ? "platform_fault_review" : "creator_obligation_review");
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
    standardRefundReviewEligible: refundEligibility,
    authoritativeReversalRequired: providerOrLegalRequired && providerActionRequired,
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
  return {
    payoutHoldState: "held" as PayoutHoldState,
    canReleasePayoutNow: false,
    reasonCodes: [
      "server_authoritative_settlement_required",
      "client_flags_cannot_release_payout",
    ],
  };
}
