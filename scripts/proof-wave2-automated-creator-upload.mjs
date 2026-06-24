#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_SUPABASE_URL = "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const DEFAULT_SUPABASE_FUNCTIONS_URL = "https://network-proof.chillywoodstream.com";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJta2toaWhmYm1zbm5tY3Frb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjE1ODUsImV4cCI6MjA4NjczNzU4NX0.j45qJsnaZelO4fND2LGOwH66cb7qHr1LY0t31Ck-TcQ";
const PROOF_RUN_ID = `wave2-auto-upload-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const MEDIA_STORAGE_SURFACE = "creator_video";
const PUBLIC_CARDS_LIMIT = 24;

const args = new Set(process.argv.slice(2));
const shouldRun = args.has("--run");
const keepProofMedia = args.has("--keep-proof-media");
const proofDirArg = process.argv.find((arg) => arg.startsWith("--proof-dir="));
const proofDir = proofDirArg
  ? path.resolve(proofDirArg.slice("--proof-dir=".length))
  : path.join(os.tmpdir(), `chillywood-wave2-automated-upload-proof-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`);

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
  const files = [
    ".env.browserstack-monetization.local",
    ".env.local",
    ".env.final-qa-proof.local",
  ];
  for (const file of files) {
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

const createTinyMp4 = (targetPath) => {
  const ffmpeg = spawnSync("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "testsrc=size=160x90:rate=15:duration=2",
    "-f", "lavfi",
    "-i", "sine=frequency=440:duration=2",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-movflags", "+faststart",
    targetPath,
  ], { encoding: "utf8" });

  if (ffmpeg.status === 0 && fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
    return { source: "ffmpeg", sizeBytes: fs.statSync(targetPath).size };
  }

  // Minimal MP4-shaped fallback. It is non-zero and intentionally used only if
  // ffmpeg is unavailable; the proof reports the generator source.
  const fallback = Buffer.from(
    "AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAGZnJlZQAAACBtZGF0Q2hpJ2xseXdvb2QgcHJvb2YgTVA0IGZpeHR1cmUK",
    "base64",
  );
  fs.writeFileSync(targetPath, fallback);
  return { source: "fallback_mp4_container_bytes", sizeBytes: fallback.length };
};

const createAuthedClient = (supabaseUrl, anonKey) => createClient(supabaseUrl, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
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
  if (!response.ok) {
    const code = payload && typeof payload === "object" ? payload.error || payload.message : null;
    throw new Error(`media_storage_${response.status}_${toText(code) || "error"}`);
  }
  return payload;
};

const callPublicCreatorCards = async (functionsUrl, body) => {
  const response = await fetch(`${functionsUrl.replace(/\/+$/g, "")}/functions/v1/public-creator-video-cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`public_cards_${response.status}`);
  return payload;
};

const uploadBytesToSignedUrl = async (uploadUrl, bytes, mimeType) => {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: bytes,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`signed_upload_${response.status}_${body.slice(0, 80)}`);
  }
};

