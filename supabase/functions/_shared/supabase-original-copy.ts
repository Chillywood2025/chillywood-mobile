import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BYTES = 512 * 1024 * 1024;
const TRANSPORT_TIMEOUT_MS = 120_000;
const safeKey = (key: unknown): key is string => typeof key === "string"
  && key.length <= 1024 && !key.startsWith("backups/") && !key.startsWith("playback/")
  && /^[A-Za-z0-9_./-]+$/.test(key) && !key.startsWith("/") && !key.includes("..");

type CopyDependencies = {
  adminClient: any;
  supabaseUrl: string;
  fetcher?: typeof fetch;
  targetAllowed: (key: string) => Promise<boolean>;
  targetUrl: (method: "GET" | "PUT", key: string) => Promise<string>;
};

// This is a copy receipt, never scan evidence, enrollment, or cutover authority.
// Conditional PUT is mandatory; retries cannot adopt or overwrite existing bytes.
export async function copySupabaseOriginal(
  input: { tableName: string; rowId: string; receiptId: string },
  deps: CopyDependencies,
) {
  if (!["videos", "social_attachments"].includes(input.tableName)
    || !UUID.test(input.rowId) || !UUID.test(input.receiptId)) throw new Error("invalid_original_copy_identity");
  const { data: source, error } = await deps.adminClient.from(input.tableName)
    .select("*").eq("id", input.rowId).single();
  if (error || !source || source.id !== input.rowId) throw new Error("original_copy_source_unavailable");
  if (!["supabase", "supabase_storage"].includes(source.storage_provider)
    || source.deleted_at || source.hard_deleted_at) throw new Error("original_copy_source_ineligible");
  const owner = input.tableName === "videos" ? source.owner_id : source.owner_user_id;
  if (typeof owner !== "string" || !UUID.test(owner) || typeof source.created_at !== "string" || !source.created_at) {
    throw new Error("original_copy_source_identity_invalid");
  }
  if (input.tableName === "social_attachments" && (
    !["profile_post", "profile_post_comment", "creator_video_comment", "chat_message", "watch_party_room_message", "room_message"].includes(source.surface_type)
    || typeof source.surface_id !== "string" || !UUID.test(source.surface_id)
  )) throw new Error("original_copy_parent_invalid");
  const bucket = source.storage_bucket;
  const key = source.storage_object_key || source.storage_path;
  if (bucket !== (input.tableName === "videos" ? "creator-videos" : "social-attachments") || !safeKey(key)
    || (source.storage_path && source.storage_path !== key)
    || (source.storage_object_key && source.storage_object_key !== key)) throw new Error("original_copy_locator_ambiguous");
  const targetKey = `originals/supabase-migration/${input.receiptId}/${input.tableName}/${input.rowId}`;
  if (!(await deps.targetAllowed(targetKey))) throw new Error("original_copy_target_unavailable");
  const { data: signed, error: signError } = await deps.adminClient.storage.from(bucket).createSignedUrl(key, 120);
  if (signError || !signed?.signedUrl) throw new Error("original_copy_source_signing_failed");
  const sourceUrl = new URL(signed.signedUrl);
  const expectedOrigin = new URL(deps.supabaseUrl);
  if (sourceUrl.origin !== expectedOrigin.origin || sourceUrl.protocol !== "https:"
    || sourceUrl.username || sourceUrl.password
    || sourceUrl.pathname !== `/storage/v1/object/sign/${bucket}/${key}`) throw new Error("original_copy_source_url_invalid");
  const fetcher = deps.fetcher ?? fetch;
  const sourceResponse = await fetcher(sourceUrl, { redirect: "error", signal: AbortSignal.timeout(TRANSPORT_TIMEOUT_MS) });
  if (sourceResponse.status !== 200 || sourceResponse.headers.has("content-range") || !sourceResponse.body) {
    await sourceResponse.body?.cancel().catch(() => {});
    throw new Error("original_copy_source_download_failed");
  }
  if (![null, "identity"].includes(sourceResponse.headers.get("content-encoding"))) {
    await sourceResponse.body.cancel().catch(() => {});
    throw new Error("original_copy_encoded_source_unsupported");
  }
  const declaredSize = Number(sourceResponse.headers.get("content-length"));
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0 || declaredSize > MAX_BYTES) {
    await sourceResponse.body.cancel().catch(() => {});
    throw new Error("original_copy_source_length_required");
  }
  const sourceHash = createHash("sha256");
  let sourceSize = 0;
  let sourceComplete = false;
  const stream = sourceResponse.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      sourceSize += chunk.byteLength;
      if (sourceSize > declaredSize) throw new Error("original_copy_size_limit");
      sourceHash.update(chunk);
      controller.enqueue(chunk);
    },
    flush() {
      if (sourceSize !== declaredSize) throw new Error("original_copy_source_length_mismatch");
      sourceComplete = true;
    },
  }));
  const upload = await fetcher(await deps.targetUrl("PUT", targetKey), {
    method: "PUT", body: stream, redirect: "error", signal: AbortSignal.timeout(TRANSPORT_TIMEOUT_MS),
    headers: { "If-None-Match": "*", "Content-Length": String(declaredSize), "Content-Type": sourceResponse.headers.get("content-type") || "application/octet-stream" },
    // Deno accepts streaming bodies; duplex also permits the same real stream in Node tests.
    duplex: "half",
  } as RequestInit);
  if (!upload.ok) {
    await stream.cancel().catch(() => {});
    throw new Error(upload.status === 412 ? "original_copy_target_conflict" : "original_copy_upload_failed");
  }
  if (!sourceComplete || sourceSize === 0) throw new Error("original_copy_stream_incomplete");
  const expectedHash = sourceHash.digest("hex");
  const readback = await fetcher(await deps.targetUrl("GET", targetKey), { redirect: "error", signal: AbortSignal.timeout(TRANSPORT_TIMEOUT_MS) });
  if (readback.status !== 200 || readback.headers.has("content-range") || !readback.body) {
    await readback.body?.cancel().catch(() => {});
    throw new Error("original_copy_readback_failed");
  }
  if (![null, "identity"].includes(readback.headers.get("content-encoding"))) {
    await readback.body.cancel().catch(() => {});
    throw new Error("original_copy_encoded_target_unsupported");
  }
  const targetHash = createHash("sha256");
  let targetSize = 0;
  const reader = readback.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      targetSize += value.byteLength;
      if (targetSize > MAX_BYTES) throw new Error("original_copy_readback_size_limit");
      targetHash.update(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (targetSize !== sourceSize || targetHash.digest("hex") !== expectedHash) throw new Error("original_copy_readback_mismatch");
  // Recheck after asynchronous transport. SQL then binds the exact unchanged source.
  if (!(await deps.targetAllowed(targetKey))) throw new Error("original_copy_target_became_unavailable");
  const recorded = await deps.adminClient.rpc("record_supabase_original_copy_receipt", {
    p_receipt_id: input.receiptId, p_table_name: input.tableName, p_row_id: input.rowId,
    p_source_snapshot: source, p_target_key: targetKey, p_sha256: expectedHash, p_size_bytes: sourceSize,
    p_proof_assertions: { protocol: "supabase-original-copy-v1", sourceSha256: expectedHash,
      targetSha256: expectedHash, sourceSizeBytes: sourceSize, targetSizeBytes: targetSize,
      createOnly: true, independentReadback: true },
  });
  if (recorded.error || !recorded.data || typeof recorded.data !== "object" || Array.isArray(recorded.data)
    || recorded.data.recorded !== true || recorded.data.receiptId !== input.receiptId
    || recorded.data.cutoverAllowed !== false) throw new Error("original_copy_receipt_not_recorded");
  return { receiptId: input.receiptId, copied: true, readbackVerified: true,
    sizeBytes: sourceSize, sourcePreserved: true, metadataChanged: false, retentionEnrolled: false };
}
