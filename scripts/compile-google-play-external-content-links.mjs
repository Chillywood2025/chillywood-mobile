import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Actual published Billing + Android classes, never fake API stubs. This checks
// Java controller signatures and executes state-machine tests. It does NOT
// qualify the Expo Kotlin bridge, generated app, device, or distribution build.
const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'chillywood-ecl-compile-'));
const cache = process.env.CHILLYWOOD_ECL_COMPILER_CACHE || path.join(os.tmpdir(), 'chillywood-ecl-compiler-cache');
fs.mkdirSync(cache, { recursive: true });
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe' });
  assert.equal(result.status, 0, `${command} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
}
const artifacts = [
  ['billing.aar', 'https://dl.google.com/dl/android/maven2/com/android/billingclient/billing/8.2.1/billing-8.2.1.aar', '5fe141489daebd43e0b62ade8ef70470139515806d7729aa961263f1bd7dbc9c'],
  ['ecj.jar', 'https://repo.maven.apache.org/maven2/org/eclipse/jdt/ecj/3.39.0/ecj-3.39.0.jar', '01f5a92ac19bb2b3bf85e295a68f2c73c264369109158b566ce9b490af982948'],
  ['android14.jar', 'https://repo.maven.apache.org/maven2/org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar', '6be2218c6a53fe3c57bc22ebdc723edcb7270a8a6f187545708aa5c0ed813977'],
];
try {
  for (const [name, url, digest] of artifacts) {
    const destination = path.join(cache, name);
    if (!fs.existsSync(destination)) run('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '180', url, '--output', destination]);
    assert.equal(createHash('sha256').update(fs.readFileSync(destination)).digest('hex'), digest, `Pinned ${name} integrity mismatch`);
  }
  run('unzip', ['-oq', path.join(cache, 'billing.aar'), 'classes.jar', '-d', temporary]);
  const source = path.join(root, 'modules/chillywood-external-content-links/android/src');
  const classes = path.join(temporary, 'classes');
  const files = ['ExternalLinkFlow.java', 'GooglePlayTransport.java'].map(name => path.join(source, 'main/java/expo/modules/chillywoodexternalcontentlinks', name));
  files.push(path.join(source, 'test/java/expo/modules/chillywoodexternalcontentlinks/ExternalLinkFlowTest.java'));
  const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java') : 'java';
  // Java 8 source target is sufficient for these controllers and avoids treating
  // android-all's boot Java classes as a competing Java 9+ named module.
  run(java, ['-jar', path.join(cache, 'ecj.jar'), '-8', '-warn:none', '-cp', `${path.join(temporary, 'classes.jar')}${path.delimiter}${path.join(cache, 'android14.jar')}`, '-d', classes, ...files]);
  process.stdout.write(run(java, ['-cp', classes, 'expo.modules.chillywoodexternalcontentlinks.ExternalLinkFlowTest']));
  console.log('Pinned Google Billing 8.2.1 / real Android controller compilation passed (Expo bridge/full Gradle qualification still required).');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
