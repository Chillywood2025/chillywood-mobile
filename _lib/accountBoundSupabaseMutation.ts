import {
  getCurrentAccountSessionAuthoritySnapshot,
  parseAccountSessionAuthorityReadback,
  sameAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
import { withAuthorityReadDeadline } from "./entitlementAuthority";
import { invokeAccountBoundSupabaseRpc } from "./accountBoundSupabaseRpc.mjs";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "./supabase";
import { Platform } from "react-native";

export type AccountBoundSupabaseMutationSubject = {
  accessToken: string;
  authority: AccountSessionAuthorityBinding;
};

export type AccountBoundSupabaseMutationResult<T> = {
  data: T | null;
  error: { message?: string; code?: string } | null;
};

const toText = (value: unknown) => String(value ?? "").trim();

type ExactSessionAuthorityRpcName =
  | "heartbeat_watch_party_room_session"
  | "join_communication_room_session"
  | "join_watch_party_room_session"
  | "set_watch_party_participant_authority";

type AccountBoundMutationOperationPrefix = "dmca-strike" | "staff-role-grant";

export function createAccountBoundMutationOperationKey(
  prefix: AccountBoundMutationOperationPrefix,
) {
  let random = "";
  for (let index = 0; index < 32; index += 1) {
    random += Math.floor(Math.random() * 16).toString(16);
  }
  return `${prefix}:${random}`;
}

export class AccountBoundSupabaseMutationError extends Error {
  readonly code = "account_changed";

  constructor() {
    super("The signed-in account changed before this action finished.");
    this.name = "AccountBoundSupabaseMutationError";
  }
}

export function isAccountBoundSupabaseMutationOutcomeAmbiguous(error: unknown) {
  const record = error && typeof error === "object" && !Array.isArray(error)
    ? error as { message?: unknown }
    : null;
  const message = toText(record?.message ?? error);
  return message === "account_bound_rpc_timeout"
    || message === "account_bound_rpc_unavailable";
}

export function assertAccountBoundSupabaseMutationSubjectCurrent(
  subject: AccountBoundSupabaseMutationSubject,
) {
  if (!sameAccountSessionAuthority(
    subject.authority,
    getCurrentAccountSessionAuthoritySnapshot(),
  )) {
    throw new AccountBoundSupabaseMutationError();
  }
}

export async function invokeAccountBoundSupabaseMutationRpc<T>(
  subject: AccountBoundSupabaseMutationSubject,
  functionName: string,
  args: Record<string, unknown> = {},
): Promise<AccountBoundSupabaseMutationResult<T>> {
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  const result = await withAuthorityReadDeadline<AccountBoundSupabaseMutationResult<T>>(
    invokeAccountBoundSupabaseRpc({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      accessToken: subject.accessToken,
      functionName,
      args,
      clientPlatform: Platform.OS,
    }),
    { data: null, error: { message: "account_bound_rpc_timeout" } },
  );
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  return result;
}

async function capturePublishedAccountBoundSupabaseMutationSubject(
  expectedUserId?: string,
  allowRestoreOnly = false,
): Promise<AccountBoundSupabaseMutationSubject> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (
    !authority
    || authority.state !== "ACTIVE"
    || (authority.restoreOnly && !allowRestoreOnly)
    || (expectedUserId && authority.userId !== expectedUserId)
  ) {
    throw new AccountBoundSupabaseMutationError();
  }

  const sessionResponse = await withAuthorityReadDeadline(supabase.auth.getSession(), null);
  const session = sessionResponse?.data.session;
  const accessToken = toText(session?.access_token);
  if (!accessToken || toText(session?.user?.id) !== authority.userId) {
    throw new AccountBoundSupabaseMutationError();
  }

  const subject = { accessToken, authority };
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  return subject;
}

export async function captureAccountBoundSupabaseMutationSubject(
  expectedUserId?: string,
): Promise<AccountBoundSupabaseMutationSubject> {
  const subject = await capturePublishedAccountBoundSupabaseMutationSubject(expectedUserId);
  const authority = subject.authority;
  const readback = await invokeAccountBoundSupabaseMutationRpc<unknown>(
    subject,
    "wave1_session_authority_readback",
  );
  const exactReadback = readback.error
    ? null
    : parseAccountSessionAuthorityReadback(readback.data);
  if (!sameAccountSessionAuthority(authority, exactReadback)) {
    throw new AccountBoundSupabaseMutationError();
  }
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  return subject;
}

// These four RPCs independently require
// whole_app_exact_current_session_authority_internal() before mutation. They
// still need a frozen initiating token so an A -> B switch cannot make the
// request execute as B, but repeating the readback RPC on every room heartbeat
// would create a network request storm.
export async function runExactSessionAccountBoundSupabaseMutationRpc<T>(
  functionName: ExactSessionAuthorityRpcName,
  args: Record<string, unknown> = {},
  expectedUserId?: string,
) {
  const subject = await capturePublishedAccountBoundSupabaseMutationSubject(expectedUserId);
  return invokeAccountBoundSupabaseMutationRpc<T>(subject, functionName, args);
}

export async function runCurrentAccountBoundSupabaseMutationRpc<T>(
  functionName: string,
  args: Record<string, unknown> = {},
  expectedUserId?: string,
) {
  const subject = await captureAccountBoundSupabaseMutationSubject(expectedUserId);
  return invokeAccountBoundSupabaseMutationRpc<T>(subject, functionName, args);
}

// Account restoration is the only mutation permitted while a scheduled
// deletion has quarantined the session. Keep that exception literal and bind
// it to the same exact published session generation as every other mutation.
export async function runAccountRestorationBoundSupabaseMutationRpc<T>() {
  const subject = await capturePublishedAccountBoundSupabaseMutationSubject(undefined, true);
  const readback = await invokeAccountBoundSupabaseMutationRpc<unknown>(
    subject,
    "wave1_session_authority_readback",
  );
  const exactReadback = readback.error
    ? null
    : parseAccountSessionAuthorityReadback(readback.data);
  if (!sameAccountSessionAuthority(subject.authority, exactReadback)) {
    throw new AccountBoundSupabaseMutationError();
  }
  return invokeAccountBoundSupabaseMutationRpc<T>(
    subject,
    "restore_scheduled_account_deletion",
  );
}
