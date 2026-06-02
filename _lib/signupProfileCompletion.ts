import type { User } from "@supabase/supabase-js";

import { supabase } from "./supabase";
import {
  getUsernameErrorMessage,
  normalizeUsernameHandle,
  updateMyUsername,
  validateUsernameHandle,
} from "./usernameHandles";

const USER_PROFILES_TABLE = "user_profiles";

const toText = (value: unknown) => String(value ?? "").trim();

type PendingSignupProfileInput = {
  user?: User | null;
  username?: unknown;
  displayName?: unknown;
};

export type PendingSignupProfileResult =
  | { ok: true; completed: boolean }
  | { ok: false; message: string };

export async function completePendingSignupProfile(
  input: PendingSignupProfileInput = {},
): Promise<PendingSignupProfileResult> {
  const sessionResult = await supabase.auth.getSession();
  const sessionUser = sessionResult.data.session?.user ?? null;
  const user = input.user ?? sessionUser;
  const userId = toText(user?.id);
  if (!userId || !sessionUser?.id || sessionUser.id !== userId) {
    return { ok: true, completed: false };
  }

  const metadata = user?.user_metadata ?? {};
  const displayName = toText(input.displayName ?? metadata.display_name);
  const username = normalizeUsernameHandle(input.username ?? metadata.username);
  const local = validateUsernameHandle(username);

  const existing = await supabase
    .from(USER_PROFILES_TABLE)
    .select("username,display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, message: "Couldn't finish account setup. Try again." };
  }

  if (existing.data?.username) {
    if (displayName && !toText(existing.data.display_name)) {
      const update = await supabase
        .from(USER_PROFILES_TABLE)
        .update({
          display_name: displayName,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (update.error) {
        return { ok: false, message: "Couldn't finish account setup. Try again." };
      }
    }
    return { ok: true, completed: false };
  }

  if (!username) {
    return { ok: true, completed: false };
  }

  if (!local.available) {
    return { ok: false, message: local.message || "Choose an available username." };
  }

  try {
    await updateMyUsername(local.username);
  } catch (error) {
    return { ok: false, message: getUsernameErrorMessage(error) };
  }

  if (displayName) {
    const update = await supabase
      .from(USER_PROFILES_TABLE)
      .update({
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (update.error) {
      return { ok: false, message: "Couldn't finish account setup. Try again." };
    }
  }

  return { ok: true, completed: true };
}
