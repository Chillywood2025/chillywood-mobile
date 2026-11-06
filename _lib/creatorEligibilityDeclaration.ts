import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc, type AccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { parseCreatorEligibilityReadback, type CreatorEligibilityDecision } from "./creatorEligibility";

export const CREATOR_DECLARATION_VERSION = "adult-us-creator-v1";
export const CREATOR_US_REGIONS = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
export type CreatorDeclarationInput = { declared18Plus: boolean; residesInUS: boolean; regionCode: string };
export type CreatorDeclarationReadback = {
  declaration: { version: string; declared18Plus: true; countryCode: "US"; regionCode: string; source: "self_declaration"; declaredAt: string } | null;
  pending: string[];
  eligibility: CreatorEligibilityDecision;
};
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export function parseCreatorDeclarationReadback(value: unknown, expected: AccountSessionAuthorityBinding): CreatorDeclarationReadback | null {
  const row = record(value);
  if (!row || expected.restoreOnly || row.authoritative !== true || row.userId !== expected.userId
    || row.accountId !== expected.accountId || row.sessionGeneration !== expected.sessionGeneration || row.restoreOnly !== false) return null;
  let declaration: CreatorDeclarationReadback["declaration"] = null;
  if (row.declaration != null) {
    const d = record(row.declaration);
    if (!d || d.version !== CREATOR_DECLARATION_VERSION || d.declared18Plus !== true || d.countryCode !== "US"
      || typeof d.regionCode !== "string" || !CREATOR_US_REGIONS.includes(d.regionCode) || d.source !== "self_declaration"
      || typeof d.declaredAt !== "string" || !Number.isFinite(Date.parse(d.declaredAt))) return null;
    declaration = d as CreatorDeclarationReadback["declaration"];
  }
  const pending = ([
    ["taxComplete", "Tax information"], ["sanctionsClear", "Sanctions review"], ["providerEligible", "Payment provider eligibility"],
    ["kycComplete", "Provider identity checks"], ["payoutEligible", "Bank and payout eligibility"], ["legalAccepted", "Current creator and money terms"],
    ["platformCapability", "Platform availability"], ["creatorRole", "Premium creator eligibility"],
  ] as const).filter(([key]) => row[key] !== true).map(([, label]) => label as string);
  if (row.accountStatus !== "ACTIVE" || row.moderationState !== "CLEAR") pending.push("Account or moderation restrictions");
  return { declaration, pending, eligibility: parseCreatorEligibilityReadback(row, expected) };
}

export function creatorDeclarationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("creator_declaration_rate_limited")) return "You have reached the declaration limit for the last 24 hours. Refresh to check your saved declaration, or wait before trying again.";
  if (message.includes("premium")) return "Creator tools require an eligible Premium account. Ordinary buyers can continue using a Free account.";
  return "Your declaration could not be confirmed. Refresh to check saved information before trying again.";
}
function assertExpected(subject: AccountBoundSupabaseMutationSubject, expected: AccountSessionAuthorityBinding) {
  if (!sameAccountSessionAuthority(expected, subject.authority) || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) throw new Error("account_changed");
}
async function readWithSubject(subject: AccountBoundSupabaseMutationSubject): Promise<CreatorDeclarationReadback> {
  const result = await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, "wave1_creator_eligibility_readback");
  if (result.error) throw new Error(result.error.message ?? "readback_failed");
  const parsed = parseCreatorDeclarationReadback(result.data, subject.authority);
  if (!parsed) throw new Error("invalid_creator_declaration_readback");
  return parsed;
}
export async function readCreatorEligibilityDeclaration(expected: AccountSessionAuthorityBinding, isCurrent = () => true) {
  const subject = await captureAccountBoundSupabaseMutationSubject(expected.userId);
  assertExpected(subject, expected);
  if (!isCurrent()) throw new Error("declaration_request_retired");
  return readWithSubject(subject);
}
// Retain one save per account until transport settlement, including remounts and session changes.
const saves = new Set<string>();
export async function saveCreatorEligibilityDeclaration(expected: AccountSessionAuthorityBinding, input: CreatorDeclarationInput, isCurrent = () => true) {
  if (!input.declared18Plus || !input.residesInUS || !CREATOR_US_REGIONS.includes(input.regionCode)) throw new Error("explicit_adult_us_declaration_required");
  if (saves.has(expected.userId)) throw new Error("declaration_save_pending");
  saves.add(expected.userId);
  try {
    const subject = await captureAccountBoundSupabaseMutationSubject(expected.userId);
    assertExpected(subject, expected);
    if (!isCurrent()) throw new Error("declaration_request_retired");
    const result = await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, "declare_creator_money_eligibility", {
      p_declared_18_plus: true, p_country_code: "US", p_region_code: input.regionCode, p_declaration_version: CREATOR_DECLARATION_VERSION,
    }, { retainTransportSettlement: true });
    if (result.error) throw new Error(result.error.message ?? "declaration_failed");
    const readback = await readWithSubject(subject);
    if (!readback.declaration || readback.declaration.regionCode !== input.regionCode) throw new Error("declaration_readback_mismatch");
    return readback;
  } finally { saves.delete(expected.userId); }
}

