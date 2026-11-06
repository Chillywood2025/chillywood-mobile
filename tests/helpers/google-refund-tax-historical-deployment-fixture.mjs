// Test-only original deployment closure. Never qualifies today's changed Edge
// code or rewrites a deployment manifest to accept a successor implementation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {CLOSURE, MANIFEST, loadBundle} from '../../scripts/google-refund-tax-exact-deploy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = path.join(root, 'tests/fixtures/google-refund-tax-deployment-20261104');
const inventory = JSON.parse(fs.readFileSync(path.join(fixture, 'closure.json'), 'utf8'));
export const HISTORICAL_REFUND_SOURCE = inventory.source;
assert.equal(inventory.schema, 1);
assert.equal(HISTORICAL_REFUND_SOURCE, 'ff1211fab1c5bba31939ab341f1f4ba744b23081');

export function readHistoricalRefundSource(file) {
  const entry = inventory.files.find(entry => entry.path === file);
  assert.ok(entry, 'historical fixture reads only the exact deployment closure');
  const bytes = fs.readFileSync(path.join(root, entry.snapshot ?? entry.path), 'utf8');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `historical source digest: ${file}`);
  return bytes;
}

const manifest = JSON.parse(readHistoricalRefundSource(MANIFEST));
const ingress = JSON.parse(readHistoricalRefundSource('scripts/native-ingress-deployment-manifest.json'));
const files = new Set([...CLOSURE, ...manifest.edge.flatMap(edge => edge.files.map(file => file.path)),
  ...ingress.edge.files.map(file => file.path)]);
assert.deepEqual(inventory.files.map(file => file.path).sort(), [...files].sort());

export function materializeHistoricalRefundClosure(directory) {
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), {recursive: true});
    fs.writeFileSync(path.join(directory, file), readHistoricalRefundSource(file));
  }
}

export function loadHistoricalRefundBundle() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-refund-closure-'));
  try {
    materializeHistoricalRefundClosure(directory);
    // The unchanged real loader verifies the original Edge and migration hashes.
    return loadBundle(directory);
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
}
