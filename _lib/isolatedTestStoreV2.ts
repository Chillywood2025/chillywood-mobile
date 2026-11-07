import { Platform } from "react-native";
import { captureAccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
import { testStoreDigest, testStoreUuid } from "./isolatedTestStoreContract";
import { parseIsolatedTestStoreV2Result, validTestStoreV2Payload, type TestStoreV2Command, type TestStoreV2Payloads } from "./isolatedTestStoreV2Contract";

export class IsolatedTestStoreV2Error extends Error {
  constructor(readonly code: "invalid_request" | "authority_retired" | "outcome_unknown", readonly outcome: "not_sent" | "unknown") { super(`Isolated Test Store v2: ${code}.`); }
}
/** A captured client never resumes after any authority gap. Recovery uses a
 * newly captured current client and cannot recreate an old mutation ticket. */
export async function captureIsolatedTestStoreV2Client(authority: AccountSessionAuthorityBinding, configurationDigest: string) {
  if (!authority || authority.restoreOnly || authority.userId !== authority.accountId || !testStoreUuid(authority.userId)
    || !testStoreUuid(authority.sessionGeneration) || !testStoreDigest(configurationDigest)
    || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new IsolatedTestStoreV2Error("authority_retired", "not_sent");
  const expected = Object.freeze({ ...authority }); let retired = false;
  const unsubscribe = subscribeToAccountSessionAuthority(current => { if (!sameAccountSessionAuthority(expected, current)) retired = true; });
  const current = (sent = false) => { if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) throw new IsolatedTestStoreV2Error("authority_retired", sent ? "unknown" : "not_sent"); };
  let captured: Awaited<ReturnType<typeof captureAccountBoundSupabaseMutationSubject>>;
  try {
    captured = await captureAccountBoundSupabaseMutationSubject(authority.userId, { waitForReadSettlement: true });
    if (!sameAccountSessionAuthority(expected, captured.authority)) retired = true;
    current();
  } catch { unsubscribe(); throw new IsolatedTestStoreV2Error("authority_retired", "not_sent"); }
  const actor = Object.freeze({ userId: expected.userId, sessionId: expected.sessionGeneration });
  const usedMutations = new Set<string>();
  return Object.freeze({ actor, configurationDigest,
    dispose() { retired = true; unsubscribe(); },
    async request<C extends TestStoreV2Command>(command: C, requestId: string, payload: TestStoreV2Payloads[C]) {
      if (!testStoreUuid(requestId) || !validTestStoreV2Payload(command, payload) || (command !== "read" && usedMutations.has(requestId))) throw new IsolatedTestStoreV2Error("invalid_request", "not_sent");
      current();
      const body = JSON.stringify({ protocol: "isolated-test-store-v2", command, requestId, expectedSessionId: actor.sessionId, configurationDigest, payload });
      if (command !== "read") usedMutations.add(requestId);
      try {
        const response = await fetch(`${SUPABASE_URL.replace(/\/+$/u, "")}/functions/v1/isolated-sandbox-test-store-v2`, {
          method: "POST", headers: { Authorization: `Bearer ${captured.accessToken}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json", "x-chillywood-platform": Platform.OS }, body,
        });
        current(true);
        if (!response.ok) throw new IsolatedTestStoreV2Error("outcome_unknown", "unknown");
        const value: unknown = await response.json(); current(true);
        return parseIsolatedTestStoreV2Result(value, { command, requestId, actor, configurationDigest, payload });
      } catch { current(true); throw new IsolatedTestStoreV2Error("outcome_unknown", "unknown"); }
    },
  });
}
export type IsolatedTestStoreV2Client = Awaited<ReturnType<typeof captureIsolatedTestStoreV2Client>>;