export async function readCreatorPayoutLegalStatus(expected: AccountSessionAuthorityBinding, isCurrent = () => true): Promise<string> {
  const subject = await captureAccountBoundSupabaseMutationSubject(expected.userId);
  assertExpected(subject, expected);
  if (!isCurrent()) throw new Error("declaration_request_retired");
  const result = await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, "wave1_legal_requirements_readback", { p_capability: "payout" });
  if (result.error?.message?.includes("legal_document_configuration_incomplete")) return "Payout terms: platform document configuration is incomplete. This is not a missing acceptance you can resolve here.";
  const row = record(result.data);
  if (result.error || !row || row.authoritative !== true || row.userId !== expected.userId || row.accountId !== expected.accountId
    || row.sessionGeneration !== expected.sessionGeneration || row.state !== "ACTIVE" || row.restoreOnly !== false || row.capability !== "payout") throw new Error("invalid_payout_legal_readback");
  if (row.reason === "legal_document_configuration_incomplete" || row.reasonCode === "legal_document_configuration_incomplete") return "Payout terms: platform document configuration is incomplete. This is not a missing acceptance you can resolve here.";
  if (!Array.isArray(row.requirements) || !row.requirements.length) throw new Error("invalid_payout_legal_readback");
  const requirements = row.requirements.map(record);
  if (requirements.some(r => !r || typeof r.documentKey !== "string" || typeof r.version !== "string" || !r.version
    || !["CURRENT_ACCEPTED", "REQUIRED_UNACCEPTED"].includes(String(r.state)) || typeof r.accepted !== "boolean"
    || (r.state === "CURRENT_ACCEPTED" && (r.accepted !== true || typeof r.acceptedAt !== "string" || !Number.isFinite(Date.parse(r.acceptedAt))))
    || (r.state === "REQUIRED_UNACCEPTED" && (r.accepted !== false || r.acceptedAt !== null)))) throw new Error("invalid_payout_legal_readback");
  if (!requirements.some(r => r?.documentKey === "payout_terms")) return "Payout terms: platform document configuration is incomplete. This is not a missing acceptance you can resolve here.";
  const requiredKeys = ["terms", "privacy", "community_guidelines", "creator_terms", "money_terms", "payout_terms"];
  if (requirements.length !== requiredKeys.length || requiredKeys.some(key => requirements.filter(r => r?.documentKey === key).length !== 1)) throw new Error("invalid_payout_legal_readback");
  return requirements.every(r => r?.accepted === true) ? "Payout terms: current acceptance recorded. Other eligibility checks still apply." : "Payout terms: current documents need your acceptance in Tax & Legal.";
}
