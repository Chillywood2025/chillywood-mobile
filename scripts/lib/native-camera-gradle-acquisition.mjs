import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {downloadIncomingCallGradle, GRADLE_URL, GRADLE_SHA256} from './incoming-call-gradle-download.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// Only the disposable compiler wrapper changes. The shared downloader verifies
// the official artifact before returning; compilation itself is never retried.
export function prepareNativeCameraGradle(wrapper, workspace, {download = downloadIncomingCallGradle} = {}) {
  const original = fs.readFileSync(wrapper, 'utf8');
  const urls = original.match(/^distributionUrl=.*$/gmu) ?? [];
  assert.equal(urls.length, 1, 'Exactly one generated Gradle distribution is required');
  assert.equal(urls[0].replace(/\r$/u, ''), `distributionUrl=${GRADLE_URL.replace(':', '\\:')}`,
    'Review the pinned compiler distribution before changing it');
  assert(!/^distributionSha256Sum=/mu.test(original), 'Review an existing generated Gradle checksum');
  const destination = path.resolve(workspace, 'camera-gradle-8.14.3-bin.zip');
  assert.equal(download(destination), destination, 'Verified Gradle acquisition must return the requested artifact');
  const effective = original.replace(/^distributionUrl=.*$/mu, `distributionUrl=${pathToFileURL(destination).href}`)
    + `\ndistributionSha256Sum=${GRADLE_SHA256}\n`;
  fs.writeFileSync(wrapper, effective);
  return {officialUrl: GRADLE_URL, artifactSha256: GRADLE_SHA256,
    generatedWrapperSha256: sha(original), effectiveWrapperSha256: sha(effective),
    acquisitionHelperSha256: sha(fs.readFileSync(new URL('./incoming-call-gradle-download.mjs', import.meta.url))),
    wrapperAdapterSha256: sha(fs.readFileSync(new URL(import.meta.url)))};
}
