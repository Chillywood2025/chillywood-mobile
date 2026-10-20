import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { loadStubbed, read } from './customer-experience-adversarial-helpers.mjs';

const id = n => `97200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const stamp = '2026-10-20T02:00:00.123456Z';
const row = (n, extra = {}) => ({ id: id(n), case_number: `fixture-${n}`, status: 'received',
  reporter_email: 'older-match@example.test', created_at: stamp, active_strike_count: 601, ...extra });
const pagination = loadStubbed('_lib/adminCursorPagination.ts');
const load = client => loadStubbed('_lib/dmca.ts', { './supabase': { supabase: client }, './adminCursorPagination': pagination });
const envelope = (items, scope, hasMore = false) => ({ items, hasMore, nextCursor: hasMore
  ? JSON.stringify({ v: 1, scope, id: items.at(-1).id, createdAt: items.at(-1).created_at }) : null });

test('cursor validation preserves sub-millisecond ordering and rejects backwards or unsafe keys', () => {
  const scope={source:'reports',filter:'all'};
  const cursor=JSON.stringify({v:1,scope,createdAt:'2026-10-20T02:00:00.123456Z',id:'1'});
  assert.equal(pagination.parseAdminCursorPage({items:[{id:99,created_at:'2026-10-20T02:00:00.123455Z'}],hasMore:false,nextCursor:null},scope,25,cursor).items.length,1);
  for(const row of [{id:99,created_at:'2026-10-20T02:00:00.123457Z'}, {id:Number.MAX_SAFE_INTEGER+1,created_at:stamp}, {id:1,created_at:'yesterday'}]) {
    assert.throws(()=>pagination.parseAdminCursorPage({items:[row],hasMore:false,nextCursor:null},scope,25,cursor));
  }
});

test('DMCA helper traverses more than two tied pages with source search and no capped enrichment', async () => {
  const rows = Array.from({ length: 251 }, (_, i) => row(i + 1));
  const calls = [];
  const api = load({ from() { throw new Error('No capped relation scans'); }, async rpc(name, args) {
    assert.equal(name, 'list_admin_dmca_cases_page'); calls.push(args);
    const after = args.p_cursor ? JSON.parse(args.p_cursor).id : null;
    const matches = rows.filter(r => (!after || r.id < after) && r.reporter_email.includes(args.p_search)).reverse();
    return { data: envelope(matches.slice(0, args.p_limit), { source: 'dmca', status: args.p_status, search: args.p_search, includeTestCases: false }, matches.length > args.p_limit) };
  } });
  let cursor = null; const items = [];
  do {
    const page = await api.readAdminDmcaCasesPage({ search: ' OLDER-MATCH ', limit: 100, cursor });
    items.push(...page.items); cursor = page.nextCursor;
  } while (cursor);
  assert.equal(calls.length, 3); assert.equal(new Set(items.map(r => r.id)).size, 251);
  assert.equal(items[0].activeStrikeCount, 601); assert.equal(calls[0].p_search, 'older-match');
  assert.equal((await api.readAdminDmcaCases({ limit: 10 })).length, 10);
});

test('DMCA source/enrichment errors and malformed counts cannot become zero or empty success', async () => {
  for (const error of [new Error('offline'), { code: 'PGRST202', message: 'missing migration' }]) {
    const api = load({ async rpc() { return { error }; } });
    await assert.rejects(api.readAdminDmcaCasesPage()); await assert.rejects(api.readAdminDmcaCaseSummary());
  }
  for (const count of [null, undefined, -1, '601', NaN]) {
    const api = load({ async rpc() { return { data: envelope([row(1, { active_strike_count: count })], {}) }; } });
    await assert.rejects(api.readAdminDmcaCasesPage(), /counts/);
  }
});

test('DMCA cursor rejects malformed, filter-mismatched and repeated pages', async () => {
  let reads = 0;
  const scope = { source: 'dmca', status: 'all', search: '', includeTestCases: false };
  const response = envelope([row(2)], scope, true);
  const api = load({ async rpc() { reads++; return { data: response }; } });
  for (const cursor of ['', 'bad', JSON.stringify({ v: 1, scope: { ...scope, status: 'closed' }, createdAt: stamp, id: id(2) })]) {
    await assert.rejects(api.readAdminDmcaCasesPage({ cursor }), /cursor/);
  }
  assert.equal(reads, 0);
  await assert.rejects(api.readAdminDmcaCasesPage({ cursor: response.nextCursor }), /did not advance/);
});

test('DMCA summary uses exact global aggregates and validates every count', async () => {
  const api = load({ async rpc(name) {
    assert.equal(name, 'get_admin_dmca_case_summary');
    return { data: { total: 251, open: 250, priority: 251, repeatInfringerReview: 0,
      byStatus: Object.fromEntries(api.DMCA_CASE_STATUSES.map(s => [s, s === 'received' ? 250 : s === 'closed' ? 1 : 0])) } };
  } });
  assert.equal((await api.readAdminDmcaCaseSummary()).total, 251);
  const invalid = load({ async rpc() { return { data: { total: 0, byStatus: {} } }; } });
  await assert.rejects(invalid.readAdminDmcaCaseSummary(), /counts/);
});

function historyClient({ fail = '', repeat = false, countMissing = false } = {}) {
  const history = Array.from({ length: 451 }, (_, i) => ({ id: id(i + 1), created_at: stamp })).reverse();
  const reads = [];
  return { reads, from(table) {
    let cursor; let head = false;
    const query = {
      select(_projection, options) { head = options?.head; return this; }, eq() { return this; },
      order() { return this; }, limit() { return this; },
      or(value) { cursor = value.match(/id.lt.([^)]*)/)[1]; return this; },
      async single() { return { data: row(999, { uploader_user_id: 'uploader', allegedly_infringing_content_id: 'content' }) }; },
      then(resolve, reject) {
        reads.push({ table, cursor });
        if (table === fail) return Promise.resolve({ error: new Error('history source failed') }).then(resolve, reject);
        if (head) return Promise.resolve({ count: countMissing ? null : 601 }).then(resolve, reject);
        const remaining = history.filter(r => repeat || !cursor || r.id < cursor);
        return Promise.resolve({ data: remaining.slice(0, 75), count: countMissing ? null : remaining.length }).then(resolve, reject);
      },
    }; return query;
  }, async rpc() { return fail === 'content' ? { error: new Error('content source failed') } : { data: { found: true } }; } };
}

test('DMCA detail drains all histories despite a server row cap lower than requested and counts uploader-wide strikes', async () => {
  const client = historyClient(); const detail = await load(client).readAdminDmcaCaseDetail(id(999));
  assert.equal(detail.historiesComplete, true); assert.equal(detail.case.activeStrikeCount, 601);
  for (const key of ['attachments', 'counterNotices', 'contentActions', 'strikes', 'auditLog']) {
    assert.equal(detail[key].length, 451); assert.equal(new Set(detail[key].map(r => r.id)).size, 451);
  }
  assert.equal(client.reads.filter(r => r.table === 'dmca_audit_log').length, 7);
});

test('DMCA detail rejects repeated pages, missing exact counts and every failed history/content source', async () => {
  for (const options of [{ repeat: true }, { countMissing: true }, ...['dmca_attachments', 'dmca_counter_notices', 'dmca_content_actions', 'dmca_strikes', 'dmca_audit_log', 'content'].map(fail => ({ fail }))]) {
    await assert.rejects(load(historyClient(options)).readAdminDmcaCaseDetail(id(999)));
  }
});

const screen = read('app/admin.tsx');
const loader = screen.slice(screen.indexOf('  const loadDmcaCases = useCallback('), screen.indexOf('  const loadDmcaCaseDetail = useCallback('));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; };
function screenHarness() {
  const state = {}; const requests = [];
  let session = { userId: 'owner', sessionGeneration: 'one', restoreOnly: false };
  const context = { useCallback: fn => fn, canAccessDmca: true, user: { id: 'owner' }, dmcaListAuthorityKey: 'owner:all',
    dmcaListAuthorityRef: { current: 'owner:all' }, dmcaListRequestRef: { current: 0 },
    dmcaPageRef: { current: { scope: null, cursor: null, loading: false, ids: new Set() } },
    dmcaSearchQuery: '', dmcaStatusFilter: 'all', getCurrentAccountSessionAuthoritySnapshot: () => session,
    sameAccountSessionAuthority: (a, b) => a?.userId === b?.userId && a?.sessionGeneration === b?.sessionGeneration,
    formatDmcaOperationFailure: error => error.message,
    readAdminDmcaCaseSummary: async () => ({ total: 251 }),
    readAdminDmcaCasesPage: options => { const d = deferred(); requests.push({ ...d, options }); return d.promise; },
  };
  for (const key of ['DmcaCases', 'DmcaPage', 'DmcaCaseSummary', 'DmcaCasesLoading', 'DmcaNotice']) {
    context[`set${key}`] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  }
  const compile = () => new Function(...Object.keys(context), ts.transpileModule(`${loader}\nreturn loadDmcaCases;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(...Object.values(context));
  return { state, requests, context, compile, session: value => { session = value; } };
}
const page = (n, nextCursor = `cursor-${n}`) => ({ items: [{ id: id(n) }], hasMore: !!nextCursor, nextCursor });

