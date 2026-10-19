// Full production route, official-account lookup and event reader/parser.
// Native hosts, other IO and the live component boundary are modeled; this is
// not phone or service proof. STUDIO_SOURCE_ROOT supports unchanged-source controls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { deferred, mount, productionFunctions, ROOT, ts, video } from './platform-public-mounted-harness.mjs';

function clientModule(file, imports = {}) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const code = ts.transpileModule(source, {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = { exports: {}, require: name => {
    assert.ok(name in imports, `Expected client import ${name}`);
    return imports[name];
  } };
  vm.runInNewContext(code, context);
  return context.exports;
}
const official = clientModule('_lib/officialAccounts.ts');
const rachi = official.RACHI_OFFICIAL_USER_ID;
const creator = '10000000-0000-4000-8000-000000000001';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const discovery = productionFunctions('_lib/discoveryFeed.ts', ['normalizeDiscoveryCreatorIds'], {
  normalizeText: value => String(value ?? '').trim(),
});
const original = () => ({ ...video('official-original'), ownerId: rachi, title: 'Public Original fixture' });
const eventRow = () => ({
  id: 'event-fixture', host_user_id: creator, event_title: 'Public upcoming fixture',
  event_type: 'live_first', visibility: 'public', status: 'scheduled',
  starts_at: '2099-01-01T12:00:00Z', reminder_ready: true,
});

function eventBoundary(rows = []) {
  const queries = [];
  const state = { unavailable: false, rows };
  const supabase = { from(table) {
    const filters = [];
    const query = {
      select() { return query; },
      eq(...args) { filters.push(['eq', ...args]); return query; },
      neq(...args) { filters.push(['neq', ...args]); return query; },
      order() { return query; },
      async returns() {
        queries.push({ table, filters });
        const host = filters.find(([op, field]) => op === 'eq' && field === 'host_user_id')?.[2];
        // Models the independently observed public request's UUID contract.
        if (!uuid.test(host)) return { data: null, error: { code: '22P02' } };
        if (state.unavailable) return { data: null, error: { code: 'NETWORK_UNAVAILABLE' } };
        return { data: state.rows, error: null };
      },
    };
    return query;
  } };
  const api = clientModule('_lib/liveEvents.ts', {
    './supabase': { supabase },
    './actionSingleFlight.mjs': { runKeyedSingleFlight: () => assert.fail('Read-only test cannot mutate events') },
  });
  return { ...api, queries, state };
}

async function platform(t, { userId = rachi, events = eventBoundary(), overrides = {}, session } = {}) {
  const liveReads = [];
  const h = await mount(t, {
    route: { userId }, videos: [original()], session,
    overrides: {
      getOfficialPlatformAccount: official.getOfficialPlatformAccount,
      buildUserChannelProfile: ({ id, profile }) => {
        const account = official.getOfficialPlatformAccount(id);
        return { id, displayName: account?.displayName ?? profile.displayName,
          handle: account?.handle ?? '@creator', tagline: account?.tagline ?? profile.tagline,
          role: 'creator', identityKind: account ? 'official_platform' : 'member' };
      },
      readPublicEventSummaries: events.readPublicEventSummaries,
      readUserProfileByUserId: () => assert.fail('Public Platform cannot fall back to private Profile data'),
      PlatformLiveNow: props => { liveReads.push(props); return null; },
      ...overrides,
    },
  });
  return { ...h, events, liveReads };
}

test('Rachi Platform retains backed public content without a UUID creator-event request', async t => {
  const h = await platform(t);
  assert.ok(h.find(n => n.props.testID === 'screen-platform'), 'Rachi Platform reaches ready state');
  assert.match(h.text(), /Rachi/);
  assert.match(h.text(), /Public Original fixture/);
  assert.doesNotMatch(h.text(), /Platform could not load|No visible uploads yet|No upcoming events/);
  assert.equal(h.events.queries.length, 0, 'known official identity never reaches the UUID event API');
  assert.equal(h.calls.filter(([name]) => name === 'readPublicPlatformIdentity').length, 0);
  assert.equal(h.calls.filter(([name]) => name === 'readUserProfileByUserId').length, 0);
  const read = h.calls.find(([name]) => name === 'readCreatorVideos');
  assert.equal(read[1], rachi);
  assert.equal(read[2].includeDrafts, false);
  assert.equal(read[2].throwOnUnavailable, true);
  assert.equal(h.calls.find(([name]) => name === 'readPublicPlatformBranding')[2].throwOnUnavailable, true);
  assert.doesNotMatch(h.text(), /Manage Platform|Platform Studio/);
});

test('Rachi does not mount unsupported UUID live discovery even when event IO succeeds', async t => {
  const h = await platform(t, { overrides: { readPublicEventSummaries: async () => [] } });
  assert.ok(h.find(n => n.props.testID === 'screen-platform'));
  assert.throws(() => discovery.normalizeDiscoveryCreatorIds({ creatorUserId: rachi }), /Invalid discovery creator/);
  assert.equal(h.liveReads.length, 0, 'unsupported live shelf is absent, not an endlessly retrying request');
  assert.doesNotMatch(h.text(), /No upcoming events/);
});

test('normal creator retains exact public event filters, event navigation and live identity', async t => {
  const h = await platform(t, { userId: creator, events: eventBoundary([eventRow()]) });
  assert.match(h.text(), /Public upcoming fixture/);
  assert.deepEqual(h.events.queries, [{ table: 'creator_events', filters: [
    ['eq', 'host_user_id', creator], ['eq', 'visibility', 'public'], ['neq', 'status', 'draft'],
  ] }]);
  assert.ok(h.liveReads.some(props => props.creatorUserId === creator && props.enabled));
  assert.equal(discovery.normalizeDiscoveryCreatorIds({ creatorUserId: creator })[0], creator);
  await h.press(h.find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel?.includes('Public upcoming fixture')));
  assert.equal(h.routes.at(-1), '/event/event-fixture');
});

