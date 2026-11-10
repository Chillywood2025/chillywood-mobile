import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { inspectDefinitions, runBounded } from '../isolated-paid-video-worker/scan.mjs';
import { readDefinitionPointer } from './definition-snapshots.mjs';
import { preflight } from './gate.mjs';
import { syncDirectory } from './state-lock.mjs';
const root = '/definition-store', certs = '/opt/native-scanner/certs', sigtool = '/usr/local/bin/sigtool';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function privateDirectory(directory) {
  const stat = await fs.lstat(directory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 && stat.uid === process.getuid());
  assert.equal(await fs.realpath(directory), directory);
}
export function requireMonotonicDefinitions(previous, next) {
  if (!previous) return;
  for (const old of previous.files) {
    const current = next.files.find(file => file.filename === old.filename);
    assert.ok(current && current.version >= old.version, 'Definition rollback rejected');
    if (current.version === old.version) assert.equal(current.sha256, old.sha256, 'Same-version definition substitution rejected');
  }
}
export async function loadPreviousDefinitionManifest(directoryRoot) {
  // Only a truly absent pointer is bootstrap. A present pointer with a missing
  // target/manifest must never reset the monotonic baseline.
  try { await fs.lstat(path.join(directoryRoot, 'active.json')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const id = await readDefinitionPointer(directoryRoot);
  const directory = path.join(directoryRoot, 'snapshots', id);
  assert.equal(await fs.realpath(directory), directory);
  const file = path.join(directory, 'snapshot-manifest.json');
  const stat = await fs.lstat(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size < 16384 && (stat.mode & 0o022) === 0);
  const previous = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(previous.protocol, 'scpv-definition-manifest-v1');
  assert.ok(Array.isArray(previous.files));
  assert.deepEqual(previous.files.map(item => item.filename).sort(), ['bytecode.cvd', 'daily.cvd', 'main.cvd']);
  for (const file of previous.files) assert.ok(Number.isSafeInteger(file.version) && file.version > 0 && /^[a-f0-9]{64}$/u.test(file.sha256));
  assert.equal(sha(JSON.stringify(previous.files)), id);
  assert.equal(previous.manifestSha256, id);
  return previous;
}
async function refreshOnce() {
  await privateDirectory(root);
  const lock = await fs.open(path.join(root, 'updater.lock'), 'wx', 0o600);
  let staging;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    await lock.sync(); await syncDirectory(root);
    const previous = await loadPreviousDefinitionManifest(root);
    staging = await fs.mkdtemp(path.join(root, 'staging-')); await fs.chmod(staging, 0o700);
    if (previous) {
      const priorDirectory = path.join(root, 'snapshots', previous.manifestSha256);
      for (const file of previous.files) {
        assert.ok(['main.cvd', 'daily.cvd', 'bytecode.cvd'].includes(file.filename));
        for (const name of [file.filename, file.filename.slice(0, -4) + '-' + file.version + '.cvd.sign'])
          await fs.copyFile(path.join(priorDirectory, name), path.join(staging, name));
      }
    }
    const cooldown = path.join(root, 'freshclam.dat');
    try { await fs.copyFile(cooldown, path.join(staging, 'freshclam.dat')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    let update;
    try {
      update = await runBounded('/usr/local/bin/freshclam', [
        '--config-file=/app/ops/native-paid-video-scanner-runtime/freshclam.snapshot.conf',
        '--datadir=' + staging, '--cvdcertsdir=' + certs, '--stdout'], { timeoutMs: 300000 });
    } finally {
      // Preserve official CDN cooldown state even after an unsuccessful attempt.
      try { await fs.copyFile(path.join(staging, 'freshclam.dat'), cooldown); await fs.chmod(cooldown, 0o600); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    assert.equal(update.code, 0, 'Official definition update failed; no retry or mirror change');
    const next = await inspectDefinitions({ directory: staging, certificateDirectory: certs, sigtool });
    requireMonotonicDefinitions(previous, next);
    await fs.writeFile(path.join(staging, 'snapshot-manifest.json'), JSON.stringify(next) + '\n', { flag: 'wx', mode: 0o400 });
    const snapshots = path.join(root, 'snapshots');
    await fs.mkdir(snapshots, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    await privateDirectory(snapshots);
    const destination = path.join(snapshots, next.manifestSha256);
    try {
      await fs.access(destination);
      const existing = await inspectDefinitions({ directory: destination, certificateDirectory: certs, sigtool });
      assert.equal(existing.manifestSha256, next.manifestSha256);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      for (const name of await fs.readdir(staging)) {
        const file = path.join(staging, name);
        await fs.chmod(file, 0o400);
        const handle = await fs.open(file, 'r');
        try { await handle.sync(); } finally { await handle.close(); }
      }
      await fs.chmod(staging, 0o500); await syncDirectory(staging);
      await fs.rename(staging, destination); staging = null;
      await syncDirectory(snapshots); await syncDirectory(root);
    }
    const pointer = path.join(root, 'active-' + randomUUID() + '.json');
    const active = await fs.open(pointer, 'wx', 0o600);
    try {
      await active.writeFile(JSON.stringify({ protocol: 'scpv-definition-pointer-v1', manifestSha256: next.manifestSha256 }) + '\n');
      await active.sync();
    } finally { await active.close(); }
    await fs.rename(pointer, path.join(root, 'active.json'));
    await syncDirectory(root);
    process.stdout.write(JSON.stringify({ event: 'definition_snapshot_ready', manifestSha256: next.manifestSha256,
      dailyVersion: next.files.find(file => file.filename === 'daily.cvd').version }) + '\n');
  } finally {
    if (staging) { await fs.chmod(staging, 0o700); await fs.rm(staging, { recursive: true, force: true }); }
    await lock.close(); await fs.unlink(path.join(root, 'updater.lock'));
    await syncDirectory(root);
  }
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const controller = new AbortController();
  process.on('SIGTERM', () => controller.abort()); process.on('SIGINT', () => controller.abort());
  try {
    assert.equal(process.getuid(), 65532); assert.equal(process.platform, 'linux');
    assert.ok(process.argv.length === 3 && ['--once', '--supervise'].includes(process.argv[2]));
    await preflight({ definitions: false });
    do {
      await refreshOnce();
      if (process.argv[2] === '--once' || controller.signal.aborted) break;
      await sleep(12 * 3600000, null, { signal: controller.signal });
    } while (!controller.signal.aborted);
  } catch (error) {
    if (!controller.signal.aborted) { process.stderr.write('native_scanner_definition_refresh_stopped\n'); process.exitCode = 1; }
    else if (error.name !== 'AbortError') process.exitCode = 1;
  }
}
