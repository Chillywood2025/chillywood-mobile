import { Share } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { captureIsolatedPaidVideoV2Client, IsolatedPaidVideoV2Error, newPaidVideoV2RequestId, paidVideoId, paidVideoUuid,
  type IsolatedPaidVideoV2Client, type PaidVideoV2Data, type PaidVideoV2Mutation, type PaidVideoV2Offer, type PaidVideoV2Payloads, type PaidVideoV2Resource, type PaidVideoV2Upload } from "./isolatedPaidVideoV2";
import { createIsolatedPaidVideoV2AttemptJournal, type IsolatedPaidVideoV2Attempt } from "./isolatedPaidVideoV2Attempts";
import { capturePaidVideoV2TransferClient, IsolatedPaidVideoTransferError, type PaidVideoV2TransferClient } from "./isolatedPaidVideoTransfer";
import { createIsolatedPaidVideoTransferJournal, type PaidVideoTransferAttempt } from "./isolatedPaidVideoTransferAttempts";
import { capturePaidVideoFilePicker, type PaidVideoFileExpectation, type PaidVideoFileLease } from "./isolatedPaidVideoFiles";
import { formatPaidVideoOfferCode, parsePaidVideoOfferCode } from "./isolatedPaidVideoOfferCode";

export type PaidVideoV2View = Readonly<{ page: "home" | "studio" | "upload" | "offer" | "history" | "status"; id?: string }>;
export type PaidVideoV2Presentation = Readonly<{
  capabilityExpiresAtMs: number; transfers: readonly PaidVideoTransferAttempt[]; transferReady: boolean; busy: boolean; retired: boolean; journalReady: boolean; notice: string | null; requestId: string | null;
  capability: PaidVideoV2Data["capability.read"] | null; uploads: readonly PaidVideoV2Upload[]; nextCursor: string | null;
  upload: PaidVideoV2Upload | null; resource: PaidVideoV2Resource | null; offer: PaidVideoV2Offer | null;
  attempts: readonly IsolatedPaidVideoV2Attempt[]; file: PaidVideoFileExpectation | null;
}>;
const initial: PaidVideoV2Presentation = { capabilityExpiresAtMs: 0, transfers: [], transferReady: false, busy: false, retired: false, journalReady: false, notice: null, requestId: null,
  capability: null, uploads: [], nextCursor: null, upload: null, resource: null, offer: null, attempts: [], file: null };
const unresolved = (attempts: readonly IsolatedPaidVideoV2Attempt[]) => attempts.some(a => a.state === "prepared" || a.state === "unknown");

/** Owns one exact session and serializes every local/read/write operation. A
 * discarded screen incarnation cannot revive this owner. Acknowledged requests
 * are shown separately from current server media/moderation/publication facts. */
