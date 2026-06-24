#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_SUPABASE_URL = "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const DEFAULT_SUPABASE_FUNCTIONS_URL = "https://network-proof.chillywoodstream.com";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJta2toaWhmYm1zbm5tY3Frb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjE1ODUsImV4cCI6MjA4NjczNzU4NX0.j45qJsnaZelO4fND2LGOwH66cb7qHr1LY0t31Ck-TcQ";
const PROOF_RUN_ID = `wave2-final-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const SOCIAL_ATTACHMENT_LIMIT_BYTES = 250 * 1024 * 1024;

const args = new Set(process.argv.slice(2));
const shouldRun = args.has("--run");
const keepProofRows = args.has("--keep-proof-rows");
const proofDirArg = process.argv.find((arg) => arg.startsWith("--proof-dir="));
const proofDir = proofDirArg
  ? path.resolve(proofDirArg.slice("--proof-dir=".length))
  : path.join(os.tmpdir(), `chillywood-wave2-final-closure-setup-proof-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`);

const toText = (value) => String(value ?? "").trim();
const sha256Short = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
const suffix = (value) => {
  const text = toText(value);
  return text ? text.slice(-8) : null;
};
const redactObjectKey = (value) => {
  const text = toText(value);
  if (!text) return null;
  const parts = text.split("/");
  if (parts.length >= 3) return `[owner:${suffix(parts[0])}]/${parts.slice(1).join("/")}`;
  return `[object:${sha256Short(text)}]`;
};

const loadLocalEnv = () => {
  for (const file of [".env.browserstack-monetization.local", ".env.local", ".env.final-qa-proof.local"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key]) continue;
      let value = match[2].trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
};

const writeJsonArtifact = (name, value) => {
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(path.join(proofDir, name), `${JSON.stringify(value, null, 2)}\n`);
};

const createClientFor = (supabaseUrl, anonKey) => createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const callMediaStorage = async (functionsUrl, accessToken, body) => {
  const response = await fetch(`${functionsUrl.replace(/\/+$/g, "")}/functions/v1/media-storage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, payload };
};

const uploadBytesToSignedUrl = async (uploadUrl, bytes, mimeType) => {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: bytes,
  });
  if (!response.ok) throw new Error(`signed_upload_${response.status}`);
};

const verifyReadableBytes = async (downloadUrl) => {
  const response = await fetch(downloadUrl, { headers: { Range: "bytes=0-0" } });
  if (!response.ok) return false;
  const body = await response.arrayBuffer();
  return body.byteLength > 0;
};

const sanitizeMediaStoragePayload = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  return {
    bucketPresent: !!payload.bucket,
    downloadUrlReturned: !!payload.downloadUrl,
    error: toText(payload.error) || null,
    expiresAtPresent: !!payload.expiresAt,
    message: toText(payload.message) || null,
    objectKey: redactObjectKey(payload.objectKey),
    provider: toText(payload.provider) || null,
    uploadUrlReturned: !!payload.uploadUrl,
  };
};

const hasSignedUrlLeak = (value) => {
  const serialized = JSON.stringify(value);
  return /X-Amz-Signature|https?:\/\/|X-Amz-Credential|X-Amz-Algorithm|signedUrl|storage_secret|service_role/i.test(serialized);
};

const signIn = async (client, email, password, label) => {
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.session?.access_token || !result.data.user?.id) {
    throw new Error(`${label}_sign_in_failed`);
  }
  return {
    client,
    id: result.data.user.id,
    token: result.data.session.access_token,
    suffix: suffix(result.data.user.id),
  };
};

