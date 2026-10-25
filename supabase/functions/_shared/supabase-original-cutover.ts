import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Dependencies = {
  adminClient: any;
  supabaseUrl: string;
  fetcher?: typeof fetch;
  targetAllowed: (key: string) => Promise<boolean>;
  targetUrl: (method: "GET", key: string) => Promise<string>;
};

// A separate explicit operation, never implicit in copying. The SQL transaction
// rechecks the generation, holds, source snapshot, aliases and fresh scan enqueue
// after BOTH full reads. This function performs no PUT, DELETE or fabricated scan.
export async function cutoverSupabaseOriginal(receiptId: string, deps: Dependencies) {
  if (!UUID.test(receiptId)) throw new Error("copy_cutover_identity_invalid");
  const initial = await deps.adminClient.rpc("read_supabase_original_copy_cutover", {p_receipt_id: receiptId});
  if (typeof initial.error?.message === "string" && initial.error.message.includes("copy_cutover_source_size_metadata_mismatch")) {
    throw new Error("copy_cutover_source_size_metadata_mismatch");
  }
  const r = initial.data;
  if (initial.error || !r || r.receiptId !== receiptId) throw new Error("copy_cutover_not_ready");
  if (r.state === "committed") {
    if (r.sourceMatches !== true || !UUID.test(r.scanJobId)) throw new Error("copy_cutover_retry_conflict");
    return {state: "committed", receiptId, scanJobId: r.scanJobId, alreadyCommitted: true, oldObjectDeletionAllowed: false};
  }
  const expectedBucket = r.tableName === "videos" ? "creator-videos" : r.tableName === "social_attachments" ? "social-attachments" : null;
  const safeKey = (key: unknown): key is string => typeof key === "string" && key.length > 0 && key.length <= 1024
    && /^[A-Za-z0-9_./-]+$/.test(key) && !key.startsWith("/") && !key.includes("..");
  if (r.state !== "readback_required" || !expectedBucket || r.sourceBucket !== expectedBucket || !safeKey(r.sourceKey)
    || !UUID.test(r.rowId) || !UUID.test(r.sourceStorageId) || typeof r.sourceStorageVersion !== "string"
    || !r.sourceStorageVersion || r.sourceStorageVersion.length > 256
    || r.targetKey !== `originals/supabase-migration/${receiptId}/${r.tableName}/${r.rowId}`
    || !/^[a-f0-9]{64}$/.test(r.sha256) || !Number.isSafeInteger(r.sizeBytes) || r.sizeBytes < 1 || r.sizeBytes > 536870912) {
    throw new Error("copy_cutover_binding_invalid");
  }
  if (!(await deps.targetAllowed(r.targetKey))) throw new Error("copy_cutover_target_unavailable");
  const signed = await deps.adminClient.storage.from(r.sourceBucket).createSignedUrl(r.sourceKey, 120);
  if (signed.error || !signed.data?.signedUrl) throw new Error("copy_cutover_source_signing_failed");
  const sourceUrl = new URL(signed.data.signedUrl);
  if (sourceUrl.origin !== new URL(deps.supabaseUrl).origin || sourceUrl.protocol !== "https:"
    || sourceUrl.username || sourceUrl.password || sourceUrl.hash
    || sourceUrl.pathname !== `/storage/v1/object/sign/${r.sourceBucket}/${r.sourceKey}`) throw new Error("copy_cutover_source_url_invalid");
  const read = async (url: URL) => {
    if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("copy_cutover_url_invalid");
    const response = await (deps.fetcher ?? fetch)(url, {redirect: "error", signal: AbortSignal.timeout(120_000)});
    if (response.status !== 200 || response.headers.has("content-range") || !response.body
      || ![null, "identity"].includes(response.headers.get("content-encoding"))
      || Number(response.headers.get("content-length")) !== r.sizeBytes) {
      await response.body?.cancel().catch(() => {});
      throw new Error("copy_cutover_complete_read_required");
    }
    const reader = response.body.getReader();
    const hash = createHash("sha256");
    let bytes = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > r.sizeBytes) throw new Error("copy_cutover_size_changed");
        hash.update(value);
      }
      if (bytes !== r.sizeBytes || hash.digest("hex") !== r.sha256) throw new Error("copy_cutover_bytes_changed");
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  };
  await read(sourceUrl);
  await read(new URL(await deps.targetUrl("GET", r.targetKey)));
  if (!(await deps.targetAllowed(r.targetKey))) throw new Error("copy_cutover_target_unavailable");
  const committed = await deps.adminClient.rpc("commit_supabase_original_copy_cutover", {
    p_receipt_id: receiptId, p_source_storage_id: r.sourceStorageId, p_source_storage_version: r.sourceStorageVersion,
    p_readback_assertions: {protocol: "supabase-copy-cutover-v1", sourceSha256: r.sha256, targetSha256: r.sha256,
      sourceSizeBytes: r.sizeBytes, targetSizeBytes: r.sizeBytes, independentReadback: true, sourcePreserved: true},
  });
  if (committed.error || committed.data?.state !== "committed" || committed.data?.receiptId !== receiptId
    || !UUID.test(committed.data.scanJobId)) throw new Error("copy_cutover_commit_unconfirmed");
  return {state: "committed", receiptId, scanJobId: committed.data.scanJobId,
    alreadyCommitted: committed.data.alreadyCommitted === true, oldObjectDeletionAllowed: false};
}
