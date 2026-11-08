import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { capturePaidVideoCheckoutV3Client, newPaidVideoCheckoutV3RequestId, PaidVideoCheckoutV3Error } from "./isolatedPaidVideoCheckoutV3";
import { captureIsolatedTestStoreV3Client } from "./isolatedTestStoreV3";
import { createIsolatedTestStoreV3AttemptJournal, type IsolatedTestStoreV3Attempt, type TestStoreV3AttemptStorage, type TestStoreV3JournalRequest } from "./isolatedTestStoreV3Attempts";
import { createIsolatedTestStoreV3Preparations, type TestStoreV3Preparation } from "./isolatedTestStoreV3Preparations";
import { inspectIsolatedTestStoreV3Installation, readIsolatedTestStoreV3Build, readIsolatedTestStoreV3NativeInvocation } from "./isolatedTestStoreV3Build";
import { captureIsolatedTestStoreV3Sdk, type IsolatedTestStoreV3Sdk } from "./isolatedTestStoreV3Sdk";
import { sameTestStoreV3Quote, type TestStoreV3Quote } from "./isolatedTestStoreV3Contract";
import { createTestStoreV3PreparedClosureJournal } from "./isolatedTestStoreV3PreparedClosures";

const unavailable = (): never => { throw new Error("isolated_test_store_v3_actions_unavailable"); };
/** Current-session actions over real transport, durable journals and native
 * ownership. None of the recovery methods reconstructs a mutation ticket. */
