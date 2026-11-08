#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRpc, privateJson, privateDocument, durableJson, verifySource, hash } from './runner.mjs';
import { createPrivateS3Transport } from '../isolated-paid-video-worker/private-object.mjs';

// A human supplies an evidence packet only after viewing the exact media. This
// program does not classify content, manufacture evidence or authorize itself.
async function main() {
  const [action, configFile, inputFile] = process.argv.slice(2);
  if (!['inspect','media','decide','recover'].includes(action) || !path.isAbsolute(configFile ?? '')
    || (action !== 'recover' && !path.isAbsolute(inputFile ?? '')) || process.argv.length !== (action === 'recover' ? 4 : 5))
    throw new Error('Use reviewer.mjs inspect|media|decide /private/config.json /private/input.json, or recover /private/config.json');
  const config = await privateJson(configFile);
  await verifySource(config.manifest, config.sourceRoot, config.binding.sourceSha256);
  const rpc = createRpc({ binding: config.binding, token: config.userAccessToken, apiKey: config.publishableKey });
  const directory = config.stateDirectory, lock = path.join(directory, 'reviewer.lock');
  await fs.mkdir(lock, { mode: 0o700 });
  try {
    let retained;
    try { retained = await privateJson(path.join(directory, 'review.json')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (retained && (retained.endpoint !== config.binding.endpoint || retained.reviewerId !== config.reviewerId || retained.sessionId !== config.sessionId))
      throw new Error('paid_video_review_retained_identity_changed');
    if (action !== 'recover' && retained?.phase === 'unknown') throw new Error('paid_video_review_recovery_required');
    let raw;
    if (action === 'recover') {
      if (!retained || retained.phase !== 'unknown') throw new Error('paid_video_review_no_unknown_request');
      raw = retained.raw;
    } else {
      const document = await privateDocument(inputFile), input = document.value;
      const base = { protocol: 'scpv-review-request-v1', requestId: randomUUID(), reviewerId: config.reviewerId, sessionId: config.sessionId, uploadId: input.uploadId };
      if (action === 'decide') {
        if (input.humanReviewConfirmed !== true || input.reviewerId !== config.reviewerId || !['clear','held','removed'].includes(input.decision)
          || input.snapshot?.uploadId !== input.uploadId || !['viewed_exact_media','external_report'].includes(input.basis)
          || (input.basis === 'viewed_exact_media' && input.viewedMediaSha256 !== input.snapshot.sha256)
          || (input.decision === 'clear' && input.basis !== 'viewed_exact_media') || !input.reviewedAt
          || typeof input.rationale !== 'string' || input.rationale.trim().length < 10 || input.rationale.length > 4000)
          throw new Error('paid_video_explicit_human_evidence_required');
        Object.assign(base, { snapshot: input.snapshot, decision: input.decision, evidenceSha256: hash(document.raw),
          reviewedAt: input.reviewedAt, humanReviewConfirmed: true });
      }
      raw = JSON.stringify(base);
      if (action === 'decide') {
        retained = { phase: 'unknown', raw, endpoint: config.binding.endpoint, reviewerId: config.reviewerId, sessionId: config.sessionId };
        await durableJson(directory, 'review.json', retained);
      }
    }
    const result = await rpc(action === 'media' ? 'inspect' : action, raw, Date.now() + 10000, 'isolated_paid_video_review_v1');
    if (action === 'inspect' || action === 'media') {
      if (result?.uploadId !== JSON.parse(raw).uploadId) throw new Error('paid_video_review_snapshot_invalid');
      if (action === 'media') {
        if (result.state !== 'clean' || result.object?.routeId !== config.binding.routeId || !result.object.objectVersion)
          throw new Error('paid_video_review_clean_media_required');
        const transport = createPrivateS3Transport(config.s3);
        const media = await transport.readForScan(result.object, Date.now() + 15000);
        const after = await rpc('inspect', raw, Date.now() + 10000, 'isolated_paid_video_review_v1');
        if (JSON.stringify(after) !== JSON.stringify(result) || media.objectVersion !== result.object.objectVersion || hash(media.bytes) !== result.sha256)
          throw new Error('paid_video_review_media_changed');
        const file = path.join(directory, `${result.incarnation}.mp4`);
        // Never replace a file the reviewer may already have open.
        const handle = await fs.open(file, 'wx', 0o600);
        try { await handle.writeFile(media.bytes); await handle.sync(); } finally { await handle.close(); }
        await durableJson(directory, 'evidence-template.json', { uploadId: result.uploadId, reviewerId: config.reviewerId, snapshot: result,
          viewedMediaSha256: result.sha256, basis: 'viewed_exact_media', humanReviewConfirmed: false, decision: null, reviewedAt: null, rationale: '' });
      }
      await durableJson(directory, 'snapshot.json', result);
      process.stdout.write('snapshot_saved; manual exact-media review required\n'); return;
    }
    if (result?.state !== 'acknowledged' || result.requestId !== JSON.parse(raw).requestId || result.decision !== JSON.parse(raw).decision) {
      process.stdout.write('unknown; retained request requires read-only recovery\n'); process.exitCode = 2; return;
    }
    await durableJson(directory, 'review.json', { ...retained, phase: 'acknowledged', result });
    process.stdout.write(`acknowledged ${result.decision}\n`);
  } finally { await fs.rmdir(lock); }
}
main().catch(() => { process.stderr.write('paid_video_reviewer_stopped; inspect protected local state\n'); process.exitCode = 1; });