test('DMCA UI appends only the current cursor, blocks duplicate loads, and preserves rows on page failure', async () => {
  const h = screenHarness(); const read = h.compile();
  const first = read(); h.requests[0].resolve(page(1)); await first;
  const more = read(true); await read(true); assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].options.cursor, 'cursor-1');
  h.requests[1].reject(new Error('offline')); await more;
  assert.equal(h.state.DmcaCases.length, 1); assert.equal(h.state.DmcaPage.nextCursor, 'cursor-1');
  const retry = read(true); h.requests[2].resolve(page(2, null)); await retry;
  assert.deepEqual(h.state.DmcaCases, [{ id: id(1) }, { id: id(2) }]);
  await read(true); assert.equal(h.requests.length, 3);
});

test('DMCA UI ignores stale filter/account/session/permission/unmount completions and resets on refresh', async () => {
  for (const change of ['filter', 'account', 'session', 'permission', 'unmount']) {
    const h = screenHarness(); const read = h.compile(); const pending = read();
    if (change === 'filter') { h.context.dmcaListAuthorityRef.current = 'owner:closed'; }
    if (change === 'account') h.session({ userId: 'other', sessionGeneration: 'one' });
    if (change === 'session') h.session({ userId: 'owner', sessionGeneration: 'two' });
    if (change === 'permission') h.context.dmcaListAuthorityRef.current = null;
    if (change === 'unmount') h.context.dmcaListRequestRef.current++;
    h.requests[0].resolve(page(1)); await pending; assert.deepEqual(h.state.DmcaCases, []);
  }
  const h = screenHarness(); const read = h.compile();
  const old = read(); const latest = read();
  h.requests[1].resolve(page(2)); await latest; h.requests[0].reject(new Error('old')); await old;
  assert.deepEqual(h.state.DmcaCases, [{ id: id(2) }]); assert.equal(h.state.DmcaNotice, null);
});

test('DMCA UI keeps global count failures unknown and exposes retry/history completion', async () => {
  const h = screenHarness(); h.context.readAdminDmcaCaseSummary = async () => { throw new Error('summary offline'); };
  const pending = h.compile()(); h.requests[0].resolve(page(1)); await pending;
  assert.equal(h.state.DmcaCaseSummary, null); assert.match(h.state.DmcaNotice, /totals are unavailable/);
  assert.match(screen, /label="All Cases" value=\{dmcaCaseSummary\?\.total \?\? "Unknown"\}/);
  assert.match(screen, /DMCA cases unavailable/); assert.match(screen, /Complete case history loaded for this read/);
});
