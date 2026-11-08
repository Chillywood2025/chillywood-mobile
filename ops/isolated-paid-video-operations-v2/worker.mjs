#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRpc, privateJson, verifySource, runWorker, runScanChild, workerStatus, hash } from './runner.mjs';

// No defaults for endpoints, credentials, authority, binaries or worker scope.
// Configuration is an operator-owned 0600 JSON file; this command retrieves no
// credential, provisions nothing, and prints only bounded outcome categories.
async function main() {
  const [mode, file, decisionFile] = process.argv.slice(2), recovering = ['--resume-scan','--retire-scan'].includes(mode);
  if (!['--once','--poll','--scan-status','--resume-scan','--retire-scan'].includes(mode) || !path.isAbsolute(file ?? '')
    || process.argv.length !== (recovering ? 5 : 4) || (recovering && !path.isAbsolute(decisionFile ?? '')))
    throw new Error('Use worker.mjs --once|--poll|--scan-status config.json, or --resume-scan|--retire-scan config.json decision.json (absolute private paths).');
  const config = await privateJson(file);
  await verifySource(config.manifest, config.sourceRoot, config.binding.sourceSha256);
  if (mode === '--scan-status') { process.stdout.write(JSON.stringify(await workerStatus(config.stateDirectory))+'\n'); return; }
  const recovery = recovering ? await privateJson(decisionFile) : undefined;
  if (recovering && recovery.action !== (mode === '--resume-scan' ? 'resume' : 'retire')) throw new Error('paid_video_scan_recovery_invalid');
  if (mode !== '--retire-scan') {
  if (hash(JSON.stringify(config.binaryHashes)) !== config.binding.workerSha256) throw new Error('paid_video_binary_manifest_invalid');
  if (Object.keys(config.binaryHashes).sort().join() !== 'clamscan,ffmpeg,ffprobe,sigtool') throw new Error('paid_video_binary_manifest_invalid');
  for (const [name, digest] of Object.entries(config.binaryHashes)) {
    const binary = config.scanner?.binaries?.[name];
    if (!path.isAbsolute(binary ?? '') || hash(await fs.readFile(binary)) !== digest) throw new Error('paid_video_binary_changed');
  }
  if (!/^[a-f0-9]{64}$/u.test(config.workerKeyHex) || config.s3?.routeId !== config.binding.routeId) throw new Error('paid_video_worker_config_invalid');
  }
  if (!Number.isInteger(config.deadlineMs) || config.deadlineMs < 1000 || config.deadlineMs > 600000)
    throw new Error('paid_video_worker_config_invalid');
  const deadline = Date.now() + config.deadlineMs;
  const result = await runWorker({ binding: config.binding, directory: config.stateDirectory, rpc: createRpc({ binding: config.binding, token: config.serviceToken }),
    scan: (ticket, until, onProcess) => runScanChild({ ticket, configuration: config, deadline: until, onProcess }), deadline,
    recovery, recoveryAuthorizationSha256: config.recoveryAuthorizationSha256,
    maxJobs: mode === '--poll' ? config.maxJobs : 1, pollMs: mode === '--poll' ? config.pollMs : 0, uploadId: config.uploadId });
  process.stdout.write(JSON.stringify(result) + '\n');
  if (['unknown','interrupted_scan','held'].includes(result.state)) process.exitCode = 2;
}
main().catch(() => { process.stderr.write('paid_video_worker_stopped; inspect protected local state\n'); process.exitCode = 1; });
