import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('incoming-call harness overrides only the wrapper download timeout and preserves its pin and test deadline', () => {
  const source = fs.readFileSync(new URL('../../scripts/test-android-incoming-call-deadline.mjs', import.meta.url), 'utf8');
  const match = source.match(/fs\.appendFileSync\(propertiesPath, ("(?:[^"\\]|\\.)*")\);/u);
  assert.ok(match, 'the actual generated wrapper configuration must be checked');
  const appended = JSON.parse(match[1]);
  assert.equal(appended, '\nnetworkTimeout=60000\ndistributionSha256Sum=bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531\n');
  const template = 'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.3-bin.zip\nnetworkTimeout=10000\nvalidateDistributionUrl=true\n';
  const properties = Object.fromEntries((template + appended).trim().split('\n').map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  assert.equal(properties.networkTimeout, '60000');
  assert.equal(properties.distributionUrl, 'https\\://services.gradle.org/distributions/gradle-8.14.3-bin.zip');
  assert.equal(properties.validateDistributionUrl, 'true');
  assert.match(source, /assert\(properties\.includes\("gradle-8\.14\.3-bin\.zip"\)/u);
  assert.match(source, /testDebugUnitTest[\s\S]*?timeout: 20 \* 60_000/u);
  for (const key of ['failures', 'errors', 'skipped']) assert.ok(source.includes(`${key}="0"`));
});
