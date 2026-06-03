import { supabase } from "./supabase";

type AccountDeletionRequestPayload = {
  id?: unknown;
  status?: unknown;
  scheduled?: unknown;
  requestedAt?: unknown;
  scheduledAt?: unknown;
  deleteAfter?: unknown;
  restoreDeadline?: unknown;
  alreadyExists?: unknown;
  restored?: unknown;
  message?: unknown;
};

type AccountDeletionRequestRpc = {
  rpc(
    fn: "schedule_account_deletion" | "submit_account_deletion_request",
    args: {
      p_reason?: string | null;
      p_details?: string | null;
    },
  ): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
  rpc(
    fn: "get_my_account_deletion_status" | "restore_scheduled_account_deletion",
  ): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

const accountDeletionRpc = supabase as unknown as AccountDeletionRequestRpc;

const toText = (value: unknown) => String(value ?? "").trim();

export type AccountDeletionRequestResult = {
  id: string;
  status: string;
  scheduled: boolean;
  scheduledAt: string;
  deleteAfter: string;
  restoreDeadline: string;
  alreadyExists: boolean;
  restored: boolean;
  message: string;
};

export function getAccountDeletionRequestErrorMessage(error: unknown) {
  const raw = String(
    (error as { message?: unknown; code?: unknown } | null)?.message
    ?? (error as { code?: unknown } | null)?.code
    ?? "",
  ).toLowerCase();

  if (raw.includes("sign_in_required") || raw.includes("jwt") || raw.includes("auth")) {
    return "Sign in before deleting your account.";
  }
  if (raw.includes("network") || raw.includes("fetch") || raw.includes("timeout")) {
    return "Couldn't send the request. Check your connection and try again.";
  }
  return "Couldn't update account deletion. Try again.";
}

const parseAccountDeletionResult = (data: unknown, fallbackMessage: string): AccountDeletionRequestResult => {
  const payload = (data ?? {}) as AccountDeletionRequestPayload;
  const scheduledAt = toText(payload.scheduledAt) || toText(payload.requestedAt);

  return {
    id: toText(payload.id),
    status: toText(payload.status) || "active",
    scheduled: payload.scheduled === true || toText(payload.status) === "scheduled",
    scheduledAt,
    deleteAfter: toText(payload.deleteAfter),
    restoreDeadline: toText(payload.restoreDeadline) || toText(payload.deleteAfter),
    alreadyExists: payload.alreadyExists === true,
    restored: payload.restored === true,
    message: toText(payload.message) || fallbackMessage,
  };
};

export async function readMyAccountDeletionStatus(): Promise<AccountDeletionRequestResult> {
  const { data, error } = await accountDeletionRpc.rpc("get_my_account_deletion_status");

  if (error) throw new Error(getAccountDeletionRequestErrorMessage(error));

  return parseAccountDeletionResult(data, "Account is active.");
}

export async function scheduleAccountDeletion(input: {
  reason?: string | null;
  details?: string | null;
} = {}): Promise<AccountDeletionRequestResult> {
  const { data, error } = await accountDeletionRpc.rpc("schedule_account_deletion", {
    p_reason: input.reason ?? null,
    p_details: input.details ?? null,
  });

  if (error) throw new Error(getAccountDeletionRequestErrorMessage(error));

  return parseAccountDeletionResult(data, "Account deletion scheduled.");
}

export async function restoreScheduledAccountDeletion(): Promise<AccountDeletionRequestResult> {
  const { data, error } = await accountDeletionRpc.rpc("restore_scheduled_account_deletion");

  if (error) throw new Error(getAccountDeletionRequestErrorMessage(error));

  return parseAccountDeletionResult(data, "Account deletion canceled.");
}
