import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const edgeSdkVersion = '2.110.6';
export const mobileSdkVersion = '2.100.0-chillywood.1';
// Official npm metadata for @supabase/supabase-js@2.110.6.
export const edgeSdkIntegrity = 'sha512-UJTAz1NUiSRI2mQYhUPvNMwqfkSucV1iSCcMJz8jgsSUTOfic9C3D6LGNOrH6KTvYUhxRvnf3ktq2Sd3IXIQzQ==';
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');

export function loadExactNotificationSdks() {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'), 'utf8'));
  assert.equal(manifest.dependencies['@supabase/supabase-js'], edgeSdkVersion);
  assert.equal(lock.packages[''].dependencies['@supabase/supabase-js'], edgeSdkVersion);
  assert.equal(lock.packages['node_modules/@supabase/supabase-js'].integrity, edgeSdkIntegrity);
  assert.match(fs.readFileSync(path.join(root, 'supabase/functions/notification-device-tokens/index.ts'), 'utf8'),
    /from "npm:@supabase\/supabase-js@2\.110\.6"/u);
  for (const [relative, locked] of Object.entries(lock.packages)) {
    if (!relative) continue;
    assert.equal(new URL(locked.resolved).origin, 'https://registry.npmjs.org');
    assert.match(locked.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/u);
    const packageFile = path.join(directory, relative, 'package.json');
    assert.ok(fs.existsSync(packageFile), 'Install exact Edge SDK: npm ci --ignore-scripts --prefix isolated-runtime/notification-edge-sdk');
    const installed = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    assert.equal(installed.version, locked.version, `installed fixture package ${relative}`);
  }
  const edgeRequire = createRequire(path.join(directory, 'package.json'));
  const mobileRequire = createRequire(path.join(root, 'package.json'));
  const edgeEntry = edgeRequire.resolve('@supabase/supabase-js');
  assert.ok(edgeEntry.startsWith(path.join(directory, 'node_modules') + path.sep), 'Edge must not fall back to the mobile SDK');
  const mobile = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/@supabase/supabase-js/package.json'), 'utf8'));
  assert.equal(mobile.version, mobileSdkVersion);
  for (const name of ['auth-js', 'functions-js', 'postgrest-js', 'realtime-js', 'storage-js']) {
    assert.equal(lock.packages[`node_modules/@supabase/${name}`].version, edgeSdkVersion);
    assert.ok(edgeRequire.resolve(`@supabase/${name}`).startsWith(path.join(directory, 'node_modules') + path.sep));
  }
  return {
    createEdgeClient: edgeRequire('@supabase/supabase-js').createClient,
    createMobileClient: mobileRequire('@supabase/supabase-js').createClient,
    versions: { mobile: mobile.version, edge: edgeSdkVersion },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({ ...loadExactNotificationSdks().versions, edgeSdkIntegrity, verified: true }));
}
