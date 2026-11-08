import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { captureIsolatedTipClient, newTipRequestId } from "./isolatedSandboxTips";
import { IsolatedSandboxCommerceError } from "./isolatedSandboxCommerce";
import { captureIsolatedTestStoreV2Client } from "./isolatedTestStoreV2";
import { createIsolatedTestStoreV2AttemptJournal, type IsolatedTestStoreV2Attempt, type TestStoreV2AttemptStorage, type TestStoreV2JournalRequest } from "./isolatedTestStoreV2Attempts";
import { createIsolatedTestStoreV2Preparations, type TestStoreV2Preparation } from "./isolatedTestStoreV2Preparations";
import { inspectIsolatedTestStoreV2Installation, readIsolatedTestStoreV2Build, readIsolatedTestStoreV2NativeInvocation } from "./isolatedTestStoreV2Build";
import { captureIsolatedTestStoreV2Sdk, type IsolatedTestStoreV2Sdk } from "./isolatedTestStoreV2Sdk";
import { type TestStoreQuote } from "./isolatedTestStoreContract";

const unavailable = (): never => { throw new Error("isolated_test_store_v2_actions_unavailable"); };
/** Current-session actions over real transport, durable journals and native
 * ownership. None of the recovery methods reconstructs a mutation ticket. */
