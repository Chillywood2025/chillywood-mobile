import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { priorAccountActionSettings } from './gallery-settings-context.mjs';

const directory = new URL('../fixtures/notification-history/', import.meta.url);
export const notificationHistoryProvenance = JSON.parse(readFileSync(new URL('provenance.json', directory), 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');

// These reviewed reverse patches retain historical notification behavior while
// preserving unrelated future source edits. No local Git object is required.
// Every hunk must match once; changed notification code requires fixture review.
export function notificationHistoricalSource(name) {
  const fixture = notificationHistoryProvenance.find(entry => entry.name === name);
  assert.ok(fixture, `known notification source fixture: ${name}`);
  const source = readFileSync(new URL(`../../${fixture.path}`, import.meta.url), 'utf8');
  // Only the separately reviewed gallery delta is projected back. Preserve the
  // original patches and account-action witness hashes, including their exact
  // context around notification state; never treat projected bytes as raw source.
  const current = fixture.path === 'app/settings.tsx' ? priorAccountActionSettings(source) : source;
  const lines = readFileSync(new URL(`${name}.patch`, directory), 'utf8').split('\n');
  assert.equal(lines.shift(), `--- ${fixture.path}`);
  assert.equal(lines.shift(), `+++ ${fixture.path}`);
  let result = current, before = '', after = '', hunks = 0;
  const apply = () => {
    if (!before) return;
    assert.equal(result.split(before).length, 2, `${name}: historical hunk must match exactly once`);
    result = result.replace(before, after);
    before = ''; after = ''; hunks++;
  };
  for (const line of lines) {
    if (line.startsWith('@@ ')) { apply(); continue; }
    if (!line) continue;
    assert.ok([' ', '-', '+'].includes(line[0]), `${name}: valid unified patch line`);
    if (line[0] !== '+') before += `${line.slice(1)}\n`;
    if (line[0] !== '-') after += `${line.slice(1)}\n`;
  }
  apply();
  assert.ok(hunks > 0, `${name}: nonempty historical reversal`);
  // At the reviewed baseline, require byte-exact equivalence to the original
  // local blob. Unrelated later edits remain current rather than being reverted.
  if (sha256(current) === fixture.baselineSha256) assert.equal(sha256(result), fixture.targetSha256, `${name}: original blob SHA-256`);
  // A later source context is a separately named behavioral witness, not a
  // claim that an unavailable historical helper blob has been recovered.
  if (fixture.contextWitness && sha256(current) === fixture.contextWitness.rebasedSourceSha256) {
    assert.equal(sha256(result), fixture.contextWitness.targetSha256, `${name}: exact current-context witness SHA-256`);
    if (fixture.contextWitness.originalByteIdentityVerified) {
      assert.equal(sha256(result), fixture.targetSha256, `${name}: verified original target bytes`);
    }
  }
  return result;
}
