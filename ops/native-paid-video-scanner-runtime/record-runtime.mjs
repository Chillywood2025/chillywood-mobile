import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
assert.equal(process.version, 'v24.22.1');
const binarySha256 = {};
for (const name of ['node', 'ffmpeg', 'ffprobe', 'clamscan', 'sigtool', 'freshclam']) {
  const binary = '/usr/local/bin/' + name;
  const version = execFileSync(binary, [name === 'ffmpeg' || name === 'ffprobe' ? '-version' : '--version'], { encoding: 'utf8' }).split('\n')[0];
  if (['ffmpeg', 'ffprobe'].includes(name)) assert.match(version, /version 8\.1\.3(?:\s|-)/u);
  if (['clamscan', 'sigtool', 'freshclam'].includes(name)) assert.match(version, /^ClamAV 1\.5\.4(?:\/|\s|$)/u);
  binarySha256[name] = { path: binary, sha256: sha(await fs.readFile(binary)), version };
}
const cert = await fs.readFile('/opt/native-scanner/certs/clamav.crt');
assert.equal(new X509Certificate(cert).fingerprint256, '6B:3D:4E:1B:5E:26:31:8C:0B:B6:A2:2F:B1:20:6D:28:7F:A3:FB:0C:5F:E3:4E:EB:BF:86:13:95:4F:8A:64:A7');
const source = {};
async function record(directory) {
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path = directory + '/' + entry.name;
    assert.ok(!entry.isSymbolicLink(), 'Source symlinks are not admitted');
    if (entry.isDirectory()) await record(path);
    else if (entry.isFile()) source[path.slice('/app/'.length)] = sha(await fs.readFile(path));
    else assert.fail('Non-regular source entry');
  }
}
await record('/app/ops/isolated-paid-video-worker');
await record('/app/ops/native-paid-video-scanner-runtime');
const manifest = { protocol: 'scpv-r2-linux-runtime-v1', platform: 'linux/amd64',
  binarySha256, certificateSha256: sha(cert), source,
  packageClosure: execFileSync('/sbin/apk', ['info', '-vv'], { encoding: 'utf8' }).trim().split('\n').sort() };
await fs.writeFile('/app/runtime-manifest.json', JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
