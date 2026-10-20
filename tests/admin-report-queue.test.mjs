import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { loadStubbed, read } from './customer-experience-adversarial-helpers.mjs';

const row = (id, status = 'needs_review', extra = {}) => ({
  id, status, severity: 'medium', target_type: 'profile_post', target_id: `post-${id}`,
  created_at: '2026-10-19T12:00:00Z', context: {}, ...extra,
});
// Match the deployed RPC predicates, including status groups, before its limit.
const matches = (r, filter) => ({
  all: true,
  needs_review: ['needs_review', 'reviewing'].includes(r.status),
  critical: ['critical', 'high'].includes(r.severity) && !['actioned', 'dismissed'].includes(r.status),
  creator_video: ['creator_video', 'creator_video_comment'].includes(r.target_type),
  profile_post: ['profile_post', 'profile_post_comment'].includes(r.target_type),
  player: r.context.sourceSurface === 'player',
  actioned: ['actioned', 'dismissed', 'escalated'].includes(r.status),
})[filter];

function apiHarness(rows, options = {}) {
  const calls = [];
  let tableReads = 0;
  const api = loadStubbed('_lib/moderation.ts', {
    './adminCursorPagination': loadStubbed('_lib/adminCursorPagination.ts'),
    './supabase': { supabase: {
      from() { tableReads++; throw new Error('Unexpected unfiltered table fallback'); },
      async rpc(name, args) {
        calls.push({ name, args });
        if (name === 'get_admin_reports_overview') return options.overviewError
          ? { error: options.overviewError }
          : { data: { connected: true, totalReports: rows.length, queueHealth: 'connected', sourceSurfaces: [], ...options.overview } };
        if (options.error) return { error: options.error };
        const cursor = args.p_cursor ? JSON.parse(args.p_cursor) : null;
        const filtered = rows.filter(r => matches(r, args.p_filter) && (!cursor || r.id < Number(cursor.id))).sort((a, b) => b.id - a.id);
        const items = filtered.slice(0, args.p_limit);
        const hasMore = filtered.length > items.length;
        return { data: { items, hasMore, nextCursor: hasMore ? JSON.stringify({ v: 1, scope: { source: 'reports', filter: args.p_filter }, createdAt: items.at(-1).created_at, id: String(items.at(-1).id) }) : null } };
      },
    } },
  });
  return { api, calls, tableReads: () => tableReads };
}

test('actual queue helper filters at source before 25 resolved rows can hide pending reports', async () => {
  const rows = [...Array.from({ length: 30 }, (_, i) => row(i + 1, 'actioned')),
    row(31), row(32, 'reviewing')];
  const h = apiHarness(rows);
  const result = await h.api.readSafetyReportQueue({ filter: 'needs_review', limit: 25 });
  assert.deepEqual(result.items.map(r => r.id), [32, 31]);
  assert.equal(result.summary.totalReports, 32);
  assert.equal(result.items.length, 2);
  assert.equal(result.windowFull, false);
  assert.equal(h.calls[0].args.p_filter, 'needs_review');
});

test('all UI filter keys preserve the SQL filter groups', async () => {
  const rows = [row(1), row(2, 'reviewing'), row(3, 'actioned'), row(4, 'dismissed'),
    row(5, 'escalated', { severity: 'critical' }), row(6, 'needs_review', { severity: 'high' }),
    row(7, 'needs_review', { target_type: 'creator_video_comment' }),
    row(8, 'needs_review', { context: { sourceSurface: 'player' } })];
  const h = apiHarness(rows);
  for (const filter of ['all', 'needs_review', 'critical', 'creator_video', 'profile_post', 'player', 'actioned']) {
    const result = await h.api.readSafetyReportQueue({ filter, limit: 50 });
    assert.deepEqual(result.items.map(r => r.id), rows.filter(r => matches(r, filter)).map(r => r.id).sort((a, b) => b - a));
    assert.equal(h.calls.at(-2).args.p_filter, filter);
  }
});

