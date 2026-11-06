import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc, type AccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { buildLegalAcceptancePayload, legalRequirementsAreCurrent, parseLegalRequirementsReadback, WAVE1_LEGAL_MARKET, type LegalRequirementsReadback } from "./accountLegalAcceptance";
import { ACCOUNT_LEGAL_DOCUMENT_KEYS } from "./legalPolicies";

function assertCurrent(subject: AccountBoundSupabaseMutationSubject, expected: AccountSessionAuthorityBinding, isCurrent: () => boolean) {
  if (!sameAccountSessionAuthority(subject.authority, expected)
    || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot()) || expected.restoreOnly) throw new Error("creator_policy_account_changed");
  if (!isCurrent()) throw new Error("creator_policy_request_retired");
}

function validatedRequirements(value: unknown, expected: AccountSessionAuthorityBinding) {
  const readback = parseLegalRequirementsReadback(value);
  if (readback?.capability !== "creator_money" || !sameAccountSessionAuthority(readback, expected)) throw new Error("creator_policy_readback_unavailable");
  if (!buildLegalAcceptancePayload(readback)) throw new Error("creator_policy_version_unavailable");
  // Account consent is handled by the account gate, never inferred from the
  // two creator checkboxes. The RPC requires the complete current document set.
  if (readback.requirements.some(item => ACCOUNT_LEGAL_DOCUMENT_KEYS.includes(item.documentKey) && !item.accepted)) throw new Error("creator_policy_account_terms_required");
  return readback;
}

async function readWithSubject(subject: AccountBoundSupabaseMutationSubject) {
  const result = await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, "wave1_legal_requirements_readback", { p_capability: "creator_money" });
  if (result.error) throw new Error(result.error.message ?? "creator_policy_readback_unavailable");
  return validatedRequirements(result.data, subject.authority);
}

export async function readCreatorPolicyRequirements(expected: AccountSessionAuthorityBinding, isCurrent = () => true) {
  const subject = await captureAccountBoundSupabaseMutationSubject(expected.userId);
  assertCurrent(subject, expected, isCurrent);
  const readback = await readWithSubject(subject);
  assertCurrent(subject, expected, isCurrent);
  return readback;
}

// Per-account transport lock survives screen remounts and replacement sessions.
const acceptances = new Set<string>();
export async function acceptCreatorPolicies(
  expected: AccountSessionAuthorityBinding,
  displayed: LegalRequirementsReadback,
  consent: { creatorTerms: boolean; moneyTerms: boolean },
  isCurrent = () => true,
) {
  if (consent.creatorTerms !== true || consent.moneyTerms !== true) throw new Error("creator_policy_explicit_consent_required");
  const reviewed = validatedRequirements(displayed, expected);
  const reviewedVersions = buildLegalAcceptancePayload(reviewed)!;
  if (acceptances.has(expected.userId)) throw new Error("creator_policy_acceptance_pending");
  acceptances.add(expected.userId);
  try {
    const subject = await captureAccountBoundSupabaseMutationSubject(expected.userId, { waitForReadSettlement: true });
    assertCurrent(subject, expected, isCurrent);
    const current = await readWithSubject(subject);
    const versions = buildLegalAcceptancePayload(current)!;
    if (Object.keys(reviewedVersions).some(key => reviewedVersions[key] !== versions[key])) throw new Error("creator_policy_version_changed");
    // No await may separate this intent/subject check from pinned-token dispatch.
    assertCurrent(subject, expected, isCurrent);
    const result = await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, "wave1_accept_legal_documents", {
      p_acceptances: versions, p_market: WAVE1_LEGAL_MARKET, p_capability: "creator_money",
      p_expected_user_id: expected.userId, p_expected_account_id: expected.accountId, p_session_generation: expected.sessionGeneration,
    }, { retainTransportSettlement: true });
    if (result.error) throw new Error(result.error.message ?? "creator_policy_acceptance_unconfirmed");
    const readback = validatedRequirements(result.data, expected);
    if (!legalRequirementsAreCurrent(readback, expected)) throw new Error("creator_policy_acceptance_unconfirmed");
    // Retirement cannot revoke a dispatched write. The caller fences UI updates
    // separately and must refresh after an uncertain or interrupted submission.
    assertCurrent(subject, expected, () => true);
    return readback;
  } finally { acceptances.delete(expected.userId); }
}

export function creatorPolicyErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/configuration_incomplete|version_unavailable|version_changed|legal_version_mismatch/.test(message)) return "Current creator documents are unavailable or have changed. Update the app and refresh. Acceptance is blocked until the displayed and server versions match.";
  if (message.includes("account_terms_required")) return "Current account terms need acceptance first. Reopen the app to review the account terms, then refresh creator eligibility.";
  return "Creator terms acceptance could not be confirmed. Refresh to check the saved status before trying again.";
}
