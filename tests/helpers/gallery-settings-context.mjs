import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const gallerySettingsContext=JSON.parse(readFileSync(new URL('../fixtures/notification-history/gallery-settings-context.json',import.meta.url),'utf8'));
export const removalSettingsContext=JSON.parse(readFileSync(new URL('../fixtures/notification-history/removal-settings-context.json',import.meta.url),'utf8'));
const digest=value=>createHash('sha256').update(value).digest('hex');

// Reverse only the separately reviewed removal-owner/focus delta. The older
// gallery fixture and every account-action/notification witness remain intact.
export function priorGallerySettings(settings) {
  const context=removalSettingsContext;
  assert.equal(context.review,'authorized-profile-removal-authority-repair-2026-11-01');
  assert.equal(context.path,'app/settings.tsx');
  assert.equal(context.baselineCommit,'bf682f64ed7a0301e4534f2bd6ace0d68d62b4c8');
  assert.equal(context.changes.length,5);
  assert.equal(context.galleryContextSha256,gallerySettingsContext.galleryContextSha256);
  assert.equal(context.removalContextSha256,'77d05f04a99f3809f1d87551fa45fd0e870ba1c5e52af6375c9f26010648880d');
  // Accept the exact prior fixture when testing the gallery bridge separately.
  if(digest(settings)===context.galleryContextSha256)return settings;
  assert.equal(digest(settings),context.removalContextSha256,'Settings changed after removal-only scope review');
  let projected=settings;
  for(const {removalContext:current,galleryContext:previous} of context.changes) {
    assert.equal(projected.split(current).length-1,1,'exactly one reviewed removal hunk is required');
    projected=projected.replace(current,previous);
  }
  assert.equal(digest(projected),context.galleryContextSha256,'removal reversal must recover the exact prior gallery source');
  return projected;
}

// Reconstruct only the approved appearance-picker delta before applying legacy
// notification counterexamples. This is the prior account-action context, not a
// claim that historical source contains the later gallery implementation.
export function priorAccountActionSettings(settings) {
  const context=gallerySettingsContext;
  assert.equal(context.review,'authorized-gallery-picker-repair-2026-10-31');
  assert.equal(context.path,'app/settings.tsx');
  assert.equal(context.changes.length,4);
  assert.equal(context.accountActionContextSha256,'b19c26bbb792aab62a034c53a87ae3df3f43cbfbdbf1eefbdb3e81e0a0d5795b');
  let projected=priorGallerySettings(settings);
  for(const {galleryContext:current,accountActionContext:previous} of context.changes) {
    assert.equal(projected.split(current).length-1,1,'exactly one reviewed gallery hunk is required');
    assert.equal(projected.includes(previous),false,'prior and current gallery hunks cannot coexist');
    projected=projected.replace(current,previous);
  }
  assert.equal(createHash('sha256').update(projected).digest('hex'),context.accountActionContextSha256,'non-gallery Settings changed after account-action scope review');
  return projected;
}
