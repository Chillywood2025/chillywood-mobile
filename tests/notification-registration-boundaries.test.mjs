import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { notificationHistoricalSource, notificationHistoryProvenance } from './helpers/notification-history-fixtures.mjs';
const source = path => fs.readFileSync(path,'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
const span = (text,start,end) => {const i=text.indexOf(start);assert.ok(i>=0);return text.slice(i,end?text.indexOf(end,i):undefined);};

test('registration and account-action repairs preserve held helper, Edge, session and SQL bytes',()=>{
  const mobile=source('_lib/notifications.ts'), edge=source('supabase/functions/notification-device-tokens/index.ts');
  const checks=[
    [span(mobile,'const invokePendingPushRevocation = '),'99b66e721985625a42f9f6d2c1c93fc800bc2d7a42cda7e088ebc2eac66a48e1'],
    [span(mobile,'    // Exact old-session cleanup cannot revoke','\n  if (!exactResponse'),'c1d14670ecc01992c088b2243563fcc85da1f06848f19e9a2c5f7f58a25f0b94'],
    [span(edge,'    if (action === "revoke")','    if (!platform || !provider)'),'71f0fdbc7c6d2de8329c4f6aabd5cae6e8d3dc3becd37454ebd88269af9d5d59'],
    [source('_lib/session.tsx'),'3cc24c91bb74c2aaa26a4956bf5bb8d7cee97019036073fe9e55895100b8ced1'],
    [source('supabase/migrations/202608140001_wave1_identity_entitlement_authority.sql'),'a6ac07ff03d576ae984b31bddc00531ffe2962eb29dee0dd259a934c20bb8f0f'],
  ];
  for(const [actual,expected] of checks)assert.equal(digest(actual),expected,'held source changed from PR593 93976ea7; reopen scope review rather than silently updating this hash');
});

test('explicitly reviewed account-action Settings context retains original notification provenance',()=>{
  // The user-authorized account deletion/logout repair reopens Settings only.
  // Preserve the previous PR593 whole-file witness rather than describing the
  // new account-bound callers as unchanged registration-only source.
  const previousSettingsSha256='b7db017b76f1502319ed2523c92efefe1bab6812d57925138baac7d46bc3ae33';
  const reviewedSettingsSha256='b19c26bbb792aab62a034c53a87ae3df3f43cbfbdbf1eefbdb3e81e0a0d5795b';
  const settings=source('app/settings.tsx');
  assert.equal(digest(settings),reviewedSettingsSha256,'Settings changed after account-action scope review; review a new context witness');
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
