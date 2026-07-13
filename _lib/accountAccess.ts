import { supabase } from "./supabase";

export type AccountAccessStatusReadback = {
  userIdSuffix: string | null;
  restricted: boolean;
  scheduledDeletion: boolean;
  authSuspended: boolean;
  bannedUntil: string | null;
};

type AccountAccessStatusRpc = PromiseLike<{
  data: Record<string, unknown> | null;
  error: { message?: string } | null;
}>;

const toText = (value: unknown) => String(value ?? "").trim();
const toBoolean = (value: unknown) => value === true;

export async function readAccountAccessStatus(userId: string): Promise<AccountAccessStatusReadback> {
  const normalizedUserId = toText(userId);
  if (!normalizedUserId) {
    throw new Error("account_user_required");
  }

  const rpc = (supabase.rpc as unknown as (
    fn: "account_access_status_readback",
    args: { p_user_id: string },
  ) => AccountAccessStatusRpc)("account_access_status_readback", {
    p_user_id: normalizedUserId,
  });

  const { data, error } = await rpc;
  if (error) {
    throw new Error(error.message ?? "account_access_status_unavailable");
  }

  return {
    userIdSuffix: toText(data?.userIdSuffix) || null,
    restricted: toBoolean(data?.restricted),
    scheduledDeletion: toBoolean(data?.scheduledDeletion),
    authSuspended: toBoolean(data?.authSuspended),
    bannedUntil: toText(data?.bannedUntil) || null,
  };
}
