import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStubbed, read } from './customer-experience-adversarial-helpers.mjs';

const paging = loadStubbed('supabase/functions/_shared/admin-history-pagination.ts');
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const time = '2026-10-19T12:00:00.123456+00:00';
const row = (number, extra = {}) => ({ id: id(number), created_at: time, ...extra });
function source(rows, options = {}) {
  const calls = [];
  return { calls, query() {
    const filters = [], orders = []; let limit;
    const q = {
      lte(column, value) { filters.push(r => Date.parse(r[column]) <= Date.parse(value)); return q; },
      order(column, order) { orders.push({ column, ...order }); return q; },
      or(value) {
        calls.push(value);
        const parts = value.match(/^(\w+)\.lt\.(.*),and\(\1\.eq\.(.*),id\.lt\.([^)]*)\)$/);
        assert.ok(parts, value);
        filters.push(r => r[parts[1]] < parts[2] || r[parts[1]] === parts[2] && r.id < parts[4]); return q;
      },
      limit(value) { limit = value; return q; },
      then(resolve, reject) {
        if (options.throw) return Promise.reject(new Error('offline')).then(resolve, reject);
        const matching = rows.filter(r => filters.every(fn => fn(r))).sort((a, b) => {
          for (const order of orders) if (a[order.column] !== b[order.column]) return (a[order.column] < b[order.column] ? -1 : 1) * (order.ascending ? 1 : -1);
          return 0;
        });
        const data = matching.slice(0, Math.min(limit, options.serverLimit ?? Infinity));
        return Promise.resolve(options.error ? { error: { message: options.error } } : { data, count: matching.length }).then(resolve, reject);
      },
    }; return q;
  } };
}

test('composite history page traverses more than two pages of identical timestamps exactly once', async () => {
  const s = source(Array.from({ length: 137 }, (_, i) => row(i + 1)));
  const all = []; let cursor = null, count = 0;
  do {
    const page = await paging.readHistoryPage({ query: s.query, scope: 'account:filter', limit: 25, cursor });
    all.push(...page.items.map(r => r.id)); cursor = page.nextCursor; count++;
    assert.equal(page.hasMore, !!cursor);
  } while (cursor);
  assert.equal(count, 6); assert.equal(all.length, 137); assert.equal(new Set(all).size, 137);
  assert.equal(all.at(-1), id(1));
});

test('merged sources do not drop buffered rows across three pages of timestamp collisions', async () => {
  const sources = ['a', 'b', 'c'].map(key => ({ key, ...source(Array.from({ length: 80 }, (_, i) => row(i + 1))) }));
  const all = []; let cursor = null;
  do {
    const result = await paging.readMergedHistoryPage({ sources, scope: 'audit:one', cursor, limit: 31,
      normalize: (source, row) => ({ ...row, source }), matches: () => true });
    all.push(...result.items.map(r => `${r.source}:${r.id}`)); cursor = result.nextCursor;
  } while (cursor);
  assert.equal(all.length, 240); assert.equal(new Set(all).size, 240);
});

test('older filtered matches remain reachable beyond scan limits and empty pages', async () => {
  const s = source(Array.from({ length: 220 }, (_, i) => row(i + 1, { wanted: i < 4 })));
  let cursor = null; const all = []; let emptyPages = 0;
  do {
    const result = await paging.readMergedHistoryPage({ sources: [{ key: 'one', query: s.query }], scope: 'filter:old', cursor,
      limit: 2, scanLimit: 30, normalize: (_key, row) => row, matches: r => r.wanted });
    if (!result.items.length) { emptyPages++; assert.equal(result.hasMore, true); assert.equal(result.scanLimitReached, true); }
    all.push(...result.items.map(r => r.id)); cursor = result.nextCursor;
  } while (cursor);
  assert.ok(emptyPages > 2); assert.deepEqual(all, [4, 3, 2, 1].map(id));
});

test('malformed, wrong-account and changed-filter cursors reject before querying', async () => {
  const s = source([row(3), row(2), row(1)]);
  const page = await paging.readHistoryPage({ query: s.query, scope: 'account-one:filter-one', limit: 1 });
  for (const cursor of ['garbage', '{}', JSON.stringify({ ...JSON.parse(page.nextCursor), positions: { rows: { at: time, id: 'a),id.gt.0' } } })]) {
    await assert.rejects(paging.readHistoryPage({ query: s.query, scope: 'account-one:filter-one', limit: 1, cursor }), /Invalid or stale/);
  }
  for (const scope of ['account-two:filter-one', 'account-one:filter-two']) {
    await assert.rejects(paging.readHistoryPage({ query: s.query, scope, limit: 1, cursor: page.nextCursor }), /Invalid or stale/);
  }
});