const main = async () => {
  loadLocalEnv();

  const supabaseUrl = toText(process.env.EXPO_PUBLIC_SUPABASE_URL)
    || toText(process.env.SUPABASE_URL)
    || DEFAULT_SUPABASE_URL;
  const functionsUrl = toText(process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL)
    || toText(process.env.SUPABASE_FUNCTIONS_URL)
    || DEFAULT_SUPABASE_FUNCTIONS_URL;
  const anonKey = toText(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
    || toText(process.env.SUPABASE_ANON_KEY)
    || DEFAULT_SUPABASE_ANON_KEY;
  const ownerEmail = toText(process.env.CHILLYWOOD_E2E_OWNER_EMAIL)
    || toText(process.env.MAESTRO_CHILLYWOOD_LOGIN_EMAIL)
    || toText(process.env.FINAL_QA_PROOF_EMAIL);
  const ownerPassword = toText(process.env.CHILLYWOOD_E2E_OWNER_PASSWORD)
    || toText(process.env.MAESTRO_CHILLYWOOD_LOGIN_PASSWORD)
    || toText(process.env.FINAL_QA_PROOF_PASSWORD);
  const viewerEmail = toText(process.env.CHILLYWOOD_E2E_VIEWER_EMAIL);
  const viewerPassword = toText(process.env.CHILLYWOOD_E2E_VIEWER_PASSWORD);
  const premiumEmail = toText(process.env.CHILLYWOOD_E2E_PREMIUM_VIEWER_EMAIL);
  const premiumPassword = toText(process.env.CHILLYWOOD_E2E_PREMIUM_VIEWER_PASSWORD);
  const cleanPublicFixtureId = toText(process.env.CHILLYWOOD_E2E_CLEAN_PUBLIC_CREATOR_VIDEO_ID)
    || "c1a45740-26cc-4a64-91da-caf16284fc33";

  const preflight = {
    cleanPublicFixtureConfigured: !!cleanPublicFixtureId,
    functionsUrlPresent: !!functionsUrl,
    ownerCredentialPairPresent: !!(ownerEmail && ownerPassword),
    premiumCredentialPairPresent: !!(premiumEmail && premiumPassword),
    proofDir,
    proofRunId: PROOF_RUN_ID,
    runRequested: shouldRun,
    supabaseUrlPresent: !!supabaseUrl,
    viewerCredentialPairPresent: !!(viewerEmail && viewerPassword),
  };
  writeJsonArtifact("00-preflight.json", preflight);

  if (!shouldRun) {
    console.log(JSON.stringify({
      ok: true,
      mode: "dry_run",
      mutationPerformed: false,
      secretsPrinted: false,
      ...preflight,
    }, null, 2));
    return;
  }

  if (!ownerEmail || !ownerPassword) throw new Error("missing_owner_proof_credentials");
  if (!viewerEmail || !viewerPassword) throw new Error("missing_viewer_proof_credentials");

  const anonClient = createClientFor(supabaseUrl, anonKey);
  const owner = await signIn(createClientFor(supabaseUrl, anonKey), ownerEmail, ownerPassword, "owner");
  const viewer = await signIn(createClientFor(supabaseUrl, anonKey), viewerEmail, viewerPassword, "viewer");
  let premium = null;
  if (premiumEmail && premiumPassword) {
    premium = await signIn(createClientFor(supabaseUrl, anonKey), premiumEmail, premiumPassword, "premium");
  }

  const cleanup = {
    attachmentDeleteObject: "not_created",
    attachmentRow: "not_created",
    comment: "not_created",
    reply: "not_created",
  };
  const created = {
    attachmentId: null,
    attachmentObjectKey: null,
    commentId: null,
    replyId: null,
  };

  try {
    const anonPlayback = await anonClient.rpc("resolve_video_playback", { target_video_id: cleanPublicFixtureId });
    const viewerPlayback = await viewer.client.rpc("resolve_video_playback", { target_video_id: cleanPublicFixtureId });
    const premiumPlayback = premium
      ? await premium.client.rpc("resolve_video_playback", { target_video_id: cleanPublicFixtureId })
      : null;
    const anonAllowed = Array.isArray(anonPlayback.data?.allowed_qualities) ? anonPlayback.data.allowed_qualities : [];
    const viewerAllowed = Array.isArray(viewerPlayback.data?.allowed_qualities) ? viewerPlayback.data.allowed_qualities : [];
    const premiumAllowed = Array.isArray(premiumPlayback?.data?.allowed_qualities) ? premiumPlayback.data.allowed_qualities : [];

    const directAnonRenditions = await anonClient
      .from("video_renditions")
      .select("id,video_id,quality_label,status,access_tier,storage_path,manifest_path")
      .eq("video_id", cleanPublicFixtureId)
      .limit(10);
    const directViewerRenditions = await viewer.client
      .from("video_renditions")
      .select("id,video_id,quality_label,status,access_tier,storage_path,manifest_path")
      .eq("video_id", cleanPublicFixtureId)
      .limit(10);

    const realRenditionLabels = Array.from(new Set([
      ...anonAllowed.map((entry) => toText(entry.quality_label)),
      ...viewerAllowed.map((entry) => toText(entry.quality_label)),
      ...premiumAllowed.map((entry) => toText(entry.quality_label)),
    ].filter(Boolean)));
    const originalReturned = [...anonAllowed, ...viewerAllowed, ...premiumAllowed]
      .some((entry) => toText(entry.quality_label) === "original");
    const signedLeak = hasSignedUrlLeak({ anonAllowed, viewerAllowed, premiumAllowed });

    const vodProof = {
      cleanPublicFixtureId,
      directAnonRowsVisible: (directAnonRenditions.data ?? []).length,
      directAnonSelectError: toText(directAnonRenditions.error?.code || directAnonRenditions.error?.message) || null,
      directViewerRowsVisible: (directViewerRenditions.data ?? []).length,
      directViewerSelectError: toText(directViewerRenditions.error?.code || directViewerRenditions.error?.message) || null,
      freeAllowedLabels: viewerAllowed.map((entry) => toText(entry.quality_label)).filter(Boolean),
      hasRealRenditionLadder: realRenditionLabels.some((label) => ["360p", "480p", "720p", "1080p"].includes(label)),
      missingRenditionStateHonest: toText(anonPlayback.data?.legacy_quality_enforcement) === "pending_renditions"
        || toText(anonPlayback.data?.message).toLowerCase().includes("pending real renditions")
        || realRenditionLabels.length > 0,
      originalMasterExcluded: !originalReturned,
      premiumAllowedLabels: premium ? premiumAllowed.map((entry) => toText(entry.quality_label)).filter(Boolean) : [],
      premiumProofStatus: premium ? "attempted" : "pending_missing_premium_proof_credentials",
      resolverStatus: toText(anonPlayback.data?.status),
      signedUrlOrStorageSecretLeak: signedLeak,
    };
    writeJsonArtifact("10-vod-rendition-proof.json", vodProof);

    const unsupportedUpload = await callMediaStorage(functionsUrl, owner.token, {
      action: "create_upload_url",
      surfaceType: "social_attachment",
      objectKey: `${owner.id}/creator_video_comment/${randomUUID()}/unsupported.exe`,
      mimeType: "application/x-msdownload",
      sizeBytes: 128,
    });
    const largeUpload = await callMediaStorage(functionsUrl, owner.token, {
      action: "create_upload_url",
      surfaceType: "social_attachment",
      objectKey: `${owner.id}/creator_video_comment/${randomUUID()}/large.txt`,
      mimeType: "text/plain",
      sizeBytes: SOCIAL_ATTACHMENT_LIMIT_BYTES + 1,
    });

    const commentBody = `Wave 2 proof comment ${PROOF_RUN_ID} https://chillywood.app/support`;
    const comment = await owner.client
      .from("creator_video_comments")
      .insert({
        body: commentBody,
        moderation_status: "clean",
        user_id: owner.id,
        video_id: cleanPublicFixtureId,
      })
      .select("id,body,user_id,video_id,parent_comment_id,moderation_status")
      .single();
    if (comment.error || !comment.data?.id) throw new Error(`comment_insert_failed:${comment.error?.code ?? "unknown"}`);
    created.commentId = comment.data.id;
    cleanup.comment = "created";

    const reply = await owner.client
      .from("creator_video_comments")
      .insert({
        body: `Wave 2 proof reply ${PROOF_RUN_ID}`,
        moderation_status: "clean",
        parent_comment_id: created.commentId,
        user_id: owner.id,
        video_id: cleanPublicFixtureId,
      })
      .select("id,body,user_id,video_id,parent_comment_id,moderation_status")
      .single();
    if (reply.error || !reply.data?.id) throw new Error(`reply_insert_failed:${reply.error?.code ?? "unknown"}`);
    created.replyId = reply.data.id;
    cleanup.reply = "created";

    const anonReadComments = await anonClient
      .from("creator_video_comments")
      .select("id,body,parent_comment_id,moderation_status")
      .in("id", [created.commentId, created.replyId]);

    const objectKey = `${owner.id}/creator_video_comment/${created.commentId}/${randomUUID()}.txt`;
    const upload = await callMediaStorage(functionsUrl, owner.token, {
      action: "create_upload_url",
      surfaceType: "social_attachment",
      objectKey,
      mimeType: "text/plain",
      sizeBytes: 36,
    });
    if (!upload.ok || !upload.payload?.uploadUrl) throw new Error(`attachment_upload_url_failed:${upload.status}`);
    await uploadBytesToSignedUrl(upload.payload.uploadUrl, Buffer.from("Chi'llywood Wave 2 attachment proof\n"), "text/plain");

    const attachment = await owner.client
      .from("social_attachments")
      .insert({
        mime_type: "text/plain",
        moderation_status: "clean",
        original_file_name: "wave2-attachment-proof.txt",
        owner_user_id: owner.id,
        scan_provider: "clamav",
        scan_status: "pending_scan",
        size_bytes: 36,
        storage_bucket: upload.payload.bucket,
        storage_object_key: upload.payload.objectKey,
        storage_path: upload.payload.objectKey,
        storage_provider: upload.payload.provider,
        surface_id: created.commentId,
        surface_type: "creator_video_comment",
      })
      .select("id,owner_user_id,surface_type,surface_id,scan_status,storage_bucket,storage_object_key,storage_path,size_bytes")
      .single();
    if (attachment.error || !attachment.data?.id) throw new Error(`attachment_insert_failed:${attachment.error?.code ?? "unknown"}`);
    created.attachmentId = attachment.data.id;
    created.attachmentObjectKey = attachment.data.storage_object_key || attachment.data.storage_path;
    cleanup.attachmentRow = "created";
    cleanup.attachmentDeleteObject = "created";

    const ownerDownload = await callMediaStorage(functionsUrl, owner.token, {
      action: "create_download_url",
      surfaceType: "social_attachment",
      bucket: attachment.data.storage_bucket,
      objectKey: created.attachmentObjectKey,
      recordId: created.attachmentId,
    });
    const ownerReadable = ownerDownload.ok && ownerDownload.payload?.downloadUrl
      ? await verifyReadableBytes(ownerDownload.payload.downloadUrl)
      : false;
    const viewerDownload = await callMediaStorage(functionsUrl, viewer.token, {
      action: "create_download_url",
      surfaceType: "social_attachment",
      bucket: attachment.data.storage_bucket,
      objectKey: created.attachmentObjectKey,
      recordId: created.attachmentId,
    });
    const anonReadAttachment = await anonClient
      .from("social_attachments")
      .select("id,scan_status")
      .eq("id", created.attachmentId);

    const viewerDeleteComment = await viewer.client
      .from("creator_video_comments")
      .delete()
      .eq("id", created.commentId)
      .select("id");

    const attachmentProof = {
      anonReadCommentCount: (anonReadComments.data ?? []).length,
      commentBodyHasLink: commentBody.includes("https://"),
      commentCreated: !!created.commentId,
      commentId: created.commentId,
      largeFileBlocked: !largeUpload.ok && largeUpload.status === 413,
      largeFileError: sanitizeMediaStoragePayload(largeUpload.payload),
      nonOwnerDeleteDenied: !viewerDeleteComment.error && (viewerDeleteComment.data ?? []).length === 0,
      ownerAttachmentDownloadReadable: ownerReadable,
      pendingAttachmentHiddenFromAnon: !anonReadAttachment.error && (anonReadAttachment.data ?? []).length === 0,
      pendingAttachmentAnonSelectError: toText(anonReadAttachment.error?.code || anonReadAttachment.error?.message) || null,
      replyCreated: !!created.replyId,
      replyId: created.replyId,
      supportedAttachmentCreated: !!created.attachmentId,
      supportedAttachmentId: created.attachmentId,
      supportedAttachmentObjectKey: redactObjectKey(created.attachmentObjectKey),
      unsupportedTypeBlocked: !unsupportedUpload.ok && unsupportedUpload.status === 415,
      unsupportedTypeError: sanitizeMediaStoragePayload(unsupportedUpload.payload),
      viewerAttachmentDownloadDenied: !viewerDownload.ok && viewerDownload.status === 403,
      signedUrlOrStorageSecretLeak: hasSignedUrlLeak({
        ownerDownload: sanitizeMediaStoragePayload(ownerDownload.payload),
        viewerDownload: sanitizeMediaStoragePayload(viewerDownload.payload),
        upload: sanitizeMediaStoragePayload(upload.payload),
      }),
    };
    writeJsonArtifact("20-attachment-comments-proof.json", attachmentProof);

    const scannerProof = {
      adminReadoutSanitizedStatus: "pending_operator_path_not_run",
      malwareDetectedHiddenStatus: "pending_no_safe_disposable_malware_fixture_in_this_run",
      mediaStoragePendingGate: attachmentProof.viewerAttachmentDownloadDenied,
      pendingScanHidden: attachmentProof.pendingAttachmentHiddenFromAnon,
      publicReadModelGate: attachmentProof.pendingAttachmentHiddenFromAnon,
      resolverPendingGate: vodProof.missingRenditionStateHonest && !vodProof.signedUrlOrStorageSecretLeak,
      scanFailedHiddenStatus: "pending_no_safe_operator_scan_failed_fixture_in_this_run",
      scannerUnavailableFailSafeStatus: "pending_requires_controlled_operator_window_or scanner service manipulation",
      storagePathOrSecretLeak: attachmentProof.signedUrlOrStorageSecretLeak || vodProof.signedUrlOrStorageSecretLeak,
    };
    writeJsonArtifact("30-scanner-failure-proof.json", scannerProof);

    const summary = {
      ok: true,
      cleanup,
      created: {
        attachmentId: created.attachmentId,
        commentId: created.commentId,
        ownerSuffix: owner.suffix,
        replyId: created.replyId,
        supportedAttachmentObjectKey: redactObjectKey(created.attachmentObjectKey),
        viewerSuffix: viewer.suffix,
      },
      mutationPerformed: true,
      proofDir,
      proofRunId: PROOF_RUN_ID,
      scannerProof,
      secretsPrinted: false,
      status: {
        attachmentComments: attachmentProof.commentCreated
          && attachmentProof.replyCreated
          && attachmentProof.supportedAttachmentCreated
          && attachmentProof.largeFileBlocked
          && attachmentProof.unsupportedTypeBlocked
          ? "backend_api_pass_android_heavy_picker_pending"
          : "partial",
        scannerFailure: "partial_operator_failure_mode_pending",
        vodRendition: vodProof.hasRealRenditionLadder ? "real_ladder_detected" : "pending_no_real_ladder_detected",
      },
      vodProof,
    };
    writeJsonArtifact("90-summary.json", summary);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (!keepProofRows) {
      if (created.attachmentId) {
        const rowDelete = await owner.client.from("social_attachments").delete().eq("id", created.attachmentId);
        cleanup.attachmentRow = rowDelete.error ? `failed:${rowDelete.error.code}` : "completed";
      }
      if (created.attachmentObjectKey) {
        const deleteObject = await callMediaStorage(functionsUrl, owner.token, {
          action: "delete_object",
          surfaceType: "social_attachment",
          objectKey: created.attachmentObjectKey,
          recordId: created.attachmentId,
        });
        cleanup.attachmentDeleteObject = deleteObject.ok ? "completed" : `failed:${deleteObject.status}`;
      }
      if (created.replyId) {
        const replyDelete = await owner.client.from("creator_video_comments").delete().eq("id", created.replyId);
        cleanup.reply = replyDelete.error ? `failed:${replyDelete.error.code}` : "completed";
      }
      if (created.commentId) {
        const commentDelete = await owner.client.from("creator_video_comments").delete().eq("id", created.commentId);
        cleanup.comment = commentDelete.error ? `failed:${commentDelete.error.code}` : "completed";
      }
      writeJsonArtifact("99-cleanup.json", cleanup);
    } else {
      writeJsonArtifact("99-cleanup.json", { ...cleanup, skipped: true });
    }
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  writeJsonArtifact("error.json", {
    error: message,
    proofDir,
    proofRunId: PROOF_RUN_ID,
    secretsPrinted: false,
  });
  console.error(JSON.stringify({
    ok: false,
    error: message,
    proofDir,
    proofRunId: PROOF_RUN_ID,
    secretsPrinted: false,
  }, null, 2));
  process.exit(1);
});