export async function captureIsolatedTestStoreV3Actions(authority: AccountSessionAuthorityBinding, options: { storage?: TestStoreV3AttemptStorage; nextRequestId?(): string } = {}) {
  const expected = Object.freeze({ ...authority }), build = readIsolatedTestStoreV3Build(); let retired = false;
  if (!build || authority.restoreOnly || authority.userId !== authority.accountId || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return unavailable();
  const unsubscribe = subscribeToAccountSessionAuthority(next => { if (!sameAccountSessionAuthority(expected, next)) retired = true; });
  const current = () => { if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) return unavailable(); };
  const nextId = options.nextRequestId ?? newPaidVideoCheckoutV3RequestId;
  let client: Awaited<ReturnType<typeof captureIsolatedTestStoreV3Client>> | null = null;
  let coreClient: Awaited<ReturnType<typeof capturePaidVideoCheckoutV3Client>> | null = null;
  let sdk: IsolatedTestStoreV3Sdk | null = null;
  try {
    const installation = await inspectIsolatedTestStoreV3Installation(); current();
    if (installation.customer && installation.customer.buyerId !== expected.userId) return unavailable();
    client = await captureIsolatedTestStoreV3Client(expected, build.configId); current();
    coreClient = await capturePaidVideoCheckoutV3Client(expected, build.configId); current();
    const connection = client, core = coreClient;
    const scope = { userId: expected.userId, configurationDigest: build.configId, installationId: installation.installationId, ...(options.storage ? { storage: options.storage } : {}) };
    const journal = createIsolatedTestStoreV3AttemptJournal(scope), preparations = createIsolatedTestStoreV3Preparations(scope), preparedClosures = createTestStoreV3PreparedClosureJournal(scope);
    const send = async (request: Readonly<TestStoreV3JournalRequest>) => {
      current(); if (request.expectedSessionId !== expected.sessionGeneration || request.configurationDigest !== build.configId) return unavailable();
      const result = await connection.request(request.command, request.requestId, request.payload); current(); return result;
    };
    const nativeRead = async (dispatchId: string) => { current(); const result = await readIsolatedTestStoreV3NativeInvocation(dispatchId); current(); return result; };
    const recoverPreparation = async (requestId: string) => {
      current(); const readId = nextId(); const result = await core.request("recover", readId, { originalRequestId: requestId }); current();
      const saved = await preparations.reconcile(requestId, result, { requestId: readId, sessionGeneration: expected.sessionGeneration }); current(); return saved;
    };
    const recover = async (attempt: IsolatedTestStoreV3Attempt) => {
      current(); const requestId = nextId(), payload = { intentId: attempt.intentId };
      const result = await connection.request("read", requestId, payload); current();
      let saved = await journal.reconcile({ requestId, sessionId: expected.sessionGeneration, payload }, result); current();
      if (saved.allocation) {
        try { saved = await journal.reconcileNative(saved.allocation.id, nativeRead); }
        catch { current(); /* No native completion is inferred from a missing or pending record. */ }
      }
      current(); return saved;
    };
    const recoverPreparedClosure = async (originalRequestId: string) => {
      current(); const requestId = nextId(), response = await core.request("recover_close_prepared", requestId, { originalRequestId }); current();
      const saved = await preparedClosures.reconcile(originalRequestId, response, { requestId, sessionId: expected.sessionGeneration }); current();
      if (saved.state === "closed") { await journal.recordPreparedRelease(saved.nativeClosure.invocation.allocationId, saved); current(); }
      return saved;
    };
    return Object.freeze({
      installationId: installation.installationId, nativeProcessRetired: installation.processRetired,
      dispose() { retired = true; unsubscribe(); sdk?.dispose(); connection.dispose(); core.dispose(); },
      async snapshot() {
        current(); const [owner, attempts, quotes, closures] = await Promise.all([journal.readOwner(), journal.list(), preparations.list(), preparedClosures.list()]); current();
        return { owner, attempts, preparations: quotes, preparedClosures: closures };
      },
      async bind() {
        current(); const ticket = await journal.prepareBinding({ requestId: nextId(), sessionId: expected.sessionGeneration }); current();
        if (!ticket.mayExecute || !ticket.execute) return unavailable(); const result = await ticket.execute(send); current(); return result;
      },
      async prepareQuote(quote: TestStoreV3Quote) {
        current(); const requestId = nextId(), reviewed = JSON.parse(JSON.stringify(quote)) as TestStoreV3Quote;
        const availability = await core.request("offer", nextId(), { offerId: reviewed.offerId }); current();
        if (availability.status !== "ok" || !availability.data.preparationAllowed || !sameTestStoreV3Quote(availability.data.quote, reviewed)) return unavailable();
        const ticket = await preparations.prepareNew({ requestId, sessionId: expected.sessionGeneration, quote: reviewed });
        if (!ticket.mayDispatch || !ticket.dispatch) return unavailable();
        const result = await ticket.dispatch(async () => {
          if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) throw new PaidVideoCheckoutV3Error("authority_retired", requestId, "not_sent");
          return core.request("prepare", requestId, { offerId: reviewed.offerId, expectedQuote: reviewed });
        });
        current(); return result.intentId ? recoverPreparation(requestId) : result;
      },
      recoverPreparation,
      async closePreparation(preparation: TestStoreV3Preparation) {
        current(); const latest = await recoverPreparation(preparation.requestId); current();
        if (latest.state === "closed") return latest;
        const requestId = nextId(), ticket = await preparations.prepareAbandon({ requestId, sessionId: expected.sessionGeneration, originalRequestId: preparation.requestId }); current();
        if (!ticket.mayDispatch || !ticket.dispatch) return unavailable();
        const result = await ticket.dispatch(async payload => { current(); return core.request("abandon", requestId, payload); }); current(); return result;
      },
      async readOffer(offerId: string) { current(); const result = await core.request("offer", nextId(), { offerId }); current(); return result; },
      async history(cursor: string | null = null) { current(); const result = await core.request("history", nextId(), { limit: 25, cursor }); current(); return result; },
      async resolvePlayback(intentId: string) { current(); const result = await core.request("resolve_playback", nextId(), { intentId }); current(); return result; },
      async allocate(preparation: TestStoreV3Preparation) {
        current(); const confirmed = await recoverPreparation(preparation.requestId); current();
        if (confirmed.state !== "intent_prepared" || !confirmed.intentId || confirmed.sessionGeneration !== expected.sessionGeneration) return unavailable();
        const ticket = await journal.prepareAllocation({ requestId: nextId(), sessionId: expected.sessionGeneration, intentId: confirmed.intentId, quote: confirmed.quote }); current();
        if (!ticket.mayExecute || !ticket.execute) return unavailable(); const result = await ticket.execute(send); current(); return result;
      },
      recover,
      recoverPreparedClosure,
      async closePreparedAllocation(attempt: IsolatedTestStoreV3Attempt) {
        current(); const latest = await recover(attempt), owner = await journal.readOwner(); current();
        if (installation.processRetired || !owner.customer || !latest.allocation?.registration || !owner.reservation
          || !["prepared", "prepared_closed"].includes(latest.nativePhase)) return unavailable();
        sdk ??= await captureIsolatedTestStoreV3Sdk(expected, owner.customer); current();
        const nativeClosure = await sdk.closePrepared(latest.allocation); current();
        await journal.reconcileNative(latest.allocation.id, async () => nativeClosure); current();
        const prior = (await preparedClosures.list()).filter(a => a.payload.intentId === latest.intentId).at(-1); current();
        if (prior) {
          const recovered = await recoverPreparedClosure(prior.requestId); current();
          if (recovered.state === "closed") return recovered;
        }
        // A new explicit closure re-ack uses the same original allocation/CAS
        // tuple. No old mutation is resent; any old unknown record is retained.
        const payload = prior?.payload ?? { customerBindingId: owner.customer.id, intentId: latest.intentId, dispatchId: latest.allocation.dispatchId,
          registrationId: latest.allocation.registration.id, originalSessionId: latest.sessionId,
          expectedReservationRevision: owner.reservation.revision, expectedQuote: latest.quote };
        const requestId = nextId(), ticket = await preparedClosures.prepare({ requestId, sessionId: expected.sessionGeneration, payload, nativeClosure }); current();
        if (!ticket.mayDispatch || !ticket.dispatch) return unavailable();
        const closed = await ticket.dispatch(async exact => { current(); return core.request("close_prepared", requestId, exact); }); current();
        if (closed.state === "closed") { await journal.recordPreparedRelease(latest.allocation.id, closed); current(); }
        return closed;
      },
      async recoverBinding() {
        current(); const owner = await journal.readOwner(); current();
        const allocation = owner.bindingObservation?.allocation; if (!allocation) return unavailable();
        const requestId = nextId(), payload = { intentId: allocation.intentId };
        const result = await connection.request("read", requestId, payload); current();
        const saved = await journal.reconcileBinding({ requestId, sessionId: expected.sessionGeneration, payload }, result); current(); return saved;
      },
      async purchase(attempt: IsolatedTestStoreV3Attempt, onNativePending?: () => void) {
        current(); const latest = await recover(attempt); current();
        const owner = await journal.readOwner(); current();
        if (installation.processRetired || latest.sessionId !== expected.sessionGeneration || latest.nativePhase !== "unprepared" || !owner.customer || !latest.allocation?.registration || latest.observation?.status !== "offering_ready"
          || owner.reservation?.activeAllocationId !== latest.allocation.id || latest.operations.some(o => o.command === "claim")) return unavailable();
        sdk ??= await captureIsolatedTestStoreV3Sdk(expected, owner.customer); current();
        const selected = await sdk.prepare(latest.allocation); current();
        if (!selected) throw new Error("isolated_test_store_v3_package_unavailable");
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
      async advance(attempt: IsolatedTestStoreV3Attempt, acknowledgeUnknownOutcome: boolean) {
        current(); const latest = await recover(attempt); current(); const owner = await journal.readOwner(); current();
        if (!latest.allocation || !owner.reservation) return unavailable();
        const ticket = await journal.prepareAdvance({ requestId: nextId(), sessionId: expected.sessionGeneration, allocationId: latest.allocation.id,
          expectedReservationRevision: owner.reservation.revision, acknowledgeUnknownOutcome }, nativeRead); current();
        if (!ticket.mayExecute || !ticket.execute) return unavailable(); const result = await ticket.execute(send); current(); return result;
      },
    });
  } catch (error) { retired = true; unsubscribe(); client?.dispose(); coreClient?.dispose(); (sdk as IsolatedTestStoreV3Sdk | null)?.dispose(); throw error; }
}
export type IsolatedTestStoreV3Actions = Awaited<ReturnType<typeof captureIsolatedTestStoreV3Actions>>;