test('more than two equal-timestamp pages traverse every matching report exactly once', async () => {
  const rows = Array.from({ length: 131 }, (_, i) => row(i + 1));
  const h = apiHarness(rows);
  let cursor = null; const ids = [];
  do {
    const page = await h.api.readSafetyReportQueue({ filter: 'all', limit: 50, cursor });
    ids.push(...page.items.map(r => r.id)); cursor = page.nextCursor;
    assert.equal(page.hasMore, !!cursor);
  } while (cursor);
  assert.equal(ids.length, 131); assert.equal(new Set(ids).size, 131);
  assert.deepEqual(ids, rows.map(r => r.id).reverse());
});

test('duplicate source rows and malformed or filter-mismatched cursors fail closed', async () => {
  const h = apiHarness([row(1), row(1)]);
  await assert.rejects(h.api.readSafetyReportQueue({ filter: 'all' }), /did not advance/);
  for (const cursor of ['', 'bad', JSON.stringify({ v: 1, scope: { source: 'reports', filter: 'actioned' }, createdAt: '2026-10-19', id: '2' })]) {
    await assert.rejects(h.api.readSafetyReportQueue({ filter: 'all', cursor }), /cursor/);
  }
});

test('missing/failed reviewer RPC fails closed and never substitutes legacy unfiltered rows', async () => {
  for (const error of [{ code: 'PGRST202', message: 'list_admin_reports missing' }, new Error('offline')]) {
    const h = apiHarness([row(1)], { error });
    await assert.rejects(h.api.readSafetyReportQueue({ filter: 'needs_review' }));
    assert.equal(h.tableReads(), 0);
  }
  const h = apiHarness([row(1)], { overviewError: new Error('overview offline') });
  const result = await h.api.readSafetyReportQueue({ filter: 'all' });
  assert.equal(result.overviewAvailable, false);
  assert.equal(result.summary.totalReports, 1);
});

test('null overview counts remain unknown and cannot be called global totals', async () => {
  const h = apiHarness([row(1)], { overview: { totalReports: null, actionedTodayCount: null } });
  const result = await h.api.readSafetyReportQueue({ filter: 'all' });
  assert.equal(result.overviewAvailable, false);
  assert.equal(result.summary.totalReports, 1);
  assert.equal(result.summary.actionedTodayCount, null);
  assert.equal(result.summary.needsReviewCount, null);
  assert.equal(result.summary.criticalHighRiskCount, null);
});

test('report audit helper drains tied history and rejects repeated or failed later pages', async () => {
  const ids = Array.from({ length: 251 }, (_, n) => `97300000-0000-4000-8000-${String(n+1).padStart(12,'0')}`).reverse();
  for (const mode of ['success','repeat','fail']) {
    const api = loadStubbed('_lib/moderation.ts', {
      './adminCursorPagination': loadStubbed('_lib/adminCursorPagination.ts'),
      './supabase': { supabase: { async rpc(name,args) {
        assert.equal(name,'list_admin_report_audit_events_page');
        const cursor=args.p_cursor ? JSON.parse(args.p_cursor) : null;
        if(mode==='fail' && cursor) return {error:new Error('later page failed')};
        const remaining=ids.filter(id=>mode==='repeat'||!cursor||id<cursor.id);
        const items=remaining.slice(0,args.p_limit).map(id=>({id,created_at:'2026-10-20T01:00:00Z',action:'report_review',action_category:'moderation'}));
        const hasMore=remaining.length>items.length;
        return {data:{items,hasMore,nextCursor:hasMore?JSON.stringify({v:1,scope:{source:'report-audit',reportId:'1'},id:items.at(-1).id,createdAt:items.at(-1).created_at}):null}};
      } } },
    });
    if(mode==='success') assert.equal((await api.listAdminReportAuditEvents(1)).length,251);
    else await assert.rejects(api.listAdminReportAuditEvents(1));
  }
});

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const queue = (id, nextCursor = `cursor-${id}`) => ({ items: [{ id }], summary: { totalReports: 99 },
  generatedAt: 'now', windowLimit: 25, windowFull: !!nextCursor, nextCursor, hasMore: !!nextCursor, overviewAvailable: true });

