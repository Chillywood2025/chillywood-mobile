import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import type { IsolatedSandboxTipCheckoutAttempt } from "./isolatedSandboxTipCheckoutAttempts";
import { captureIsolatedTestStoreSdk } from "./isolatedTestStoreSdk";
import { type IsolatedTestStoreClient } from "./isolatedTestStore";
import { createIsolatedTestStoreAttemptJournal, type TestStoreMutationRequest } from "./isolatedTestStoreAttempts";

/** The complete fresh pipeline exists only in memory. Recovery is a read of
 * the original attempt, never a reconstruction of any mutation capability. */
export async function runIsolatedTestStoreRehearsal({ authority, preparation, journal, client, nextRequestId, onSaved }: {
  authority: AccountSessionAuthorityBinding; preparation: IsolatedSandboxTipCheckoutAttempt;
  journal: ReturnType<typeof createIsolatedTestStoreAttemptJournal>; client: IsolatedTestStoreClient; nextRequestId(): string; onSaved?(): Promise<void>;
}) {
  let retired = false; let sdk: ReturnType<typeof captureIsolatedTestStoreSdk> | null = null;
  const unsubscribe = subscribeToAccountSessionAuthority(current => { if (!sameAccountSessionAuthority(authority, current)) retired = true; });
  const current = () => { if (retired || authority.restoreOnly || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())
    || client.actor.userId !== authority.userId || client.actor.sessionId !== authority.sessionGeneration) throw new Error("isolated_test_store_authority_retired"); };
  const send = async (request: Readonly<TestStoreMutationRequest>) => {
    current();
    const value = await client.request(request.command, request.requestId, request.payload);
    current(); return value;
  };
  try {
    current();
    if (preparation.userId !== authority.userId || preparation.command !== "checkout.prepare"
      || preparation.state !== "intent_prepared" || !preparation.intentId || preparation.quote.creatorId === authority.userId) throw new Error("isolated_test_store_quote_unconfirmed");
    const first = await journal.prepareAllocation({ requestId: nextRequestId(), sessionId: authority.sessionGeneration,
      intentId: preparation.intentId, quote: preparation.quote });
    current();
    if (!first.mayAllocate || !first.allocate) throw new Error("isolated_test_store_attempt_already_saved");
    await onSaved?.(); current();
    const allocated = await first.allocate(send); current();
    if (!allocated.claim) return allocated.attempt;
    const claimed = await allocated.claim({ requestId: nextRequestId() }, async (request, allocation) => {
      current(); if (!allocation) throw new Error("isolated_test_store_allocation_missing");
      sdk = captureIsolatedTestStoreSdk(authority, allocation); await sdk.prepare(); current();
      return send(request);
    });
    current(); if (!claimed.purchase) return claimed.attempt;
    const completed = await claimed.purchase(async (_allocation, claim) => {
      current(); if (!sdk) throw new Error("isolated_test_store_sdk_unavailable");
      const result = await sdk.purchase(claim); current(); return result;
    });
    current();
    return completed.report ? completed.report({ requestId: nextRequestId() }, send) : completed.attempt;
  } finally {
    // This never releases the journal reservation or native ownership.
    // A promise that remains pending never reaches this block.
    unsubscribe(); (sdk as ReturnType<typeof captureIsolatedTestStoreSdk> | null)?.dispose();
  }
}
