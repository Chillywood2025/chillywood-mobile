export const CREATOR_MINIMUM_AGE = 18;
export const CREATOR_ELIGIBILITY_STATES = [
  "INELIGIBLE",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "SUSPENDED",
  "REVOKED",
] as const;

export type CreatorEligibilityState = typeof CREATOR_ELIGIBILITY_STATES[number];
export type CreatorMarket = "UNITED_STATES" | "EXCLUDED_TERRITORY" | "OTHER" | "UNKNOWN";
export type CreatorModerationState = "CLEAR" | "PENDING" | "SUSPENDED" | "REVOKED";
export type CreatorAccountState = "ACTIVE" | "RESTRICTED" | "DELETED" | "UNKNOWN";

export type CreatorEligibilityInputs = {
  accountStatus: CreatorAccountState;
  age18Plus: boolean | null;
  authority: "SERVER" | "CLIENT" | "UNKNOWN";
  creatorRole: boolean | null;
  kycComplete: boolean | null;
  legalAccepted: boolean | null;
  market: CreatorMarket;
  moderationState: CreatorModerationState;
  payoutEligible: boolean | null;
  platformCapability: boolean | null;
  providerEligible: boolean | null;
  rolloutEligible: boolean | null;
  sanctionsClear: boolean | null;
  taxComplete: boolean | null;
};

export type CreatorEligibilityDecision = {
  authoritative: boolean;
  canCreateMoneyExposure: boolean;
  canProcessHistoricalObligations: true;
  inputs: CreatorEligibilityInputs;
  minimumAge: 18;
  reasonCodes: string[];
  state: CreatorEligibilityState;
};

const REQUIRED_BOOLEAN_INPUTS = [
  "age18Plus",
  "legalAccepted",
  "creatorRole",
  "rolloutEligible",
  "platformCapability",
  "providerEligible",
  "kycComplete",
  "taxComplete",
  "sanctionsClear",
  "payoutEligible",
] as const satisfies readonly (keyof CreatorEligibilityInputs)[];

const decision = (
  inputs: CreatorEligibilityInputs,
  state: CreatorEligibilityState,
  reasonCodes: string[],
): CreatorEligibilityDecision => ({
  authoritative: inputs.authority === "SERVER",
  canCreateMoneyExposure: inputs.authority === "SERVER" && state === "VERIFIED",
  canProcessHistoricalObligations: true,
  inputs,
  minimumAge: CREATOR_MINIMUM_AGE,
  reasonCodes,
  state,
});
const parsedAuthorityDecisions = new WeakSet<CreatorEligibilityDecision>();
const parsedDecision = (...args: Parameters<typeof decision>) => {
  const value = decision(...args); parsedAuthorityDecisions.add(value); return value;
};

function evaluateCreatorEligibility(
  inputs: CreatorEligibilityInputs,
  previousState: CreatorEligibilityState = "INELIGIBLE",
): CreatorEligibilityDecision {
  if (inputs.authority !== "SERVER") {
    return decision(inputs, "PENDING_VERIFICATION", ["server_authority_required"]);
  }
  if (previousState === "REVOKED" || inputs.accountStatus === "DELETED" || inputs.moderationState === "REVOKED") {
    return decision(inputs, "REVOKED", ["authority_revoked"]);
  }
  if (inputs.accountStatus === "RESTRICTED" || inputs.moderationState === "SUSPENDED") {
    return decision(inputs, "SUSPENDED", ["authority_suspended"]);
  }
  if (inputs.market === "EXCLUDED_TERRITORY" || inputs.market === "OTHER"
    || REQUIRED_BOOLEAN_INPUTS.some((key) => inputs[key] === false)) {
    return decision(inputs, "INELIGIBLE", ["definitive_input_failure"]);
  }
  if (inputs.accountStatus !== "ACTIVE" || inputs.moderationState !== "CLEAR"
    || inputs.market !== "UNITED_STATES" || REQUIRED_BOOLEAN_INPUTS.some((key) => inputs[key] !== true)) {
    return decision(inputs, "PENDING_VERIFICATION", ["evidence_pending"]);
  }
  if (previousState === "SUSPENDED") {
    return decision(inputs, "PENDING_VERIFICATION", ["suspension_lift_requires_reevaluation"]);
  }
  return decision(inputs, "VERIFIED", ["all_authoritative_inputs_verified"]);
}

