import { supabase } from "./supabase";

type AccountDeletionRequestPayload = {
  id?: unknown;
  status?: unknown;
  requestedAt?: unknown;
  alreadyExists?: unknown;
  message?: unknown;
};

type AccountDeletionRequestRpc = {
  rpc: (
    fn: "submit_account_deletion_request",
    args: {
      p_reason?: string | null;
      p_details?: string | null;
    },
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

const accountDeletionRpc = supabase as unknown as AccountDeletionRequestRpc;

const toText = (value: unknown) => String(value ?? "").trim();

export type AccountDeletionRequestResult = {
  id: string;
  status: string;
  requestedAt: string;
  alreadyExists: boolean;
  message: string;
};

export function getAccountDeletionRequestErrorMessage(error: unknown) {
  const raw = String(
    (error as { message?: unknown; code?: unknown } | null)?.message
    ?? (error as { code?: unknown } | null)?.code
    ?? "",
  ).toLowerCase();

  if (raw.includes("sign_in_required") || raw.includes("jwt") || raw.includes("auth")) {
    return "Sign in before requesting account deletion.";
  }
  if (raw.includes("network") || raw.includes("fetch") || raw.includes("timeout")) {
    return "Couldn't send the request. Check your connection and try again.";
  }
  return "Couldn't send the deletion request. Try again.";
}

export async function submitAccountDeletionRequest(input: {
  reason?: string | null;
  details?: string | null;
} = {}): Promise<AccountDeletionRequestResult> {
  const { data, error } = await accountDeletionRpc.rpc("submit_account_deletion_request", {
    p_reason: input.reason ?? null,
    p_details: input.details ?? null,
  });

  if (error) throw new Error(getAccountDeletionRequestErrorMessage(error));

  const payload = (data ?? {}) as AccountDeletionRequestPayload;
  return {
    id: toText(payload.id),
    status: toText(payload.status) || "requested",
    requestedAt: toText(payload.requestedAt),
    alreadyExists: payload.alreadyExists === true,
    message: toText(payload.message) || "Deletion request submitted.",
  };
}