// Execute the actual screen's loader, not a reimplementation of its guards.
const screenSource = read('app/admin.tsx');
const loaderSource = screenSource.slice(screenSource.indexOf('  const loadSafetyReports = useCallback('),
  screenSource.indexOf('  const resetCounterNoticeForm = useCallback('));
function screenHarness() {
  const state = {};
  const pending = [];
  let session = { userId: 'owner', sessionGeneration: 'one', restoreOnly: false };
  const context = {
    useCallback: fn => fn, safetyReportRequestRef: { current: 0 },
    safetyReportPageRef: { current: { scope: null, cursor: null, loading: false, ids: new Set() } },
    safetyReportAuthorityKey: 'owner:one:needs_review',
    safetyReportAuthorityRef: { current: 'owner:one:needs_review' },
    canAccessAdmin: true, canReviewSafetyReports: true, user: { id: 'owner' },
    safetyReportFilter: 'needs_review',
    getCurrentAccountSessionAuthoritySnapshot: () => session,
    sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.sessionGeneration === b.sessionGeneration,
    formatAdminOperationFailure: err => err.message,
    readSafetyReportQueue: options => { const d = deferred(); pending.push({ ...d, options }); return d.promise; },
  };
  for (const name of ['SafetyReportsLoading', 'ModerationNotice', 'SafetyReports', 'SafetyReportQueueSummary',
    'SafetyReportWindow', 'SafetyReportsLastLoadedAt', 'SelectedReportAuditRows']) {
    context[`set${name}`] = value => { state[name] = typeof value === 'function' ? value(state[name]) : value; };
  }
  const compile = () => {
    const js = ts.transpileModule(`${loaderSource}\nreturn loadSafetyReports;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return new Function(...Object.keys(context), js)(...Object.values(context));
  };
  return { state, pending, context, compile, session: value => { session = value; } };
}

test('screen loads the selected filter then appends exact-cursor history and blocks duplicate load-more', async () => {
  const h = screenHarness(); const load = h.compile();
  const initial = load();
  assert.deepEqual(h.pending[0].options, { filter: 'needs_review', limit: 25, cursor: null });
  h.pending[0].resolve(queue(1)); await initial;
  const expanded = load(true); await load(true);
  assert.equal(h.pending.length, 2);
  assert.equal(h.pending[1].options.cursor, 'cursor-1');
  h.pending[1].resolve(queue(2, null)); await expanded;
  assert.deepEqual(h.state.SafetyReports, [{ id: 1 }, { id: 2 }]);
  assert.equal(h.state.SafetyReportWindow.full, false);
  await load(true); assert.equal(h.pending.length, 2);
});

test('stale filter success or failure cannot override current queue/loading/error', async () => {
  for (const fail of [false, true]) {
    const h = screenHarness(); const old = h.compile()();
    h.context.safetyReportFilter = 'actioned';
    h.context.safetyReportAuthorityKey = 'owner:one:actioned';
    h.context.safetyReportAuthorityRef.current = 'owner:one:actioned';
    const current = h.compile()();
    if (fail) h.pending[0].reject(new Error('stale failure')); else h.pending[0].resolve(queue(1));
    await old;
    assert.equal(h.state.SafetyReportsLoading, true);
    assert.equal(h.state.ModerationNotice, null);
    h.pending[1].resolve(queue(2)); await current;
    assert.deepEqual(h.state.SafetyReports, [{ id: 2 }]);
    assert.equal(h.state.SafetyReportsLoading, false);
  }
});

test('latest refresh wins and current failure clears data without claiming empty success', async () => {
  const h = screenHarness(); const load = h.compile();
  const first = load(); const latest = load();
  h.pending[1].reject(new Error('offline')); await latest;
  h.pending[0].resolve(queue(1)); await first;
  assert.deepEqual(h.state.SafetyReports, []);
  assert.equal(h.state.SafetyReportQueueSummary, null);
  assert.equal(h.state.SafetyReportWindow, null);
  assert.equal(h.state.ModerationNotice, 'offline');
  assert.equal(h.state.SafetyReportsLoading, false);
});

test('account/session replacement, permission loss and unmount suppress pending completion', async () => {
  for (const change of ['account', 'session', 'permission', 'unmount']) {
    const h = screenHarness(); const pending = h.compile()();
    if (change === 'account') h.session({ userId: 'other', sessionGeneration: 'two' });
    if (change === 'session') h.session({ userId: 'owner', sessionGeneration: 'two' });
    if (change === 'permission') h.context.safetyReportAuthorityRef.current = 'locked';
    if (change === 'unmount') h.context.safetyReportRequestRef.current++;
    h.pending[0].resolve(queue(1)); await pending;
    assert.deepEqual(h.state.SafetyReports, []);
    assert.equal(h.state.SafetyReportQueueSummary, null);
  }
});

test('unauthorized or missing session clears prior rows and never starts a read', async () => {
  for (const reason of ['permission', 'session', 'restore']) {
    const h = screenHarness();
    h.state.SafetyReports = [{ id: 99 }];
    if (reason === 'permission') h.context.canReviewSafetyReports = false;
    if (reason === 'session') h.session(null);
    if (reason === 'restore') h.session({ userId: 'owner', sessionGeneration: 'one', restoreOnly: true });
    await h.compile()();
    assert.equal(h.pending.length, 0);
    assert.deepEqual(h.state.SafetyReports, []);
    assert.equal(h.state.SafetyReportsLoading, false);
  }
});

test('screen labels continuation and provides a load-more button', () => {
  assert.match(screenSource, /End of matching history/);
  assert.match(screenSource, /onPress=\{\(\) => void loadSafetyReports\(true\)\}/);
  assert.match(screenSource, /label: "Loaded Count",\s*value: safetyReportQueueConnected \? String\(safetyReports.length\)/);
  assert.match(screenSource, /Report queue unavailable/);
});

test('report audit detail ignores unrendered session/account changes, permission loss and unmount', async () => {
  const start=screenSource.indexOf('  useEffect(() => {\n    setSelectedReportAuditComplete(false);');
  const source=screenSource.slice(start,screenSource.indexOf('\n\n  useEffect(',start+10));
  for(const change of ['current','account','session','unmount','permission']) {
    const pending=deferred(); const state={}; let cleanup;
    let session={userId:'owner',sessionGeneration:'one',restoreOnly:false};
    const context={
      useEffect:fn=>{cleanup=fn();},user:{id:'owner'},safetyReportDetailVisible:true,selectedSafetyReport:{id:1},
      safetyReportAuthorityKey:'owner:one',safetyReportAuthorityRef:{current:'owner:one'},
      canReviewSafetyReports:change!=='permission',getCurrentAccountSessionAuthoritySnapshot:()=>session,
      sameAccountSessionAuthority:(a,b)=>a?.userId===b?.userId&&a?.sessionGeneration===b?.sessionGeneration,
      listAdminReportAuditEvents:()=>pending.promise,
      setSelectedReportAuditComplete:value=>{state.complete=value;},
      setSelectedReportAuditScope:value=>{state.scope=value;},
      setSelectedReportAuditRows:value=>{state.rows=value;},
      setSelectedReportAuditLoading:value=>{state.loading=value;},
    };
    new Function(...Object.keys(context),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(context));
    if(change==='account') session={userId:'other',sessionGeneration:'one'};
    if(change==='session') session={userId:'owner',sessionGeneration:'two'};
    if(change==='unmount') cleanup();
    pending.resolve([{id:'audit'}]); await new Promise(resolve=>setImmediate(resolve));
    if(change==='current') {assert.deepEqual(state.rows,[{id:'audit'}]);assert.equal(state.complete,true);}
    else {assert.deepEqual(state.rows,[]);assert.equal(state.complete,false);}
  }
});
