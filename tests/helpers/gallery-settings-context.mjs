import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const gallerySettingsContext=JSON.parse(readFileSync(new URL('../fixtures/notification-history/gallery-settings-context.json',import.meta.url),'utf8'));

// Reconstruct only the approved appearance-picker delta before applying legacy
// notification counterexamples. This is the prior account-action context, not a
// claim that historical source contains the later gallery implementation.
export function priorAccountActionSettings(settings) {
  const context=gallerySettingsContext;
  assert.equal(context.review,'authorized-gallery-picker-repair-2026-10-31');
  assert.equal(context.path,'app/settings.tsx');
  assert.equal(context.changes.length,4);
  assert.equal(context.accountActionContextSha256,'b19c26bbb792aab62a034c53a87ae3df3f43cbfbdbf1eefbdb3e81e0a0d5795b');
  let projected=settings;
  for(const {galleryContext:current,accountActionContext:previous} of context.changes) {
    assert.equal(projected.split(current).length-1,1,'exactly one reviewed gallery hunk is required');
    assert.equal(projected.includes(previous),false,'prior and current gallery hunks cannot coexist');
    projected=projected.replace(current,previous);
  }
  assert.equal(createHash('sha256').update(projected).digest('hex'),context.accountActionContextSha256,'non-gallery Settings changed after account-action scope review');
  return projected;
}