export async function capturePaidVideoV2Actions(authority: AccountSessionAuthorityBinding, view: PaidVideoV2View,
  onChange: (state: PaidVideoV2Presentation) => void) {
  const expected = Object.freeze({ ...authority }); let retired = false, busy = false;
  let state = initial, client: IsolatedPaidVideoV2Client | null = null, file: PaidVideoFileLease | null = null;
  const transferJournal = createIsolatedPaidVideoTransferJournal({ userId: expected.userId }); let transferClient: PaidVideoV2TransferClient | null = null;
  const journal = createIsolatedPaidVideoV2AttemptJournal({ userId: expected.userId });
  const picker = capturePaidVideoFilePicker(expected);
  const publish = (next: Partial<PaidVideoV2Presentation>) => { state = Object.freeze({ ...state, ...next }); onChange(state); };
  const retire = () => { if (retired) return; retired = true; file?.dispose(); file = null; picker.dispose(); client?.dispose(); transferClient?.dispose();
    publish({ ...initial, retired: true, notice: "Your account session changed. Reopen this view to check current history." }); };
  const current = () => {
    if (retired || expected.restoreOnly || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) {
      retire(); return false;
    } return true;
  };
  const unsubscribe = subscribeToAccountSessionAuthority(value => { if (!sameAccountSessionAuthority(expected, value)) retire(); });
  try { client = await captureIsolatedPaidVideoV2Client(expected); transferClient = await capturePaidVideoV2TransferClient(expected); if (!current()) throw new IsolatedPaidVideoV2Error("authority_retired", null, "not_sent"); }
  catch (error) { retire(); unsubscribe(); throw error; }
  async function local() {
    try { const transfers = await transferJournal.list(); if (current()) publish({ transfers, transferReady: true }); }
    catch { if (current()) publish({ transferReady: false, notice: "Saved transfers could not be read. New uploads are unavailable until local recovery is restored." }); }
    try { const attempts = await journal.list(); if (current()) publish({ attempts, journalReady: true }); }
    catch { if (current()) publish({ journalReady: false, notice: "Saved actions could not be read. New actions are unavailable; current server history can still be checked." }); }
  }
  async function read<C extends keyof PaidVideoV2Payloads>(command: C, payload: PaidVideoV2Payloads[C]) {
    if (!current() || !client) throw new IsolatedPaidVideoV2Error("authority_retired", null, "not_sent");
    const response = await client.request(command, newPaidVideoV2RequestId(), payload);
    if (!current()) throw new IsolatedPaidVideoV2Error("authority_retired", response.requestId, "unknown");
    if (response.status !== "ok") throw new Error("paid_video_read_unavailable");
    publish({ capabilityExpiresAtMs: response.capabilityExpiresAtMs }); return response.data;
  }
  async function loadUpload(uploadId: string) {
    if (!current() || !client) throw new Error("upload_read_unavailable");
    const requestId = newPaidVideoV2RequestId(), response = await client.request("upload.read", requestId, { uploadId });
    if (!current() || response.status !== "ok") throw new Error("upload_read_unavailable");
    try { await transferJournal.adoptRetained(response, { requestId, uploadId, currentSessionGeneration: expected.sessionGeneration,
      currentConfigurationDigest: client.configurationDigest }); await local(); }
    catch { if (current()) publish({ transferReady: false, notice: "The retained transfer could not be saved locally. Upload actions remain unavailable; server history was not changed." }); }
    if (!current()) throw new Error("upload_read_retired");
    publish({ capabilityExpiresAtMs: response.capabilityExpiresAtMs }); return response.data.upload;
  }
  async function load() {
    publish({ capability: null, uploads: [], nextCursor: null, upload: null, resource: null, offer: null });
    await local(); if (!current()) return;
    if (view.page === "home" || view.page === "studio") {
      const capability = await read("capability.read", {}); if (current()) publish({ capability });
    }
    if (view.page === "studio" || view.page === "history") {
      const data = await read("studio.read", { limit: 50, cursor: null }); if (current()) publish({ uploads: data.uploads, nextCursor: data.nextCursor });
    }
    if (view.page === "upload") {
      if (!paidVideoId(view.id, "upload")) throw new Error("invalid_view");
      const upload = await loadUpload(view.id);
      const resource = await read("resource.read", { resourceId: upload.resourceId });
      if (current()) publish({ upload: resource.upload, resource: resource.resource, offer: resource.offer ?? null });
    }
    if (view.page === "offer") {
      if (!paidVideoId(view.id, "offer")) throw new Error("invalid_view");
      const data = await read("offer.read", { offerId: view.id }); if (current()) publish({ offer: data.offer, upload: data.upload ?? null });
    }
    if (view.page === "status") await recover(view.id ?? "");
  }
  async function recover(originalRequestId: string) {
    if (!paidVideoUuid(originalRequestId) || !client || !current()) throw new Error("invalid_recovery");
    const requestId = newPaidVideoV2RequestId();
    const response = await client.request("upload.recover", requestId, { originalRequestId }); if (!current()) return;
    // Missing records remain unknown. This call never resends the old mutation.
    if (state.attempts.some(a => a.requestId === originalRequestId)) {
      await journal.reconcile(originalRequestId, response, { requestId, sessionGeneration: expected.sessionGeneration, configurationDigest: client.configurationDigest });
      await local(); if (!current()) return;
    }
    if (response.status === "ok") publish({ upload: response.data.upload, offer: response.data.offer ?? null, requestId: originalRequestId,
      notice: "The server recorded this authoring request. Current scan and moderation state are shown below." });
    else publish({ upload: null, resource: null, offer: null, requestId: originalRequestId,
      notice: "The outcome is still unknown. No new copy of this action was sent. A missing recovery record does not prove the action was never applied." });
  }
  async function exclusive(operation: () => Promise<void>) {
    if (busy || !current()) return; busy = true; publish({ busy: true, notice: null });
    try { await operation(); }
    catch { if (current()) publish({ notice: "This view could not be verified. Check status again; unresolved actions are never automatically repeated." }); }
    finally { busy = false; if (current()) publish({ busy: false }); }
  }
  async function mutate<C extends PaidVideoV2Mutation>(command: C, payload: PaidVideoV2Payloads[C]) {
    if (!current() || !client || !state.journalReady || unresolved(state.attempts)) throw new Error("new_action_unavailable");
    const requestId = newPaidVideoV2RequestId(); let prepared: Awaited<ReturnType<typeof journal.prepare>> | null = null;
    try {
      prepared = await journal.prepare({ command, requestId, payload, sessionGeneration: expected.sessionGeneration, configurationDigest: client.configurationDigest });
      if (!prepared.mayDispatch) throw new Error("old_action_unavailable");
      if (!current()) throw new IsolatedPaidVideoV2Error("authority_retired", requestId, "not_sent");
      const response = await client.request(command, requestId, payload);
      const settled = await journal.reconcile(requestId, response); if (!current()) return;
      await local(); if (!current()) return;
      publish({ requestId, notice: settled.state === "not_applied"
        ? "The server did not apply this action because its required connection is unavailable. Your existing records are retained."
        : "The server recorded this authoring request. This does not establish a completed upload, purchase or playback grant." });
      if (response.status === "ok") publish({ upload: response.data.upload, resource: null, offer: "offer" in response.data ? response.data.offer : null });
      // Retain selected bytes only in this exact screen owner. Restart requires
      // explicit reselection of bytes matching the server-owned immutable tuple.
    } catch (error) {
      let stopped = false;
      if (prepared?.mayDispatch && prepared.stopBeforeDispatch) { try { await prepared.stopBeforeDispatch(error); stopped = true; } catch { /* Unknown stays retained. */ } }
      if (prepared?.mayDispatch && !stopped) await journal.markUnknown(requestId).catch(() => undefined);
      await local(); if (current()) publish({ requestId: prepared?.mayDispatch ? requestId : null,
        notice: prepared?.mayDispatch && !stopped ? "This action is unconfirmed. Check its status before starting another action; it will not be automatically repeated."
          : "A new action was not sent. Saved actions and local storage must be available before continuing." });
    }
  }
  async function transfer() {
    const upload = state.upload, selected = file;
    if (!current() || !client || !transferClient || !state.transferReady || !state.journalReady || unresolved(state.attempts) || !upload || !selected
      || state.transfers.some(t => t.upload.id === upload.id && t.state !== "not_applied")
      || selected.expectation.expectedSha256 !== upload.expectedSha256 || selected.expectation.expectedByteLength !== upload.expectedByteLength) throw new Error("transfer_unavailable");
    const requestId = newPaidVideoV2RequestId(); let prepared: Awaited<ReturnType<typeof transferJournal.prepare>> | null = null; let bytes: Uint8Array<ArrayBuffer> | null = null;
    try {
      prepared = await transferJournal.prepare({ requestId, sessionGeneration: expected.sessionGeneration, configurationDigest: client.configurationDigest,
        upload: { id: upload.id, incarnation: upload.incarnation, expectedSha256: upload.expectedSha256, expectedByteLength: upload.expectedByteLength } });
      if (!prepared.mayPut) throw new Error("old_transfer_unavailable");
      if (!current()) throw new IsolatedPaidVideoTransferError("authority_retired", requestId, "not_sent");
      bytes = selected.takeBytes(); file = null; publish({ file: null });
      const response = await transferClient.put({ userId: expected.userId, sessionGeneration: expected.sessionGeneration, originalSessionId: expected.sessionGeneration,
        configurationDigest: client.configurationDigest, originalConfigurationDigest: client.configurationDigest, requestId, upload: prepared.attempt.upload }, bytes);
      await transferJournal.recordPut(requestId, response); await local(); if (!current()) return;
      publish({ notice: "The transfer response is not byte verification. Verify the stored file before requesting a scan. This transfer will not be sent again." });
    } catch (error) {
      let stopped = false;
      if (prepared?.mayPut && prepared.stopBeforePut) { try { await prepared.stopBeforePut(error); stopped = true; } catch { /* Unknown remains retained. */ } }
      if (prepared?.mayPut && !stopped) await transferJournal.markUnknown(requestId).catch(() => undefined);
      await local(); if (current()) publish({ notice: stopped ? "No file transfer was sent. Refresh availability and select the matching file before a new explicit attempt."
        : "The transfer could not be confirmed. Recover the original transfer by reading its stored bytes; do not send the file again." });
    } finally { bytes?.fill(0); }
  }
  async function verifyTransfer(requestId: string) {
    if (!current() || !client || !transferClient) return;
    const entries = await transferJournal.list(); if (!current()) return;
    const attempt = entries.find(t => t.requestId === requestId); if (!attempt || attempt.state === "not_applied") throw new Error("transfer_missing");
    const binding = { sessionGeneration: expected.sessionGeneration, configurationDigest: client.configurationDigest };
    const context = { userId: expected.userId, ...binding, requestId, originalSessionId: attempt.sessionGeneration, originalConfigurationDigest: attempt.configurationDigest, upload: attempt.upload };
    try {
      const observed = await transferClient.probe(context); if (!current()) return;
      if (observed.protocol === "scpv-object-receipt-v2") await transferJournal.recordReceipt(requestId, observed, binding);
      else {
        // Save the pending reconciliation before its POST. Restart always begins
        // with a new read, never a replay of the old PUT or an old signed proof.
        await transferJournal.recordProbe(requestId, observed, binding); if (!current()) return;
        const receipt = await transferClient.reconcile(context, observed);
        await transferJournal.recordReceipt(requestId, receipt, binding);
      }
      await local(); if (current()) publish({ notice: "The server recorded the exact stored bytes. A scan and moderation decision are still required; this receipt grants no playback access." });
    } catch { await transferJournal.markUnknown(requestId).catch(() => undefined); await local();
      if (current()) publish({ notice: "Stored-byte verification is still unconfirmed. Read the original transfer again; no upload or old reconciliation will be automatically repeated." }); }
  }
  return Object.freeze({
    snapshot: () => state,
    dispose() { retire(); unsubscribe(); },
    refresh: () => exclusive(load),
    transfer: () => exclusive(transfer),
    verifyTransfer: (requestId: string) => exclusive(() => verifyTransfer(requestId)),
    openOfferCode: (value: string, open: (offerId: string) => void) => exclusive(async () => {
      const offerId = parsePaidVideoOfferCode(value);
      if (!offerId) { publish({ notice: "Enter the complete sandbox offer code shared by its creator." }); return; }
      const data = await read("offer.read", { offerId }); if (!current()) return;
      if (data.offer.status !== "published" || !data.offer.checkoutAvailable) {
        publish({ notice: "This offer is not currently available for sandbox checkout. No purchase was started." }); return;
      }
      // This is navigation to a new authenticated price/asset review. The
      // checkout controller independently rechecks current preparation authority.
      open(offerId);
    }),
    shareOffer: () => exclusive(async () => {
      const offer = state.offer;
      if (!offer || !state.upload) throw new Error("share_offer_unavailable");
      const fresh = await read("offer.read", { offerId: offer.id }); if (!current()) return;
      // Owner-only upload projection proves this is the creator's current
      // published offer; never share a retained draft or stale publication.
      if (fresh.offer.status !== "published" || !fresh.upload || fresh.upload.id !== state.upload.id) {
        publish({ notice: "Only a current published sandbox offer can be shared." }); return;
      }
      await Share.share({ title: "Chi’llywood sandbox video offer", message: formatPaidVideoOfferCode(fresh.offer.id) });
      if (current()) publish({ notice: "The share sheet closed. The buyer can enter the sandbox code to read the current offer; sharing does not purchase it." });
    }),
    loadMore: () => exclusive(async () => { const cursor = state.nextCursor; if (!cursor) return;
      const data = await read("studio.read", { limit: 50, cursor }); if (!current()) return;
      const byId = new Map(state.uploads.map(u => [u.id, u])); for (const u of data.uploads) byId.set(u.id, u);
      publish({ uploads: [...byId.values()], nextCursor: data.nextCursor }); }),
    chooseFile: () => exclusive(async () => { const selected = await picker.choose(); if (!current()) { selected?.dispose(); return; }
      if (selected) { file?.dispose(); file = selected; publish({ file: selected.expectation, notice: "File inspected locally. Server byte verification, scanning and moderation are still required." }); } }),
    reserve: (title: string) => exclusive(async () => {
      const capability = await read("capability.read", {}); if (current()) publish({ capability });
      if (!file || !capability.creatorEligible || !capability.uploadRouteAvailable || state.capabilityExpiresAtMs <= Date.now()) throw new Error("reservation_unavailable");
      await mutate("upload.reserve", { title, expectedSha256: file.expectation.expectedSha256, expectedByteLength: file.expectation.expectedByteLength }); }),
    finalize: () => exclusive(async () => { if (!state.upload || !["reserved", "scan_pending"].includes(state.upload.state) || !state.transfers.some(t => t.upload.id === state.upload!.id && t.state === "recorded")) throw new Error("finalization_unavailable");
      await mutate("upload.finalize", { uploadId: state.upload.id }); }),
    publishOffer: (amountMinor: number) => exclusive(async () => {
      const upload = state.upload, resource = state.resource;
      if (!upload || !resource || upload.state !== "clean" || !upload.bytesClean || upload.moderation !== "clear" || resource.status !== "draft") throw new Error("publication_unavailable");
      await mutate("offer.publish", { uploadId: upload.id, expectedRevision: resource.revision, amountMinor, currency: "usd" }); }),
    retireOffer: () => exclusive(async () => { const offer = state.offer; if (!offer || !state.upload || offer.status !== "published") throw new Error("retirement_unavailable");
      await mutate("offer.retire", { offerId: offer.id, expectedRevision: offer.revision }); }),
    recover: (requestId: string) => exclusive(async () => { await local(); await recover(requestId); }),
  });
}
export type PaidVideoV2Actions = Awaited<ReturnType<typeof capturePaidVideoV2Actions>>;
