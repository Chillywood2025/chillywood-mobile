import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { captureIsolatedPaidVideoClient, IsolatedPaidVideoError, newPaidVideoRequestId, paidVideoId, paidVideoUuid,
  type IsolatedPaidVideoClient, type PaidVideoData, type PaidVideoMutation, type PaidVideoOffer, type PaidVideoPayloads, type PaidVideoResource, type PaidVideoUpload } from "./isolatedPaidVideo";
import { createIsolatedPaidVideoAttemptJournal, type IsolatedPaidVideoAttempt } from "./isolatedPaidVideoAttempts";
import { capturePaidVideoFilePicker, type PaidVideoFileExpectation, type PaidVideoFileLease, type PaidVideoFileSelection } from "./isolatedPaidVideoFiles";

export type PaidVideoView = Readonly<{ page: "home" | "studio" | "upload" | "offer" | "history" | "status"; id?: string }>;
export type PaidVideoPresentation = Readonly<{
  busy: boolean; retired: boolean; journalReady: boolean; notice: string | null; requestId: string | null;
  capability: PaidVideoData["capability.read"] | null; uploads: readonly PaidVideoUpload[]; nextCursor: string | null;
  upload: PaidVideoUpload | null; resource: PaidVideoResource | null; offer: PaidVideoOffer | null;
  attempts: readonly IsolatedPaidVideoAttempt[]; file: PaidVideoFileExpectation | null;
}>;
const initial: PaidVideoPresentation = { busy: false, retired: false, journalReady: false, notice: null, requestId: null,
  capability: null, uploads: [], nextCursor: null, upload: null, resource: null, offer: null, attempts: [], file: null };
const unresolved = (attempts: readonly IsolatedPaidVideoAttempt[]) => attempts.some(a => a.state === "prepared" || a.state === "unknown");

/** Owns one exact session and serializes every local/read/write operation. A
 * discarded screen incarnation cannot revive this owner. Acknowledged requests
 * are shown separately from current server media/moderation/publication facts. */