export async function captureIsolatedTestStoreV2Actions(authority: AccountSessionAuthorityBinding, options: { storage?: TestStoreV2AttemptStorage; nextRequestId?(): string } = {}) {
  const expected = Object.freeze({ ...authority }), build = readIsolatedTestStoreV2Build(); let retired = false;
  if (!build || authority.restoreOnly || authority.userId !== authority.accountId || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return unavailable();
  const unsubscribe = subscribeToAccountSessionAuthority(next => { if (!sameAccountSessionAuthority(expected, next)) retired = true; });
  const current = () => { if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) return unavailable(); };
  const nextId = options.nextRequestId ?? newTipRequestId;
  let client: Awaited<ReturnType<typeof captureIsolatedTestStoreV2Client>> | null = null;
  let coreClient: Awaited<ReturnType<typeof captureIsolatedTipClient>> | null = null;
  let sdk: IsolatedTestStoreV2Sdk | null = null;
  try {
    const installation = await inspectIsolatedTestStoreV2Installation(); current();
    if (installation.customer && installation.customer.buyerId !== expected.userId) return unavailable();
    client = await captureIsolatedTestStoreV2Client(expected, build.configId); current();
    coreClient = await captureIsolatedTipClient(expected); current();
    const connection = client, core = coreClient;
    const scope = { userId: expected.userId, configurationDigest: build.configId, installationId: installation.installationId, ...(options.storage ? { storage: options.storage } : {}) };
    const journal = createIsolatedTestStoreV2AttemptJournal(scope), preparations = createIsolatedTestStoreV2Preparations(scope);
    const send = async (request: Readonly<TestStoreV2JournalRequest>) => {
      current(); if (request.expectedSessionId !== expected.sessionGeneration || request.configurationDigest !== build.configId) return unavailable();
      const result = await connection.request(request.command, request.requestId, request.payload); current(); return result;
    };
    const nativeRead = async (dispatchId: string) => { current(); const result = await readIsolatedTestStoreV2NativeInvocation(dispatchId); current(); return result; };
    const recoverPreparation = async (requestId: string) => {
      current(); const readId = nextId(); const result = await core.request("request.read", readId, { originalRequestId: requestId }); current();
      const saved = await preparations.reconcile(requestId, result, { requestId: readId, sessionGeneration: expected.sessionGeneration }); current(); return saved;
    };
    const recover = async (attempt: IsolatedTestStoreV2Attempt) => {
      current(); const requestId = nextId(), payload = { intentId: attempt.intentId };
      const result = await connection.request("read", requestId, payload); current();
      let saved = await journal.reconcile({ requestId, sessionId: expected.sessionGeneration, payload }, result); current();
      if (saved.allocation) {
        try { saved = await journal.reconcileNative(saved.allocation.id, nativeRead); }
        catch { current(); /* No native completion is inferred from a missing or pending record. */ }
      }
      current(); return saved;
    };
    return Object.freeze({
      installationId: installation.installationId, nativeProcessRetired: installation.processRetired,
      dispose() { retired = true; unsubscribe(); sdk?.dispose(); connection.dispose(); core.dispose(); },
      async snapshot() {
        current(); const [owner, attempts, quotes] = await Promise.all([journal.readOwner(), journal.list(), preparations.list()]); current();
        return { owner, attempts, preparations: quotes };
      },
      async bind() {
        current(); const ticket = await journal.prepareBinding({ requestId: nextId(), sessionId: expected.sessionGeneration }); current();
        if (!ticket.mayExecute || !ticket.execute) return unavailable(); const result = await ticket.execute(send); current(); return result;
      },
      async prepareQuote(quote: TestStoreQuote) {
        current(); const requestId = nextId(), reviewed = Object.freeze({ ...quote });
        const ticket = await preparations.prepareNew({ requestId, sessionId: expected.sessionGeneration, quote: reviewed });
        if (!ticket.mayDispatch || !ticket.dispatch) return unavailable();
        const result = await ticket.dispatch(async () => {
          if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) throw new IsolatedSandboxCommerceError("authority_retired", requestId, "not_dispatched");
          return core.prepareCheckout(requestId, { offerId: reviewed.offerId, expectedRevision: reviewed.offerRevision });
        });
        current(); return result.intentId ? recoverPreparation(requestId) : result;
      },
      recoverPreparation,
      async closePreparation(preparation: TestStoreV2Preparation) {
        current(); const originalRequestId = preparation.requestId, readId = nextId(), response = await core.request("request.read", readId, { originalRequestId }); current();
        const observed = await preparations.observeForAbandon(originalRequestId, response, { requestId: readId, sessionGeneration: expected.sessionGeneration }); current();
        if (!observed.mayRequestAbandon || !observed.attempt.intentId) return unavailable();
        const requestId = nextId(), intentId = observed.attempt.intentId;
        const ticket = await preparations.prepareAbandon({ requestId, sessionId: expected.sessionGeneration, originalRequestId, intentId });
        if (!ticket.mayDispatch || !ticket.dispatch) return unavailable();
        const result = await ticket.dispatch(async () => {
          if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) throw new IsolatedSandboxCommerceError("authority_retired", requestId, "not_dispatched");
          return core.request("checkout.abandon", requestId, { intentId, originalRequestId });
        }); current(); return result;
      },
      async allocate(preparation: TestStoreV2Preparation) {
        current(); const confirmed = await recoverPreparation(preparation.requestId); current();
        if (confirmed.state !== "intent_prepared" || !confirmed.intentId || confirmed.sessionGeneration !== expected.sessionGeneration) return unavailable();
        const ticket = await journal.prepareAllocation({ requestId: nextId(), sessionId: expected.sessionGeneration, intentId: confirmed.intentId, quote: confirmed.quote }); current();
        if (!ticket.mayExecute || !ticket.execute) return unavailable(); const result = await ticket.execute(send); current(); return result;
      },
      recover,
      async recoverBinding() {
        current(); const owner = await journal.readOwner(); current();
        const allocation = owner.bindingObservation?.allocation; if (!allocation) return unavailable();
        const requestId = nextId(), payload = { intentId: allocation.intentId };
        const result = await connection.request("read", requestId, payload); current();
        const saved = await journal.reconcileBinding({ requestId, sessionId: expected.sessionGeneration, payload }, result); current(); return saved;
      },
      async purchase(attempt: IsolatedTestStoreV2Attempt, onNativePending?: () => void) {
        current(); const latest = await recover(attempt); current();
        const owner = await journal.readOwner(); current();
        if (installation.processRetired || !owner.customer || !latest.allocation?.registration || latest.observation?.status !== "offering_ready"
          || owner.reservation?.activeAllocationId !== latest.allocation.id || latest.operations.some(o => o.command === "claim")) return unavailable();
        sdk ??= await captureIsolatedTestStoreV2Sdk(expected, owner.customer); current();
        const selected = await sdk.prepare(latest.allocation); current();
        if (!selected) throw new Error("isolated_test_store_v2_package_unavailable");
        const ticket = await journal.prepareClaim({ requestId: nextId(), sessionId: expected.sessionGeneration, allocationId: latest.allocation.id }); current();
        if (!ticket.mayExecute || !ticket.execute) return unavailable(); const claimed = await ticket.execute(send); current();
        if (!claimed.purchase) return claimed.attempt;
        const done = await claimed.purchase(async (_customer, _allocation, claim) => {
          current(); const pending = sdk!.purchase(claim); onNativePending?.();
          const result = await pending; current(); return result;
        }); current();
        if (done.nativePhase !== "completed") return done;
        const report = await journal.prepareReport({ requestId: nextId(), sessionId: expected.sessionGeneration, allocationId: latest.allocation.id }); current();
        if (report.mayExecute && report.execute) { const result = await report.execute(send); current(); return result.attempt; }
        return done;
      },
      async advance(attempt: IsolatedTestStoreV2Attempt, acknowledgeUnknownOutcome: boolean) {
        current(); const latest = await recover(attempt); current(); const owner = await journal.readOwner(); current();
        if (!latest.allocation || !owner.reservation) return unavailable();
        const ticket = await journal.prepareAdvance({ requestId: nextId(), sessionId: expected.sessionGeneration, allocationId: latest.allocation.id,
          expectedReservationRevision: owner.reservation.revision, acknowledgeUnknownOutcome }, nativeRead); current();
        if (!ticket.mayExecute || !ticket.execute) return unavailable(); const result = await ticket.execute(send); current(); return result;
      },
    });
  } catch (error) { retired = true; unsubscribe(); client?.dispose(); coreClient?.dispose(); (sdk as IsolatedTestStoreV2Sdk | null)?.dispose(); throw error; }
}
export type IsolatedTestStoreV2Actions = Awaited<ReturnType<typeof captureIsolatedTestStoreV2Actions>>;
