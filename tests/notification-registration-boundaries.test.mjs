import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
const source = path => fs.readFileSync(path,'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
const span = (text,start,end) => {const i=text.indexOf(start);assert.ok(i>=0);return text.slice(i,end?text.indexOf(end,i):undefined);};

test('registration-only repair preserves the reviewed held revoke and cleanup source bytes',()=>{
  const mobile=source('_lib/notifications.ts'), edge=source('supabase/functions/notification-device-tokens/index.ts');
  const checks=[
    [span(mobile,'const invokePendingPushRevocation = '),'99b66e721985625a42f9f6d2c1c93fc800bc2d7a42cda7e088ebc2eac66a48e1'],
    [span(mobile,'    // Exact old-session cleanup cannot revoke','\n  if (!exactResponse'),'c1d14670ecc01992c088b2243563fcc85da1f06848f19e9a2c5f7f58a25f0b94'],
    [span(edge,'    if (action === "revoke")','    if (!platform || !provider)'),'71f0fdbc7c6d2de8329c4f6aabd5cae6e8d3dc3becd37454ebd88269af9d5d59'],
    [source('_lib/session.tsx'),'3cc24c91bb74c2aaa26a4956bf5bb8d7cee97019036073fe9e55895100b8ced1'],
    [source('app/settings.tsx'),'b7db017b76f1502319ed2523c92efefe1bab6812d57925138baac7d46bc3ae33'],
    [source('supabase/migrations/202608140001_wave1_identity_entitlement_authority.sql'),'a6ac07ff03d576ae984b31bddc00531ffe2962eb29dee0dd259a934c20bb8f0f'],
  ];
  for(const [actual,expected] of checks)assert.equal(digest(actual),expected,'held source changed from PR593 93976ea7; reopen scope review rather than silently updating this hash');
});