export const canCreateCreatorMoneyExposure = (value: CreatorEligibilityDecision) => (
  parsedAuthorityDecisions.has(value) && value.authoritative && value.state === "VERIFIED" && value.canCreateMoneyExposure
);

export const canProcessCreatorHistoricalObligation = (
  operation: "audit" | "cleanup" | "refund" | "reversal" | "reconciliation",
) => ["audit", "cleanup", "refund", "reversal", "reconciliation"].includes(operation);

const toBooleanOrNull = (value: unknown) => typeof value === "boolean" ? value : null;
const toText = (value: unknown) => String(value ?? "").trim();
const CREATOR_AUTHORITY_SOURCES = new Set([
  "money_flow_control", "moderation_safety_operator", "security_owner_operator", "local_pgtap",
]);

export function parseCreatorEligibilityReadback(value: unknown): CreatorEligibilityDecision {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const authoritative = row.authoritative === true;
  const stateText = toText(row.state) as CreatorEligibilityState;
  const state = CREATOR_ELIGIBILITY_STATES.includes(stateText) ? stateText : "PENDING_VERIFICATION";
  const inputs: CreatorEligibilityInputs = {
    accountStatus: (["ACTIVE", "RESTRICTED", "DELETED", "UNKNOWN"] as const).includes(toText(row.accountStatus) as CreatorAccountState)
      ? toText(row.accountStatus) as CreatorAccountState : "UNKNOWN",
    age18Plus: toBooleanOrNull(row.age18Plus),
    authority: authoritative ? "SERVER" : "UNKNOWN",
    creatorRole: toBooleanOrNull(row.creatorRole),
    kycComplete: toBooleanOrNull(row.kycComplete),
    legalAccepted: toBooleanOrNull(row.legalAccepted),
    market: (["UNITED_STATES", "EXCLUDED_TERRITORY", "OTHER", "UNKNOWN"] as const).includes(toText(row.market) as CreatorMarket)
      ? toText(row.market) as CreatorMarket : "UNKNOWN",
    moderationState: (["CLEAR", "PENDING", "SUSPENDED", "REVOKED"] as const).includes(toText(row.moderationState) as CreatorModerationState)
      ? toText(row.moderationState) as CreatorModerationState : "PENDING",
    payoutEligible: toBooleanOrNull(row.payoutEligible),
    platformCapability: toBooleanOrNull(row.platformCapability),
    providerEligible: toBooleanOrNull(row.providerEligible),
    rolloutEligible: toBooleanOrNull(row.rolloutEligible),
    sanctionsClear: toBooleanOrNull(row.sanctionsClear),
    taxComplete: toBooleanOrNull(row.taxComplete),
  };
  if (!authoritative || state !== "VERIFIED") {
    return parsedDecision(inputs, authoritative ? state : "PENDING_VERIFICATION",
      Array.isArray(row.reasonCodes) ? row.reasonCodes.map(toText).filter(Boolean) : ["server_authority_required"]);
  }
  const independentlyVerified = evaluateCreatorEligibility(inputs);
  const version = Number(row.version); const evaluatedAt = toText(row.evaluatedAt);
  const verifiedOutputCoherent = row.restoreOnly === false && row.canCreateMoneyExposure === true
    && row.canProcessHistoricalObligations === true && toText(row.accountId) === toText(row.userId)
    && !!toText(row.userId) && !!toText(row.sessionGeneration)
    && CREATOR_AUTHORITY_SOURCES.has(toText(row.authoritySource))
    && Number.isInteger(version) && version > 0 && !!evaluatedAt && Number.isFinite(Date.parse(evaluatedAt))
    && row.minimumAge === CREATOR_MINIMUM_AGE && row.rollout === "CONTROLLED_1_PERCENT_UNITED_STATES";
  if (independentlyVerified.state !== "VERIFIED" || !verifiedOutputCoherent) {
    return parsedDecision(inputs, "PENDING_VERIFICATION", ["incomplete_verified_readback"]);
  }
  return parsedDecision(inputs, "VERIFIED",
    Array.isArray(row.reasonCodes) ? row.reasonCodes.map(toText).filter(Boolean) : ["all_authoritative_inputs_verified"]);
}
