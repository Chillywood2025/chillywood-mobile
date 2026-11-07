import { Platform } from "react-native";
import { captureAccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
import { parseIsolatedTestStoreResult, testStoreDigest, testStoreUuid, validTestStorePayload, type TestStoreCommand, type TestStorePayloads } from "./isolatedTestStoreContract";

export class IsolatedTestStoreError extends Error {
  constructor(readonly code: "invalid_request" | "authority_retired" | "outcome_unknown", readonly outcome: "not_sent" | "unknown") { super(`Isolated Test Store: ${code}.`); }
}
export async function captureIsolatedTestStoreClient(authority: AccountSessionAuthorityBinding, configurationDigest: string) {
  if (!authority || authority.restoreOnly || authority.userId !== authority.accountId || !testStoreUuid(authority.userId)
    || !testStoreUuid(authority.sessionGeneration) || !testStoreDigest(configurationDigest)
    || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new IsolatedTestStoreError("authority_retired", "not_sent");
  const expected = Object.freeze({ ...authority }); let retired = false;
  const unsubscribe = subscribeToAccountSessionAuthority(current => { if (!sameAccountSessionAuthority(expected, current)) retired = true; });
  const current = (sent = false) => { if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) throw new IsolatedTestStoreError("authority_retired", sent ? "unknown" : "not_sent"); };
  let captured: Awaited<ReturnType<typeof captureAccountBoundSupabaseMutationSubject>>;
  try {
    captured = await captureAccountBoundSupabaseMutationSubject(authority.userId, { waitForReadSettlement: true });
    if (!sameAccountSessionAuthority(expected, captured.authority)) retired = true;
    current();
  } catch { unsubscribe(); throw new IsolatedTestStoreError("authority_retired", "not_sent"); }
  const actor = Object.freeze({ userId: expected.userId, sessionId: expected.sessionGeneration });
  const usedMutations = new Set<string>();
  return Object.freeze({ actor, configurationDigest,
    dispose() { retired = true; unsubscribe(); },
    async request<C extends TestStoreCommand>(command: C, requestId: string, payload: TestStorePayloads[C]) {
      if (!testStoreUuid(requestId) || !validTestStorePayload(command, payload) || (command !== "read" && usedMutations.has(requestId))) throw new IsolatedTestStoreError("invalid_request", "not_sent");
      current();
      const body = JSON.stringify({ protocol: "isolated-test-store-v1", command, requestId, expectedSessionId: actor.sessionId, configurationDigest, payload });
      if (command !== "read") usedMutations.add(requestId);
      try {
        const response = await fetch(`${SUPABASE_URL.replace(/\/+$/u, "")}/functions/v1/isolated-sandbox-test-store-v1`, {
          method: "POST", headers: { Authorization: `Bearer ${captured.accessToken}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json", "x-chillywood-platform": Platform.OS }, body,
        });
        current(true);
        if (!response.ok) throw new IsolatedTestStoreError("outcome_unknown", "unknown");
        const value: unknown = await response.json(); current(true);
        return parseIsolatedTestStoreResult(value, { command, requestId, actor, configurationDigest, payload });
      } catch { current(true); throw new IsolatedTestStoreError("outcome_unknown", "unknown"); }
    },
  });
}
export type IsolatedTestStoreClient = Awaited<ReturnType<typeof captureIsolatedTestStoreClient>>;
