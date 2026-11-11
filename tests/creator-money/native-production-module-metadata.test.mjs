import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('production Paid Video declares Expo library publication version without changing Store SDK pins', () => {
  const root = 'modules/chillywood-production-paid-video';
  const metadata = JSON.parse(fs.readFileSync(`${root}/package.json`, 'utf8'));
  const gradle = fs.readFileSync(`${root}/android/build.gradle`, 'utf8');
  const config = gradle.match(/defaultConfig\s*\{([^}]+)\}/u)?.[1];
  assert.ok(config, 'Android defaultConfig is required');
  assert.equal(config.match(/versionName\s+'([^']+)'/u)?.[1], metadata.version);
  assert.match(config, /versionCode\s+1\b/u);
  assert.match(config, /minSdkVersion\s+24\b/u);
  assert.match(gradle, /id 'expo-module-gradle-plugin'/u);
  assert.match(gradle, /purchases:10\.28\.1/u);
  assert.match(gradle, /integrity:1\.6\.0/u);
});
