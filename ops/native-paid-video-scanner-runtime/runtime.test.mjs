import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { REQUIRED_MEMORY, validateR2LinuxProof, validateResourceLimits, validateRuntimeApproval } from './gate.mjs';
const digest = 'a'.repeat(64), proof = 'b'.repeat(64), r2Proof = 'f'.repeat(64), image = 'registry.example/native-scanner@sha256:' + 'c'.repeat(64);
const approval = () => ({ protocol: 'scpv-r2-runtime-approval-v1', approved: true, linuxQualified: true, image, runtimeManifestSha256: digest, linuxProofSha256: proof, linuxR2ProofSha256: r2Proof, memoryLimitBytes: REQUIRED_MEMORY, concurrency: 1 });
test('runtime approval binds final image, exact runtime, Linux proof and one-job capacity', () => {
  assert.doesNotThrow(() => validateRuntimeApproval(approval(), image, digest, proof, r2Proof));
  for (const change of [{ approved: false }, { linuxQualified: false }, { image: 'registry.example/native-scanner:latest' },
    { runtimeManifestSha256: 'd'.repeat(64) }, { linuxProofSha256: 'e'.repeat(64) }, { linuxR2ProofSha256: '' }, { linuxR2ProofSha256: 'e'.repeat(64) }, { memoryLimitBytes: 2 * 1024 ** 3 }, { concurrency: 2 }])
    assert.throws(() => validateRuntimeApproval({ ...approval(), ...change }, image, digest, proof, r2Proof));
  assert.throws(() => validateRuntimeApproval(approval(), 'registry.example/native-scanner:latest', digest, proof, r2Proof));
  assert.throws(() => validateRuntimeApproval(approval(), image, digest, proof));
});
test('typed Linux proof requires completed cases and exact scanner wrapper sources', () => {
  const files = ['r2-job.mjs', 'r2-native.mjs', 'r2-protocol.mjs', 'r2-scan.native.mjs', 'scan.mjs'];
  const value = { status: 'passed', cleanup: { privateGeneratedFixturesRemoved: true }, cases: ['a', 'b', 'c', 'd'],
    actualCleanScan: { verdict: 'clean', moderation: 'unreviewed' }, actualMalwareTestVerdict: 'rejected',
    sourceSha256: Object.fromEntries(files.map(file => [file, digest])) };
  const manifest = { source: Object.fromEntries(files.map(file => ['ops/isolated-paid-video-worker/' + file, digest])) };
  assert.doesNotThrow(() => validateR2LinuxProof(value, manifest));
  for (const change of [{ status: 'failed' }, { cleanup: {} }, { cases: ['a'] }, { actualMalwareTestVerdict: 'clean' },
    { actualCleanScan: { verdict: 'clean', moderation: 'approved' } }, { sourceSha256: {} },
    { sourceSha256: { ...value.sourceSha256, 'r2-job.mjs': proof } }, { sourceSha256: { ...value.sourceSha256, 'extra.mjs': digest } }])
    assert.throws(() => validateR2LinuxProof({ ...value, ...change }, manifest));
});
test('resource contract rejects present Hetzner headroom and missing limits', () => {
  assert.doesNotThrow(() => validateResourceLimits({ memoryMax: String(REQUIRED_MEMORY), pidsMax: '128', availableBytes: 5 * 1024 ** 3 }));
  for (const values of [
    { memoryMax: 'max', pidsMax: '128', availableBytes: 5 * 1024 ** 3 },
    { memoryMax: String(REQUIRED_MEMORY), pidsMax: 'max', availableBytes: 5 * 1024 ** 3 },
    { memoryMax: String(REQUIRED_MEMORY), pidsMax: '129', availableBytes: 5 * 1024 ** 3 },
    { memoryMax: String(REQUIRED_MEMORY), pidsMax: '128', availableBytes: 1217 * 1024 ** 2 },
  ]) assert.throws(() => validateResourceLimits(values));
});
test('example is deliberately unqualified, no deployed claim', async () => {
  const example = JSON.parse(await fs.readFile(new URL('./runtime-approval.example.json', import.meta.url)));
  assert.throws(() => validateRuntimeApproval(example, image, digest, proof, r2Proof));
});
test('compose is isolated, bounded, digest-selected and has no automatic crash replay', async () => {
  const compose = await fs.readFile(new URL('./compose.yaml', import.meta.url), 'utf8');
  for (const required of ['profiles: [native-scanner]', 'restart: "no"', 'read_only: true', 'cap_drop: [ALL]', 'no-new-privileges:true', 'mem_limit: 4g', 'memswap_limit: 4g', 'pids_limit: 128', 'stop_grace_period: 150s', 'PAID_VIDEO_R2_SCANNER_RPC_TOKEN_FILE', 'PAID_VIDEO_R2_SCANNER_KEY_FILE'])
    assert.ok(compose.includes(required), required);
  assert.ok(!compose.includes('ports:')); assert.ok(!compose.includes('privileged:')); assert.ok(!compose.includes('docker.sock'));
  assert.equal(compose.split('target: /run/native-scanner/linux-r2-qualification.json').length - 1, 2);
});
test('Dockerfile pins official base and direct package versions without inherited daemon', async () => {
  const source = await fs.readFile(new URL('./Dockerfile', import.meta.url), 'utf8');
  assert.ok(source.includes('clamav/clamav:1.5.4_base@sha256:b2c2f5c9a557dc1c1249e09448a84c59c3e414bb3bbbac0a9d065236c779842c'));
  for (const pin of ['nodejs=24.22.1-r1', 'ffmpeg=8.1.3-r0', 'tini=0.19.0-r3', 'ca-certificates=20261020-r0']) assert.ok(source.includes(pin));
  assert.ok(source.includes('ENTRYPOINT ["/sbin/tini", "-g"'));
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE_KEY')); assert.ok(!source.includes('CLOUDFLARE_API_TOKEN'));
});
