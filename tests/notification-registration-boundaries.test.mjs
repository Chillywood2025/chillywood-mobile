import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { notificationHistoricalSource, notificationHistoryProvenance } from './helpers/notification-history-fixtures.mjs';
import { gallerySettingsContext as galleryContext, removalSettingsContext, priorGallerySettings, priorAccountActionSettings } from './helpers/gallery-settings-context.mjs';
const source = path => fs.readFileSync(path,'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
const span = (text,start,end) => {const i=text.indexOf(start);assert.ok(i>=0);return text.slice(i,end?text.indexOf(end,i):undefined);};

const originalForegroundTitle='      title: category === "creator_money_sale" ? "New creator activity" : normalizeText(content.title) || "Activity",';
const reviewedForegroundTitle='      title: normalizeText(content.title) || (category === "creator_money_sale" ? "New creator activity" : "Activity"),';
const originalRestorationBoundary='            lastSession = currentSession;\n            setAuthority(nextAuthority); setSession(currentSession); setUser(null);';
const reviewedRestorationBoundary='            lastSession = currentSession;\n            // Restoration uses this same exact-session snapshot; ordinary\n            // mutations still reject its restoreOnly authority.\n            publishAccountSessionAuthoritySnapshot(nextAuthority);\n            setAuthority(nextAuthority); setSession(currentSession); setUser(null);';
function assertHeldBoundaries({mobile=source('_lib/notifications.ts'),edge=source('supabase/functions/notification-device-tokens/index.ts'),session=source('_lib/session.tsx')}={}) {
  // The original witness spans the revoke helper through EOF, including the
  // unrelated foreground renderer. The 2026-10-31 notification-context review
  // authorized exactly this display-only line, not any held revoke behavior.
  // Preserve the immutable PR593 hash; project only this one reviewed delta.
  const suffix=span(mobile,'const invokePendingPushRevocation = ');
  assert.equal(suffix.split(reviewedForegroundTitle).length-1,1,'exactly one reviewed foreground title line is required');
  assert.equal(suffix.includes(originalForegroundTitle),false,'old and reviewed title implementations cannot coexist');
  // The 2026-11-01 restoration repair authorizes this publication only, not
  // changes to notification ownership cleanup. Keep the original session hash.
  assert.equal(session.split(reviewedRestorationBoundary).length-1,1,'exactly one reviewed restoration publication is required');
  assert.equal(session.includes(originalRestorationBoundary),false,'old and reviewed restoration boundaries cannot coexist');
  assert.equal(digest(session),'8977a2c821003b27d4841f0289067c604be038cc3a20ec9343010b1fdb543a34','held source changed after restoration-only review');
  const checks=[
    [suffix.replace(reviewedForegroundTitle,originalForegroundTitle),'99b66e721985625a42f9f6d2c1c93fc800bc2d7a42cda7e088ebc2eac66a48e1'],
    [span(mobile,'    // Exact old-session cleanup cannot revoke','\n  if (!exactResponse'),'c1d14670ecc01992c088b2243563fcc85da1f06848f19e9a2c5f7f58a25f0b94'],
    [span(edge,'    if (action === "revoke")','    if (!platform || !provider)'),'71f0fdbc7c6d2de8329c4f6aabd5cae6e8d3dc3becd37454ebd88269af9d5d59'],
    [session.replace(reviewedRestorationBoundary,originalRestorationBoundary),'3cc24c91bb74c2aaa26a4956bf5bb8d7cee97019036073fe9e55895100b8ced1'],
    [source('supabase/migrations/202608140001_wave1_identity_entitlement_authority.sql'),'a6ac07ff03d576ae984b31bddc00531ffe2962eb29dee0dd259a934c20bb8f0f'],
  ];
  for(const [actual,expected] of checks)assert.equal(digest(actual),expected,'held source changed from PR593 93976ea7; reopen scope review rather than silently updating this hash');
}
test('registration and account-action repairs preserve held bytes except reviewed foreground and restoration deltas',()=>{
  assertHeldBoundaries();
});
test('restoration projection rejects absent, duplicate and altered publication',()=>{
  const session=source('_lib/session.tsx');
  for(const replacement of ['',reviewedRestorationBoundary+reviewedRestorationBoundary,originalRestorationBoundary,
    reviewedRestorationBoundary.replace('Snapshot(nextAuthority)','Snapshot(null)')]) {
    assert.throws(()=>assertHeldBoundaries({session:session.replace(reviewedRestorationBoundary,replacement)}),/reviewed restoration publication/);
  }
});
test('held witness rejects missing, duplicate and unreviewed foreground copy',()=>{
  const mobile=source('_lib/notifications.ts');
  for(const replacement of ['',reviewedForegroundTitle+'\n'+reviewedForegroundTitle,reviewedForegroundTitle.replace('New creator activity','Different activity')]) {
    assert.throws(()=>assertHeldBoundaries({mobile:mobile.replace(reviewedForegroundTitle,replacement)}),/exactly one reviewed/);
  }
});
test('reviewed display projection cannot excuse a held revocation or session mutation',()=>{
  const mobile=source('_lib/notifications.ts');
  const marker='const invokePendingPushRevocation = ';
  const offset=mobile.indexOf(marker);
  const suffix=mobile.slice(offset);
  assert.ok(suffix.includes('await '));
  assert.throws(()=>assertHeldBoundaries({mobile:mobile.slice(0,offset)+suffix.replace('await ','void ')}),/held source changed/);
  const session=source('_lib/session.tsx');
  assert.ok(session.includes('await '));
  assert.throws(()=>assertHeldBoundaries({session:session.replace('await ','void ')}),/held source changed/);
});

test('explicitly reviewed account-action Settings context retains original notification provenance',()=>{
  // The user-authorized account deletion/logout repair reopens Settings only.
  // Preserve the previous PR593 whole-file witness rather than describing the
  // new account-bound callers as unchanged registration-only source.
  const previousSettingsSha256='b7db017b76f1502319ed2523c92efefe1bab6812d57925138baac7d46bc3ae33';
  const reviewedSettingsSha256='b19c26bbb792aab62a034c53a87ae3df3f43cbfbdbf1eefbdb3e81e0a0d5795b';
  const settings=source('app/settings.tsx');
  assert.equal(galleryContext.accountActionContextSha256,reviewedSettingsSha256);
  assert.equal(digest(settings),removalSettingsContext.removalContextSha256,'Settings changed after removal scope review');
  assert.equal(digest(priorGallerySettings(settings)),galleryContext.galleryContextSha256,'exact prior gallery scope is preserved');
  assert.equal(digest(priorAccountActionSettings(settings)),reviewedSettingsSha256,'non-gallery Settings changed after account-action scope review');
  for(const [name,originalTarget] of [
    ['original-settings','7dd4b554a8455b0f934883b264ad2530e06f1a1da356d744ea66254d85e5997d'],
    ['first-settings','9fe0dc633b7503db5a731ed94c70b574c04450e92def6b5e94d2ea01953e69a9'],
    ['settlement-settings','e0e4a46c21fa80df3f0be98bfd545cb8f19736fa6c83ecaebd26e89f6ae6f642'],
  ]){
    const fixture=notificationHistoryProvenance.find(entry=>entry.name===name);
    assert.equal(fixture.targetSha256,originalTarget,'original historical blob identity remains immutable');
    assert.equal(fixture.priorContextWitness.rebasedSourceSha256,previousSettingsSha256);
    assert.equal(fixture.priorContextWitness.targetSha256,originalTarget);
    assert.equal(fixture.priorContextWitness.originalByteIdentityVerified,true);
    assert.equal(fixture.contextWitness.review,'authorized-account-action-repair-2026-10-25');
    assert.equal(fixture.contextWitness.rebasedSourceSha256,reviewedSettingsSha256);
    assert.equal(fixture.contextWitness.originalByteIdentityVerified,false,'current-context counterexample is not original historical bytes');
    const historical=notificationHistoricalSource(name);
    assert.equal(digest(historical),fixture.contextWitness.targetSha256);
    assert.notEqual(digest(historical),originalTarget);
    for(const [start,end] of [
      ['  const { isLoading, isSignedIn, user, session, authority, authorityStatus } = useSession();','  const monetizationOwnerKey'],
      ['  const accountActionIdentity =','  const [signingOut'],
      ['  const finishAccountSignOut =','  const onPressOpenProfile ='],
      ['  const onPressSubmitAccountDeletionRequest =','  // eslint-disable-next-line'],
    ])assert.equal(span(historical,start,end),span(settings,start,end),`${name}: preserve reviewed account-action code`);
  }
});

test('gallery witness rejects absent, duplicate and unreviewed appearance changes',()=>{
  const settings=priorGallerySettings(source('app/settings.tsx'));
  const first=galleryContext.changes[0];
  for(const replacement of ['',first.galleryContext+first.galleryContext,first.accountActionContext]) {
    const mutated=settings.replace(first.galleryContext,replacement);
    assert.notEqual(mutated,settings);
    assert.throws(()=>priorAccountActionSettings(mutated),assert.AssertionError);
  }
  assert.throws(()=>priorAccountActionSettings(settings.replace('const profileGalleryPending = useRef(false);','const profileGalleryPending = useRef(true);')),assert.AssertionError);
});

test('removal witness rejects missing, duplicate and altered removal hunks',()=>{
  const settings=source('app/settings.tsx');
  for(const {removalContext:current,galleryContext:previous} of removalSettingsContext.changes) {
    for(const replacement of ['',current+current,previous]) {
      const mutated=settings.replace(current,replacement);
      assert.notEqual(mutated,settings);
      assert.throws(()=>priorAccountActionSettings(mutated),assert.AssertionError);
    }
  }
});

test('gallery projection cannot excuse notification, sign-out or deletion changes',()=>{
  const settings=source('app/settings.tsx');
  const assertPrior=value=>assert.equal(digest(priorAccountActionSettings(value)),galleryContext.accountActionContextSha256);
  assertPrior(settings);
  for(const [start,end] of [
    ['  const notificationOwnerKey =','  const notificationScopeRef ='],
    ['  const finishAccountSignOut =','  const onPressOpenProfile ='],
    ['  const onPressSubmitAccountDeletionRequest =','  // eslint-disable-next-line'],
  ]) {
    const protectedCode=span(settings,start,end);
    assert.ok(protectedCode.length>start.length);
    const needle=start.includes('notificationOwnerKey')?'&&':start.includes('SubmitAccountDeletion')?'!currentAccountAction(authority)':'await ';
    const mutated=protectedCode.replace(needle,needle==='&&'?'||':needle==='await '?'void ':'false');
    assert.notEqual(mutated,protectedCode,'negative control must alter protected behavior');
    assert.throws(()=>assertPrior(settings.replace(protectedCode,mutated)),assert.AssertionError);
  }
  assert.throws(()=>assertPrior(settings+'\n// unknown unrelated change\n'),assert.AssertionError);
});