export async function capturePaidVideoActions(authority: AccountSessionAuthorityBinding, view: PaidVideoView,
  onChange: (state: PaidVideoPresentation) => void) {
  const expected = Object.freeze({ ...authority }); let retired = false, busy = false;
  let state = initial, client: IsolatedPaidVideoClient | null = null, file: PaidVideoFileLease | null = null;
  const journal = createIsolatedPaidVideoAttemptJournal({ userId: expected.userId });
  const picker = capturePaidVideoFilePicker(expected);
  const publish = (next: Partial<PaidVideoPresentation>) => { state = Object.freeze({ ...state, ...next }); onChange(state); };
  const retire = () => { if (retired) return; retired = true; file?.dispose(); file = null; picker.dispose(); client?.dispose();
    publish({ ...initial, retired: true, notice: "Your account session changed. Reopen this view to check current history." }); };
  const current = () => {
    if (retired || expected.restoreOnly || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) {
      retire(); return false;
    } return true;
  };
  const unsubscribe = subscribeToAccountSessionAuthority(value => { if (!sameAccountSessionAuthority(expected, value)) retire(); });
  try { client = await captureIsolatedPaidVideoClient(expected); if (!current()) throw new IsolatedPaidVideoError("authority_retired", null, "not_sent"); }
  catch (error) { retire(); unsubscribe(); throw error; }
  async function local() {
    try { const attempts = await journal.list(); if (current()) publish({ attempts, journalReady: true }); }
    catch { if (current()) publish({ journalReady: false, notice: "Saved actions could not be read. New actions are unavailable; current server history can still be checked." }); }
  }
  async function read<C extends keyof PaidVideoPayloads>(command: C, payload: PaidVideoPayloads[C]) {
    if (!current() || !client) throw new IsolatedPaidVideoError("authority_retired", null, "not_sent");
    const response = await client.request(command, newPaidVideoRequestId(), payload);
    if (!current()) throw new IsolatedPaidVideoError("authority_retired", response.requestId, "unknown");
    if (response.status !== "ok") throw new Error("paid_video_read_unavailable");
    return response.data;
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
      const { upload } = await read("upload.read", { uploadId: view.id });
      const resource = await read("resource.read", { resourceId: upload.resourceId });
      if (current()) publish({ upload: resource.upload, resource: resource.resource });
    }
    if (view.page === "offer") {
      if (!paidVideoId(view.id, "offer")) throw new Error("invalid_view");
      const data = await read("offer.read", { offerId: view.id }); if (current()) publish({ offer: data.offer, upload: data.upload ?? null });
    }
    if (view.page === "status") await recover(view.id ?? "");
  }
  async function recover(originalRequestId: string) {
    if (!paidVideoUuid(originalRequestId) || !client || !current()) throw new Error("invalid_recovery");
    const requestId = newPaidVideoRequestId();
    const response = await client.request("upload.recover", requestId, { originalRequestId }); if (!current()) return;
    // Missing records remain unknown. This call never resends the old mutation.
    if (state.attempts.some(a => a.requestId === originalRequestId)) {
      await journal.reconcile(originalRequestId, response, { requestId, sessionGeneration: expected.sessionGeneration });
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
  async function mutate<C extends PaidVideoMutation>(command: C, payload: PaidVideoPayloads[C]) {
    if (!current() || !client || !state.journalReady || unresolved(state.attempts)) throw new Error("new_action_unavailable");
    const requestId = newPaidVideoRequestId(); let prepared: Awaited<ReturnType<typeof journal.prepare>> | null = null;
    try {
      prepared = await journal.prepare({ command, requestId, payload, sessionGeneration: expected.sessionGeneration });
      if (!prepared.mayDispatch) throw new Error("old_action_unavailable");
      if (!current()) throw new IsolatedPaidVideoError("authority_retired", requestId, "not_sent");
      const response = await client.request(command, requestId, payload);
      const settled = await journal.reconcile(requestId, response); if (!current()) return;
      await local(); if (!current()) return;
      publish({ requestId, notice: settled.state === "not_applied"
        ? "The server did not apply this action because its required connection is unavailable. Your existing records are retained."
        : "The server recorded this authoring request. This does not establish a completed upload, purchase or playback grant." });
      if (response.status === "ok") publish({ upload: response.data.upload, resource: null, offer: "offer" in response.data ? response.data.offer : null });
      if (command === "upload.reserve" && settled.state === "completed") { file?.dispose(); file = null; publish({ file: null }); }
    } catch (error) {
      let stopped = false;
      if (prepared?.mayDispatch && prepared.stopBeforeDispatch) { try { await prepared.stopBeforeDispatch(error); stopped = true; } catch { /* Unknown stays retained. */ } }
      if (prepared?.mayDispatch && !stopped) await journal.markUnknown(requestId).catch(() => undefined);
      await local(); if (current()) publish({ requestId: prepared?.mayDispatch ? requestId : null,
        notice: prepared?.mayDispatch && !stopped ? "This action is unconfirmed. Check its status before starting another action; it will not be automatically repeated."
          : "A new action was not sent. Saved actions and local storage must be available before continuing." });
    }
  }
  return Object.freeze({
    snapshot: () => state,
    dispose() { retire(); unsubscribe(); },
    refresh: () => exclusive(load),
    loadMore: () => exclusive(async () => { const cursor = state.nextCursor; if (!cursor) return;
      const data = await read("studio.read", { limit: 50, cursor }); if (!current()) return;
      const byId = new Map(state.uploads.map(u => [u.id, u])); for (const u of data.uploads) byId.set(u.id, u);
      publish({ uploads: [...byId.values()], nextCursor: data.nextCursor }); }),
    chooseFile: (select: PaidVideoFileSelection) => exclusive(async () => { const selected = await select(picker.choose); if (!current()) { selected?.dispose(); return; }
      if (selected) { file?.dispose(); file = selected; publish({ file: selected.expectation, notice: "File inspected locally. Server byte verification, scanning and moderation are still required." }); } }),
    reserve: (title: string) => exclusive(async () => {
      if (!file || !state.capability?.creatorEligible || !state.capability.uploadRouteAvailable) throw new Error("reservation_unavailable");
      await mutate("upload.reserve", { title, expectedSha256: file.expectation.expectedSha256, expectedByteLength: file.expectation.expectedByteLength }); }),
    finalize: () => exclusive(async () => { if (!state.upload || state.upload.state !== "scan_pending") throw new Error("finalization_unavailable");
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
export type PaidVideoActions = Awaited<ReturnType<typeof capturePaidVideoActions>>;