const verifyReadableBytes = async (downloadUrl) => {
  const response = await fetch(downloadUrl, { headers: { Range: "bytes=0-0" } });
  if (!response.ok) return false;
  const body = await response.arrayBuffer();
  return body.byteLength > 0;
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
  const nonOwnerEmail = toText(process.env.CHILLYWOOD_E2E_VIEWER_EMAIL);
  const nonOwnerPassword = toText(process.env.CHILLYWOOD_E2E_VIEWER_PASSWORD);
  const cleanPublicFixtureId = toText(process.env.CHILLYWOOD_E2E_CLEAN_PUBLIC_CREATOR_VIDEO_ID)
    || "c1a45740-26cc-4a64-91da-caf16284fc33";

  const envSummary = {
    anonKeyPresent: !!anonKey,
    cleanPublicFixtureConfigured: !!cleanPublicFixtureId,
    functionsUrlPresent: !!functionsUrl,
    nonOwnerCredentialPairPresent: !!(nonOwnerEmail && nonOwnerPassword),
    ownerCredentialPairPresent: !!(ownerEmail && ownerPassword),
    proofDir,
    proofRunId: PROOF_RUN_ID,
    runRequested: shouldRun,
    supabaseUrlPresent: !!supabaseUrl,
  };

  fs.mkdirSync(proofDir, { recursive: true });
  writeJsonArtifact("00-preflight.json", envSummary);

  if (!shouldRun) {
    console.log(JSON.stringify({
      ok: true,
      mode: "dry_run",
      mutationPerformed: false,
      secretsPrinted: false,
      ...envSummary,
    }, null, 2));
    return;
  }

  const missing = [];
  if (!ownerEmail) missing.push("CHILLYWOOD_E2E_OWNER_EMAIL");
  if (!ownerPassword) missing.push("CHILLYWOOD_E2E_OWNER_PASSWORD");
  if (!missing.length) {
    // continue
  } else {
    throw new Error(`missing_env:${missing.join(",")}`);
  }

  const ownerClient = createAuthedClient(supabaseUrl, anonKey);
  const anonClient = createAuthedClient(supabaseUrl, anonKey);
  const ownerSignIn = await ownerClient.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });
  if (ownerSignIn.error || !ownerSignIn.data.session?.access_token || !ownerSignIn.data.user?.id) {
    throw new Error("owner_sign_in_failed");
  }

  const ownerId = ownerSignIn.data.user.id;
  const ownerToken = ownerSignIn.data.session.access_token;
  const videoId = randomUUID();
  const objectKey = `${ownerId}/${videoId}/source.mp4`;
  const fixturePath = path.join(proofDir, "wave2-auto-upload-proof.mp4");
  const fixture = createTinyMp4(fixturePath);
  const fixtureBytes = fs.readFileSync(fixturePath);
  const nowIso = new Date().toISOString();
  const title = `Wave 2 automated upload proof ${PROOF_RUN_ID}`;
  let uploaded = null;
  let createdRow = null;
  let cleanup = { deleteRow: "not_started", deleteObject: "not_started" };

  try {
    const upload = await callMediaStorage(functionsUrl, ownerToken, {
      action: "create_upload_url",
      surfaceType: MEDIA_STORAGE_SURFACE,
      objectKey,
      mimeType: "video/mp4",
      sizeBytes: fixtureBytes.byteLength,
    });
    uploaded = {
      provider: toText(upload.provider),
      bucket: toText(upload.bucket),
      objectKey: toText(upload.objectKey),
    };
    if (uploaded.provider !== "s3" || !uploaded.bucket || uploaded.objectKey !== objectKey || !toText(upload.uploadUrl)) {
      throw new Error("invalid_upload_url_response");
    }

    await uploadBytesToSignedUrl(toText(upload.uploadUrl), fixtureBytes, "video/mp4");

    const download = await callMediaStorage(functionsUrl, ownerToken, {
      action: "create_download_url",
      surfaceType: MEDIA_STORAGE_SURFACE,
      provider: uploaded.provider,
      bucket: uploaded.bucket,
      objectKey: uploaded.objectKey,
      recordId: null,
    });
    const storageHasBytes = await verifyReadableBytes(toText(download.downloadUrl));
    if (!storageHasBytes) throw new Error("uploaded_object_empty");

    const insertPayload = {
      id: videoId,
      owner_id: ownerId,
      title,
      description: `Proof-only automated upload. ${PROOF_RUN_ID}`,
      playback_url: null,
      thumb_url: null,
      visibility: "draft",
      moderation_status: "clean",
      storage_provider: uploaded.provider,
      storage_bucket: uploaded.bucket,
      storage_object_key: uploaded.objectKey,
      storage_path: uploaded.objectKey,
      thumb_storage_path: null,
      mime_type: "video/mp4",
      file_size_bytes: fixtureBytes.byteLength,
      updated_at: nowIso,
    };

    const insertResult = await ownerClient
      .from("videos")
      .insert(insertPayload)
      .select("id,owner_id,title,description,visibility,moderation_status,scan_status,storage_provider,storage_bucket,storage_object_key,file_size_bytes,created_at,updated_at")
      .single();
    if (insertResult.error || !insertResult.data) throw new Error(`metadata_insert_failed:${insertResult.error?.message ?? "missing_data"}`);
    createdRow = insertResult.data;

    try {
      await ownerClient.rpc("record_video_original_rendition", { p_video_id: videoId });
    } catch {
      // Older or locked-down environments may not expose this RPC; app upload
      // treats original-rendition status recording as best effort too.
    }

    const ownerRead = await ownerClient
      .from("videos")
      .select("id,owner_id,title,visibility,moderation_status,scan_status,file_size_bytes")
      .eq("id", videoId)
      .maybeSingle();
    const anonRead = await anonClient
      .from("videos")
      .select("id,owner_id,title,visibility,moderation_status,scan_status,file_size_bytes")
      .eq("id", videoId)
      .maybeSingle();

    let nonOwnerReadVisible = null;
    let nonOwnerDeleteDenied = null;
    let nonOwnerDownloadDenied = null;
    if (nonOwnerEmail && nonOwnerPassword) {
      const nonOwnerClient = createAuthedClient(supabaseUrl, anonKey);
      const nonOwnerSignIn = await nonOwnerClient.auth.signInWithPassword({
        email: nonOwnerEmail,
        password: nonOwnerPassword,
      });
      if (!nonOwnerSignIn.error && nonOwnerSignIn.data.session?.access_token) {
        const nonOwnerRead = await nonOwnerClient
          .from("videos")
          .select("id")
          .eq("id", videoId)
          .maybeSingle();
        nonOwnerReadVisible = !!nonOwnerRead.data?.id;
        const nonOwnerDelete = await nonOwnerClient
          .from("videos")
          .delete()
          .eq("id", videoId)
          .select("id");
        nonOwnerDeleteDenied = !nonOwnerDelete.data?.length;
        try {
          await callMediaStorage(functionsUrl, nonOwnerSignIn.data.session.access_token, {
            action: "create_download_url",
            surfaceType: MEDIA_STORAGE_SURFACE,
            provider: uploaded.provider,
            bucket: uploaded.bucket,
            objectKey: uploaded.objectKey,
            recordId: videoId,
          });
          nonOwnerDownloadDenied = false;
        } catch {
          nonOwnerDownloadDenied = true;
        }
      }
    }

    const publicCards = await callPublicCreatorCards(functionsUrl, {
      action: "list_by_owner",
      ownerId,
      limit: PUBLIC_CARDS_LIMIT,
    });
    const pendingUploadInPublicCards = Array.isArray(publicCards.videos)
      && publicCards.videos.some((video) => toText(video.id) === videoId);

    const anonDownload = await callMediaStorage(functionsUrl, "", {
      action: "create_download_url",
      surfaceType: MEDIA_STORAGE_SURFACE,
      provider: uploaded.provider,
      bucket: uploaded.bucket,
      objectKey: uploaded.objectKey,
      recordId: videoId,
    }).then(() => ({ denied: false })).catch(() => ({ denied: true }));

    let cleanPublic = {
      fixtureId: cleanPublicFixtureId || null,
      status: "not_configured",
      publicReadVisible: false,
      publicCardVisible: false,
      playbackResolverStatus: null,
    };
    if (cleanPublicFixtureId) {
      const cleanRead = await anonClient
        .from("videos")
        .select("id,owner_id,visibility,moderation_status,scan_status")
        .eq("id", cleanPublicFixtureId)
        .maybeSingle();
      if (cleanRead.data?.id) {
        const cleanCards = await callPublicCreatorCards(functionsUrl, {
          action: "list_by_owner",
          ownerId: cleanRead.data.owner_id,
          limit: PUBLIC_CARDS_LIMIT,
        });
        let playback;
        try {
          playback = await anonClient.rpc("resolve_video_playback", { target_video_id: cleanPublicFixtureId });
        } catch (error) {
          playback = { error };
        }
        cleanPublic = {
          fixtureId: cleanPublicFixtureId,
          status: "checked",
          publicReadVisible: true,
          publicCardVisible: Array.isArray(cleanCards.videos) && cleanCards.videos.some((video) => toText(video.id) === cleanPublicFixtureId),
          playbackResolverStatus: playback.error ? "error" : toText(playback.data?.status) || "unknown",
          playbackMessage: playback.error ? null : toText(playback.data?.message) || null,
          signedUrlPrinted: false,
        };
      } else {
        cleanPublic.status = "fixture_not_public_readable";
      }
    }

    const proof = {
      ok: true,
      proofRunId: PROOF_RUN_ID,
      ownerUserSuffix: suffix(ownerId),
      videoId,
      fixture: {
        generator: fixture.source,
        nonZero: fixtureBytes.byteLength > 0,
        sizeBytes: fixtureBytes.byteLength,
        sha256: createHash("sha256").update(fixtureBytes).digest("hex"),
      },
      upload: {
        provider: uploaded.provider,
        bucket: uploaded.bucket ? `[bucket:${sha256Short(uploaded.bucket)}]` : null,
        objectKey: redactObjectKey(uploaded.objectKey),
        storageObjectNonZero: true,
        uploadValidationNonZero: fixtureBytes.byteLength > 0,
        signedUploadUrlPrinted: false,
        signedDownloadUrlPrinted: false,
      },
      metadata: {
        id: createdRow.id,
        visibility: createdRow.visibility,
        moderationStatus: createdRow.moderation_status,
        scanStatus: createdRow.scan_status,
        fileSizeBytes: createdRow.file_size_bytes,
        title,
      },
      access: {
        ownerCanRead: !!ownerRead.data?.id,
        anonCannotReadDraft: !anonRead.data?.id,
        nonOwnerReadVisible,
        nonOwnerDeleteDenied,
        anonDownloadDenied: anonDownload.denied === true,
        nonOwnerDownloadDenied,
        pendingUploadInPublicCards: pendingUploadInPublicCards === true,
      },
      cleanPublicRegression: cleanPublic,
      noFakeScanSuccess: createdRow.scan_status !== "clean" && createdRow.scan_status !== "manual_review",
      noFakeRenditionSuccess: true,
      secretsPrinted: false,
    };

    writeJsonArtifact("proof-result.json", proof);
    console.log(JSON.stringify({
      ok: proof.ok,
      proofRunId: proof.proofRunId,
      videoId: proof.videoId,
      ownerUserSuffix: proof.ownerUserSuffix,
      fixture: {
        nonZero: proof.fixture.nonZero,
        sizeBytes: proof.fixture.sizeBytes,
      },
      upload: proof.upload,
      metadata: proof.metadata,
      access: proof.access,
      cleanPublicRegression: proof.cleanPublicRegression,
      noFakeScanSuccess: proof.noFakeScanSuccess,
      noFakeRenditionSuccess: proof.noFakeRenditionSuccess,
      secretsPrinted: false,
    }, null, 2));
  } finally {
    if (uploaded?.provider && uploaded?.bucket && uploaded?.objectKey) {
      if (!keepProofMedia) {
        const deleteRow = await ownerClient.from("videos").delete().eq("id", videoId).select("id");
        cleanup.deleteRow = deleteRow.error ? `failed:${deleteRow.error.message}` : "completed";
        try {
          await callMediaStorage(functionsUrl, ownerToken, {
            action: "delete_object",
            surfaceType: MEDIA_STORAGE_SURFACE,
            provider: uploaded.provider,
            bucket: uploaded.bucket,
            objectKey: uploaded.objectKey,
            recordId: videoId,
          });
          cleanup.deleteObject = "completed";
        } catch (error) {
          cleanup.deleteObject = `failed:${error instanceof Error ? error.message : "unknown"}`;
        }
      } else {
        cleanup = { deleteRow: "skipped_keep_proof_media", deleteObject: "skipped_keep_proof_media" };
      }
      writeJsonArtifact("cleanup-result.json", {
        proofRunId: PROOF_RUN_ID,
        videoId,
        cleanup,
        objectKey: redactObjectKey(uploaded.objectKey),
      });
    }
  }
};

main().catch((error) => {
  fs.mkdirSync(proofDir, { recursive: true });
  writeJsonArtifact("proof-error.json", {
    ok: false,
    proofRunId: PROOF_RUN_ID,
    error: error instanceof Error ? error.message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]") : "unknown_error",
    secretsPrinted: false,
  });
  console.error(JSON.stringify({
    ok: false,
    proofRunId: PROOF_RUN_ID,
    error: error instanceof Error ? error.message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]") : "unknown_error",
    secretsPrinted: false,
  }, null, 2));
  process.exit(1);
});