test('normal creator event failure stays an error and Retry reissues the public read', async t => {
  const events = eventBoundary([eventRow()]); events.state.unavailable = true;
  const h = await platform(t, { userId: creator, events });
  assert.match(h.text(), /Platform could not load/);
  assert.doesNotMatch(h.text(), /No upcoming events|Public Original fixture/);
  events.state.unavailable = false;
  await h.press(h.button('Retry'));
  assert.match(h.text(), /Public upcoming fixture/);
  assert.equal(events.queries.length, 2);
});

test('unrecognized non-UUID creator is not treated as a supported empty official Platform', async t => {
  const h = await platform(t, { userId: 'platform_unknown_official' });
  assert.equal(official.getOfficialPlatformAccount('platform_unknown_official'), null);
  assert.match(h.text(), /Platform could not load/);
  assert.equal(h.events.queries.length, 1);
  await h.press(h.button('Retry'));
  assert.match(h.text(), /Platform could not load/);
  assert.equal(h.events.queries.length, 2);
  assert.doesNotMatch(h.text(), /No visible uploads yet|Public Original fixture/);
});

for (const dependency of ['readCreatorVideos', 'readPublicPlatformBranding']) {
  test(`Rachi ${dependency} failure remains visible and Retry requires a fresh successful read`, async t => {
    const h = await platform(t);
    h.mocks[dependency] = async () => { throw new Error('modeled unavailable'); };
    await h.focus(false); await h.focus(true);
    assert.match(h.text(), /Platform could not load/);
    assert.doesNotMatch(h.text(), /Public Original fixture|No visible uploads yet/);
    h.mocks[dependency] = async () => dependency === 'readCreatorVideos' ? [original()] : null;
    await h.press(h.button('Retry'));
    assert.match(h.text(), /Public Original fixture/);
    assert.doesNotMatch(h.text(), /Platform could not load/);
    assert.equal(h.events.queries.length, 0);
  });
}

test('late Rachi content cannot overwrite a subsequently denied creator Platform', async t => {
  const late = deferred();
  const h = await platform(t, { overrides: { readCreatorVideos: () => late.promise } });
  assert.ok(h.find(n => n.props.testID === 'platform-loading-state'));
  h.mocks.resolvePlatformVisibilityAccess = async () => ({ allowed: false, isBlocked: true, reason: 'blocked' });
  await h.route({ userId: creator });
  assert.match(h.text(), /cannot view/);
  await h.resolve(late, [original()]);
  assert.match(h.text(), /cannot view/);
  assert.doesNotMatch(h.text(), /Public Original fixture/);
  assert.equal(h.liveReads.length, 0);
});

test('switching from a creator to Rachi removes creator live capability and ignores late events', async t => {
  const late = deferred();
  const h = await platform(t, { userId: creator, overrides: { readPublicEventSummaries: () => late.promise } });
  assert.ok(h.find(n => n.props.testID === 'platform-loading-state'));
  await h.route({ userId: rachi });
  assert.match(h.text(), /Public Original fixture/);
  assert.equal(h.calls.filter(([name]) => name === 'readPublicEventSummaries').length, 1);
  await h.resolve(late, [{ id: 'late-event', eventTitle: 'Stale creator event', isUpcoming: true }]);
  assert.doesNotMatch(h.text(), /Stale creator event|No upcoming events/);
  assert.equal(h.liveReads.length, 0);
});

test('guest Rachi Platform still uses only strict public content readers', async t => {
  const h = await platform(t, { session: {
    user: null, isSignedIn: false, isLoading: false, authority: null, authorityStatus: 'signed_out',
  } });
  assert.match(h.text(), /Public Original fixture/);
  assert.equal(h.events.queries.length, 0);
  assert.equal(h.liveReads.length, 0);
  assert.equal(h.calls.find(([name]) => name === 'readCreatorVideos')[2].includeDrafts, false);
});
