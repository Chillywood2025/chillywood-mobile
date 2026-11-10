import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { inspectDefinitions } from '../isolated-paid-video-worker/scan.mjs';
import { resolveDefinitionSnapshot } from './definition-snapshots.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const HEX = /^[a-f0-9]{64}$/u;
const IMAGE = /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/u;
export const REQUIRED_MEMORY = 4 * 1024 ** 3;
export function validateRuntimeApproval(approval, image, manifestSha256, proofSha256, r2ProofSha256) {
  assert.ok(approval && approval.protocol === 'scpv-r2-runtime-approval-v1'
    && approval.approved === true && approval.linuxQualified === true, 'Native Linux runtime is not approved and qualified');
  assert.ok(typeof image === 'string' && IMAGE.test(image) && approval.image === image, 'Final image digest binding is required');
  assert.ok(HEX.test(manifestSha256) && approval.runtimeManifestSha256 === manifestSha256, 'Runtime manifest mismatch');
  assert.ok(HEX.test(proofSha256) && approval.linuxProofSha256 === proofSha256, 'Linux qualification mismatch');
  assert.ok(HEX.test(r2ProofSha256) && approval.linuxR2ProofSha256 === r2ProofSha256, 'Typed R2 Linux qualification mismatch');
  assert.equal(approval.memoryLimitBytes, REQUIRED_MEMORY);
  assert.equal(approval.concurrency, 1);
}
export function validateR2LinuxProof(proof, manifest) {
  assert.equal(proof?.status, 'passed', 'Typed R2 qualification must pass');
  assert.equal(proof.cleanup?.privateGeneratedFixturesRemoved, true);
  assert.ok(Array.isArray(proof.cases) && proof.cases.length === 4);
  assert.equal(proof.actualCleanScan?.verdict, 'clean');
  assert.equal(proof.actualCleanScan?.moderation, 'unreviewed');
  assert.equal(proof.actualMalwareTestVerdict, 'rejected');
  const files = ['r2-job.mjs', 'r2-native.mjs', 'r2-protocol.mjs', 'r2-scan.native.mjs', 'scan.mjs'];
  assert.deepEqual(Object.keys(proof.sourceSha256 ?? {}).sort(), files);
  for (const file of files) {
    assert.ok(HEX.test(proof.sourceSha256[file]));
    assert.equal(proof.sourceSha256[file], manifest.source?.['ops/isolated-paid-video-worker/' + file], 'Typed R2 proof source mismatch');
  }
}
export function validateResourceLimits({ memoryMax, pidsMax, availableBytes }) {
  assert.equal(Number(memoryMax), REQUIRED_MEMORY, 'A dedicated 4 GiB memory limit is required');
  assert.ok(Number.isInteger(Number(pidsMax)) && Number(pidsMax) > 0 && Number(pidsMax) <= 128, 'PID limit missing');
  assert.ok(availableBytes >= REQUIRED_MEMORY, 'Host currently lacks 4 GiB available memory');
}
async function trustedFile(file, maxBytes = 1048576) {
  const stat = await fs.lstat(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size > 0 && stat.size <= maxBytes, 'Untrusted runtime file');
  assert.equal(stat.mode & 0o022, 0, 'Runtime trust file must not be group/world writable');
  return fs.readFile(file);
}
export async function preflight({ health = false, definitions = true } = {}) {
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
  assert.equal(process.getuid(), 65532, 'Unprivileged fixed worker user required');
  const approvalBytes = await trustedFile('/run/native-scanner/runtime-approval.json');
  const manifestBytes = await trustedFile('/app/runtime-manifest.json');
  const proofBytes = await trustedFile('/run/native-scanner/linux-qualification.json');
  const r2ProofBytes = await trustedFile('/run/native-scanner/linux-r2-qualification.json');
  const approval = JSON.parse(approvalBytes), manifest = JSON.parse(manifestBytes), proof = JSON.parse(proofBytes);
  validateRuntimeApproval(approval, process.env.NATIVE_SCANNER_IMAGE, sha(manifestBytes), sha(proofBytes), sha(r2ProofBytes));
  assert.equal(manifest.protocol, 'scpv-r2-linux-runtime-v1');
  assert.equal(manifest.platform, 'linux/amd64');
  assert.equal(proof.status, 'passed');
  assert.equal(proof.sourceSha256, manifest.source['ops/isolated-paid-video-worker/scan.mjs']);
  assert.equal(proof.cleanup?.privateGeneratedFixturesRemoved, true);
  assert.ok(Array.isArray(proof.cases) && proof.cases.length === 7);
  validateR2LinuxProof(JSON.parse(r2ProofBytes), manifest);
  assert.deepEqual(Object.keys(manifest.binarySha256).sort(), ['clamscan', 'ffmpeg', 'ffprobe', 'freshclam', 'node', 'sigtool']);
  for (const [name, expected] of Object.entries(manifest.binarySha256)) {
    assert.equal(expected.path, '/usr/local/bin/' + name); assert.ok(HEX.test(expected.sha256));
    assert.equal(sha(await fs.readFile(expected.path)), expected.sha256, 'Binary drift');
    if (['clamscan', 'ffmpeg', 'ffprobe', 'sigtool'].includes(name)) assert.equal(proof.toolEvidence?.[name]?.executableSha256, expected.sha256, 'Proof was not run on this executable');
  }
  for (const [relative, expected] of Object.entries(manifest.source)) {
    assert.ok(/^ops\/(isolated-paid-video-worker|native-paid-video-scanner-runtime)\/[a-zA-Z0-9_./-]+$/u.test(relative)
      && !relative.split('/').includes('..') && HEX.test(expected));
    assert.equal(sha(await trustedFile('/app/' + relative)), expected, 'Source drift');
  }
  assert.equal(sha(await trustedFile('/opt/native-scanner/certs/clamav.crt')), manifest.certificateSha256);
  assert.equal(proof.trustCertificateSha256, manifest.certificateSha256, 'Proof trust root mismatch');
  const rootMount = (await fs.readFile('/proc/mounts', 'utf8')).split('\n').find(line => line.split(' ')[1] === '/');
  assert.ok(rootMount?.split(' ')[3].split(',').includes('ro'), 'Read-only container root required');
  const procStatus = await fs.readFile('/proc/self/status', 'utf8');
  assert.match(procStatus, /^CapEff:\s*0+$/mu); assert.match(procStatus, /^NoNewPrivs:\s*1$/mu);
  if (!health) {
    const meminfo = await fs.readFile('/proc/meminfo', 'utf8');
    const available = /^MemAvailable:\s*([0-9]+) kB$/mu.exec(meminfo);
    validateResourceLimits({ memoryMax: (await fs.readFile('/sys/fs/cgroup/memory.max', 'utf8')).trim(),
      pidsMax: (await fs.readFile('/sys/fs/cgroup/pids.max', 'utf8')).trim(), availableBytes: Number(available?.[1]) * 1024 });
  }
  for (const dir of ['/work', '/state']) {
    const stat = await fs.lstat(dir); assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    assert.equal(await fs.realpath(dir), dir);
    assert.equal(stat.mode & 0o077, 0, 'Private runtime directories required'); assert.equal(stat.uid, 65532);
  }
  if (!definitions) return { ready: true, scope: 'Qualified runtime integrity only; definition updater preparation' };
  await assert.rejects(fs.stat('/state/pending.json'), { code: 'ENOENT' }, 'Uncertain completion requires reconciliation');
  const config = JSON.parse(await trustedFile('/run/native-scanner/config.json'));
  let directory;
  if (config.scanner?.definitionSnapshotsDirectory === '/definitions' && !config.scanner.databaseDirectory)
    directory = (await resolveDefinitionSnapshot({ root: '/definitions', certificateDirectory: '/opt/native-scanner/certs', sigtool: '/usr/local/bin/sigtool' })).directory;
  else {
    assert.equal(config.scanner?.databaseDirectory, '/definitions'); assert.ok(!config.scanner.definitionSnapshotsDirectory);
    directory = '/definitions';
  }
  const manifestDefinitions = await inspectDefinitions({ directory, certificateDirectory: '/opt/native-scanner/certs', sigtool: '/usr/local/bin/sigtool' });
  return { ready: true, definitionsManifestSha256: manifestDefinitions.manifestSha256,
    dailyCreatedAt: manifestDefinitions.files.find(item => item.filename === 'daily.cvd').createdAt,
    scope: 'Runtime integrity and definition health only; not queue, moderation, provider or playback proof' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assert.deepEqual(process.argv.slice(2), ['--health']); process.stdout.write(JSON.stringify(await preflight({ health: true })) + '\n'); }
  catch { process.stderr.write('native_scanner_runtime_not_ready\n'); process.exitCode = 1; }
}