test('repeated pages do not loop and source failures never become empty complete success', async () => {
  const s = source([row(4), row(3), row(2)]);
  const first = await paging.readHistoryPage({ query: s.query, scope: 'one', limit: 1 });
  const badQuery = () => {
    const q = { lte: () => q, or: () => q, order: () => q, limit: () => Promise.resolve({ data: [row(4), row(3)], count: 2 }) }; return q;
  };
  await assert.rejects(paging.readHistoryPage({ query: badQuery, scope: 'one', cursor: first.nextCursor, limit: 1 }), /did not advance/);
  const failed = source([], { error: 'denied' });
  await assert.rejects(paging.readMergedHistoryPage({ sources: [{ key: 'good', query: s.query }, { key: 'failed', query: failed.query }], scope: 'one', limit: 2,
    normalize: (_key, row) => row, matches: () => true }), /Audit source failed unavailable/);
});

test('microsecond ordering remains distinct while UUID ties descend deterministically', async () => {
  const s = source([row(2, { created_at: time.replace('123456', '123455') }), row(1)]);
  const page = await paging.readHistoryPage({ query: s.query, scope: 'one', limit: 2 });
  assert.deepEqual(page.items.map(r => r.id), [id(1), id(2)]);
});

test('lower server row caps cannot masquerade as complete Legal or Audit history', async () => {
  const s = source(Array.from({ length: 31 }, (_, i) => row(i + 1)), { serverLimit: 3 });
  const all = []; let cursor = null;
  do {
    const page = await paging.readHistoryPage({ query: s.query, scope: 'capped', limit: 25, cursor });
    all.push(...page.items); cursor = page.nextCursor;
  } while (cursor);
  assert.equal(all.length, 31); assert.equal(new Set(all.map(row => row.id)).size, 31);
  const audit = await paging.readMergedHistoryPage({ sources: [{ key: 'capped', query: s.query }], scope: 'audit', limit: 50,
    normalize: (_key, row) => row, matches: () => true });
  assert.equal(audit.items.length, 31); assert.equal(audit.hasMore, false);
});

test('legal and audit read handlers retain protected/redacted paths with explicit completeness', () => {
  const code = read('supabase/functions/admin-owner-controls/index.ts');
  assert.match(code, /metadata->>canary_proof\.is\.null,metadata->>canary_proof\.neq\.true/);
  assert.match(code, /scope: JSON\.stringify\(\["legal", user\.id, status, search\]\)/);
  assert.match(code, /row\.actorRole === "owner" && row\.breakGlassActive !== true && row\.source !== "break_glass"/);
  assert.match(code, /nextCursor: page\.nextCursor, hasMore: page\.hasMore, completeness: page\.completeness/);
  assert.match(code, /historyPages: \{ events: metadata\(events\), evidenceRequests: metadata\(evidenceRequests\), holds: metadata\(holds\) \}/);
  assert.match(code, /requests: page\.items\.map\(sanitizeObject\)/);
});

test('client read wrappers reject malformed, partial and negative history responses', async () => {
  const api = data => loadStubbed('_lib/adminOwnerControls.ts', {
    './supabase': { supabase: { functions: { invoke: async () => ({ data, error: null }) } } },
    'react-native': { Platform: { OS: 'ios' } }, 'expo-constants': { default: { expoConfig: {} } },
  });
  for (const payload of [{ requests: [] }, { requests: [], hasMore: true, nextCursor: null }, { requests: [], hasMore: false, nextCursor: 'stale' }, { requests: [], hasMore: false, nextCursor: null, error: 'denied' }]) {
    await assert.rejects(api(payload).listLegalRequestsPage());
  }
  for (const payload of [{ rows: [] }, { rows: [], hasMore: true, nextCursor: 'cursor', completeness: 'complete' }, { rows: [], hasMore: false, nextCursor: null, completeness: 'more_history' }]) {
    await assert.rejects(api(payload).listOwnerControlAudit());
  }
  const complete = { hasMore: false, nextCursor: null };
  const detail = { request: { id: 'case' }, events: [], evidenceRequests: [], holds: [], historyPages: { events: complete, evidenceRequests: complete, holds: complete } };
  assert.equal((await api(detail).readLegalRequestDetail({ id: 'case' })).historyPages.events.hasMore, false);
  await assert.rejects(api({ ...detail, request: { id: 'other' } }).readLegalRequestDetail({ id: 'case' }), /did not match/);
  await assert.rejects(api({ ...detail, historyPages: { events: complete } }).readLegalRequestDetail({ id: 'case' }));
});
