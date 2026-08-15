import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "../supabase/database.types";
import { isCurrentAccountSessionAuthority, readCurrentAccountSessionAuthority, sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { ACCOUNT_LEGAL_DOCUMENT_KEYS, LEGAL_DOCUMENTS, LEGAL_DOCUMENT_KEYS, type LegalDocumentKey } from "./legalPolicies";

export const WAVE1_LEGAL_MARKET = "UNITED_STATES" as const;
export const LEGAL_ACCEPTANCE_RETENTION = {
  directIdentity: "deidentified_after_account_deletion_unless_lawful_hold_applies", audit: "minimum_fields_only_for_legal_security_dispute_and_fraud_retention", rawIdentityEvidence: "not_stored_by_legal_acceptance",
} as const;

export type LegalCapability = "account" | "creator" | "creator_money" | "payout";
export type LegalRequirement = {
  documentKey: LegalDocumentKey; version: string; state: "CURRENT_ACCEPTED" | "REQUIRED_UNACCEPTED";
  accepted: boolean; acceptedAt: string | null;
};
export type LegalRequirementsReadback = AccountSessionAuthorityBinding & {
  authoritative: true; market: typeof WAVE1_LEGAL_MARKET;
  capability: LegalCapability; requirements: LegalRequirement[];
};

type LegalRpc = PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
const legalKeys = new Set<string>(LEGAL_DOCUMENT_KEYS);
const capabilities = new Set<LegalCapability>(["account", "creator", "creator_money", "payout"]);
const requiredKeys: Record<LegalCapability, readonly LegalDocumentKey[]> = {
  account: ACCOUNT_LEGAL_DOCUMENT_KEYS, creator: [...ACCOUNT_LEGAL_DOCUMENT_KEYS, "creator_terms"],
  creator_money: [...ACCOUNT_LEGAL_DOCUMENT_KEYS, "creator_terms", "money_terms"],
  payout: [...ACCOUNT_LEGAL_DOCUMENT_KEYS, "creator_terms", "money_terms"],
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function parseLegalRequirementsReadback(value: unknown): LegalRequirementsReadback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const capability = text(row.capability) as LegalCapability;
  const requirements = Array.isArray(row.requirements) ? row.requirements : [];
  const seen = new Set<string>();
  const parsed: LegalRequirement[] = [];
  for (const candidate of requirements) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const item = candidate as Record<string, unknown>;
    const documentKey = text(item.documentKey) as LegalDocumentKey;
    const version = text(item.version);
    const acceptedAt = item.acceptedAt == null ? null : text(item.acceptedAt);
    if (!legalKeys.has(documentKey) || seen.has(documentKey) || !version) return null;
    if (item.state === "CURRENT_ACCEPTED" && (item.accepted !== true || !acceptedAt || !Number.isFinite(Date.parse(acceptedAt)))) return null;
    if (item.state === "REQUIRED_UNACCEPTED" && item.accepted !== false) return null;
    if (item.state !== "CURRENT_ACCEPTED" && item.state !== "REQUIRED_UNACCEPTED") return null;
    seen.add(documentKey);
    parsed.push({ documentKey, version, state: item.state, accepted: item.accepted, acceptedAt });
  }
  const userId = text(row.userId);
  const accountId = text(row.accountId);
  const sessionGeneration = text(row.sessionGeneration);
  if (row.authoritative !== true || row.market !== WAVE1_LEGAL_MARKET || !capabilities.has(capability)) return null;
  if (!userId || !accountId || !sessionGeneration || parsed.length !== requiredKeys[capability].length) return null;
  if (requiredKeys[capability].some((key) => !seen.has(key))) return null;
  return {
    authoritative: true, userId, accountId, sessionGeneration, state: "ACTIVE", restoreOnly: false,
    market: WAVE1_LEGAL_MARKET, capability, requirements: parsed,
  };
}

export function sameLegalAuthorityBinding(readback: LegalRequirementsReadback | null, authority: AccountSessionAuthorityBinding | null) {
  return sameAccountSessionAuthority(readback, authority);
}

export function legalRequirementsAreCurrent(
  readback: LegalRequirementsReadback | null,
  authority?: AccountSessionAuthorityBinding | null,
) {
  if (!readback || (authority && !sameLegalAuthorityBinding(readback, authority))) return false;
  return readback.requirements.every((requirement) => requirement.state === "CURRENT_ACCEPTED"
    && requirement.accepted && LEGAL_DOCUMENTS.some((document) => (
      document.documentKey === requirement.documentKey && document.version === requirement.version)));
}

export function buildLegalAcceptancePayload(readback: LegalRequirementsReadback): Record<string, string> | null {
  const payload: Record<string, string> = {};
  for (const requirement of readback.requirements) {
    const bundled = LEGAL_DOCUMENTS.find((document) => document.documentKey === requirement.documentKey);
    if (!bundled || bundled.version !== requirement.version) return null;
    payload[requirement.documentKey] = requirement.version;
  }
  return payload;
}

export async function readAccountLegalRequirements(client: SupabaseClient<Database>, capability: LegalCapability = "account") {
  const rpc = (client.rpc as unknown as (fn: "wave1_legal_requirements_readback", args: {
    p_capability: LegalCapability;
  }) => LegalRpc)("wave1_legal_requirements_readback", { p_capability: capability });
  const { data, error } = await rpc;
  return error ? null : parseLegalRequirementsReadback(data);
}

export type AccountLegalAcceptanceWriteResult =
  | { ok: true; readback: LegalRequirementsReadback }
  | { ok: false; errorMessage: string; code?: string };

export async function recordAccountLegalAcceptance(
  client: SupabaseClient<Database>,
  userId: string,
  capability: LegalCapability = "account",
): Promise<AccountLegalAcceptanceWriteResult> {
  const authority = await readCurrentAccountSessionAuthority();
  if (!authority || authority.restoreOnly || authority.userId !== String(userId ?? "").trim()) {
    return { ok: false, errorMessage: "legal_acceptance_session_authority_unavailable" };
  }
  const requirements = await readAccountLegalRequirements(client, capability);
  if (!sameLegalAuthorityBinding(requirements, authority)) {
    return { ok: false, errorMessage: "legal_acceptance_session_changed" };
  }
  const acceptances = buildLegalAcceptancePayload(requirements!);
  if (!acceptances) return { ok: false, errorMessage: "legal_document_version_unavailable" };
  const rpc = (client.rpc as unknown as (fn: "wave1_accept_legal_documents", args: {
    p_acceptances: Json; p_market: typeof WAVE1_LEGAL_MARKET; p_capability: LegalCapability;
  }) => LegalRpc)("wave1_accept_legal_documents", {
    p_acceptances: acceptances, p_market: WAVE1_LEGAL_MARKET, p_capability: capability,
  });
  const { data, error } = await rpc;
  if (error) return { ok: false, errorMessage: error.message ?? "legal_acceptance_failed", code: error.code };
  const readback = parseLegalRequirementsReadback(data);
  if (
    !sameLegalAuthorityBinding(readback, authority)
    || !legalRequirementsAreCurrent(readback, authority)
    || !(await isCurrentAccountSessionAuthority(authority))
  ) return { ok: false, errorMessage: "legal_acceptance_not_authoritative" };
  return { ok: true, readback: readback! };
}
