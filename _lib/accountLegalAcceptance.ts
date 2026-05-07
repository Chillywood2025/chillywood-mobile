import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";

export const USER_ACCOUNT_LEGAL_ACCEPTANCES_TABLE = "user_account_legal_acceptances";

export const CURRENT_LEGAL_ACCEPTANCE_VERSION = "public_v1_h1b";

export type AccountLegalAcceptancePayload = {
  user_id: string;
  age_confirmed_at: string;
  age_confirmed_version: string;
  terms_accepted_at: string;
  terms_accepted_version: string;
  privacy_accepted_at: string;
  privacy_accepted_version: string;
  updated_at: string;
};

const normalizeUserId = (userId: string) => String(userId ?? "").trim();

const normalizeIsoTimestamp = (timestamp?: string | number | Date) => {
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }

  const normalized = String(timestamp ?? "").trim();
  if (normalized) {
    const parsed = new Date(normalized);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
};

export function buildAccountLegalAcceptancePayload(
  userId: string,
  acceptedAt?: string | number | Date,
): AccountLegalAcceptancePayload {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    throw new Error("user_id is required for legal acceptance payload.");
  }

  const timestamp = normalizeIsoTimestamp(acceptedAt);

  return {
    user_id: normalizedUserId,
    age_confirmed_at: timestamp,
    age_confirmed_version: CURRENT_LEGAL_ACCEPTANCE_VERSION,
    terms_accepted_at: timestamp,
    terms_accepted_version: CURRENT_LEGAL_ACCEPTANCE_VERSION,
    privacy_accepted_at: timestamp,
    privacy_accepted_version: CURRENT_LEGAL_ACCEPTANCE_VERSION,
    updated_at: timestamp,
  };
}

export type AccountLegalAcceptanceWriteResult =
  | { ok: true }
  | { ok: false; errorMessage: string; code?: string };

export async function recordAccountLegalAcceptance(
  client: SupabaseClient<Database>,
  userId: string,
  acceptedAt?: string | number | Date,
): Promise<AccountLegalAcceptanceWriteResult> {
  const payload = buildAccountLegalAcceptancePayload(userId, acceptedAt);
  const { error } = await client
    .from(USER_ACCOUNT_LEGAL_ACCEPTANCES_TABLE)
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    return {
      ok: false,
      errorMessage: error.message,
      code: error.code,
    };
  }

  return { ok: true };
}
