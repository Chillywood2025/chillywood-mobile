import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { loadStubbed, read } from './customer-experience-adversarial-helpers.mjs';
const paging = loadStubbed('supabase/functions/_shared/admin-history-pagination.ts');
const source = read('supabase/functions/admin-owner-controls/index.ts');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
function extract(name) {
  let text;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) text = node.initializer.getText(ast); ts.forEachChild(node, visit); }
  visit(ast); assert.ok(text, name); return ts.transpileModule(`return ${text};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
const normalize = new Function('sanitizeObject', 'toText', 'redactText', 'shortSecurityIdentifier', extract('normalizeAuditRow'))(
  row => row ?? {}, value => String(value ?? '').trim(), value => String(value ?? '').replaceAll('secret', '[redacted]'), value => value?.slice(0, 6),
);
function handler(name) {
  const mocks = {
    ...paging, normalizeAuditRow: normalize, hasAnyPermission: (user, keys) => user.role === 'owner' || keys.some(key => user.permissions.has(key)),
    toText: value => String(value ?? '').trim(), parseLimit: (value, fallback, max) => Math.max(1, Math.min(max, Number(value ?? fallback))),
    json: (status, payload) => ({ status, payload }), normalizePermission: value => String(value ?? '').toLowerCase(),
    sanitizeObject: row => row, readSecurityContextSummary: async () => ({ captureStatus: 'available' }),
  };
  return new Function(...Object.keys(mocks), extract(name))(...Object.values(mocks));
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (n, extra = {}) => ({ id: id(n), created_at: '2026-10-19T10:00:00.123456+00:00', ...extra });
const owner = { id: 'owner', role: 'owner', permissions: new Set() };
function database(tables, failure) {
  const calls = [];
  return { calls, from(table) {
    const filters = [], ordering = []; let cap = Infinity;
    const result = () => {
      if (table === failure) return { data: null, error: { message: 'source failed' } };
      const matching = (tables[table] ?? []).filter(row => filters.every(filter => filter(row))).sort((a, b) => {
        for (const { key, ascending } of ordering) if (a[key] !== b[key]) return (a[key] < b[key] ? -1 : 1) * (ascending ? 1 : -1);
        return 0;
      });
      return { data: matching.slice(0, cap), count: matching.length, error: null };
    };
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      gte(key, value) { filters.push(row => Date.parse(row[key]) >= Date.parse(value)); return query; },
      lte(key, value) { filters.push(row => Date.parse(row[key]) <= Date.parse(value)); return query; },
      order(key, { ascending }) { ordering.push({ key, ascending }); return query; },
      or(clause) {
        calls.push({ table, clause });
        if (clause.startsWith('metadata->>')) filters.push(row => row.metadata?.canary_proof !== true);
        else if (clause.includes('.imatch.')) {
          // Match PostgREST pQuotedValue: each backslash escapes exactly one
          // character. PostgreSQL's literal regex is then used unchanged.
          const patterns = [...clause.matchAll(/(?:^|,)(\w+)\.imatch\."((?:\\.|[^"])*)"/g)].map((match) => {
            const value = match[2].replace(/\\(.)/gs, '$1');
            return { field: match[1], regex: new RegExp(value, 'is') };
          });
          assert.ok(patterns.length);
          filters.push(row => patterns.some(({ field, regex }) => regex.test(String(row[field] ?? ''))));
        } else {
          const match = clause.match(/^(\w+)\.lt\.(.*),and\(\1\.eq\.(.*),id\.lt\.([^)]*)\)$/); assert.ok(match, clause);
          filters.push(row => row[match[1]] < match[2] || row[match[1]] === match[2] && row.id < match[4]);
        }
        return query;
      },
      limit(value) { cap = value; return query; },
      maybeSingle: async () => { const value = result(); return { ...value, data: value.data?.[0] ?? null }; },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    }; return query;
  } };
}

test('actual legal list applies proof/status/search filters before the page limit', async () => {
  const rows = Array.from({ length: 160 }, (_, i) => row(i + 1, { status: i < 50 ? 'under_review' : 'closed', requesting_agency: i < 25 ? 'agency needle' : 'other', metadata: i > 130 ? { canary_proof: true } : {} }));
  const db = database({ legal_request_intake: rows });
  const list = handler('legalRequestList'); let cursor = null; const all = [];
  do {
    const response = await list(db, owner, { limit: 7, cursor, status: 'under_review', search: 'needle' });
    assert.equal(response.status, 200); all.push(...response.payload.requests); cursor = response.payload.nextCursor;
  } while (cursor);
  assert.equal(all.length, 25); assert.equal(new Set(all.map(row => row.id)).size, 25);
  assert.ok(all.every(row => row.requesting_agency.includes('needle') && row.status === 'under_review'));
});

test('actual legal detail independently traverses all three histories beyond former caps', async () => {
  const requestId = id(999);
  const rows = Array.from({ length: 135 }, (_, i) => row(i + 1, { legal_request_id: requestId, placed_at: '2026-10-19T10:00:00.123456+00:00' }));
  const db = database({ legal_request_intake: [row(999)], legal_request_events: rows, legal_evidence_requests: rows, legal_holds: rows });
  const detail = handler('legalRequestDetail');
  for (const historyKind of ['events', 'evidenceRequests', 'holds']) {
    let cursor = null; const all = [];
    do {
      const response = await detail(db, owner, { id: requestId, historyKind, cursor, limit: 30 });
      all.push(...response.payload[historyKind]); cursor = response.payload.historyPages[historyKind].nextCursor;
      for (const other of ['events', 'evidenceRequests', 'holds'].filter(key => key !== historyKind)) assert.equal(response.payload.historyPages[other], null);
    } while (cursor);
    assert.equal(all.length, 135); assert.equal(new Set(all.map(row => row.id)).size, 135);
  }
});

test('legal literal punctuation survives PostgREST and regex escaping without broadening search', async () => {
  const agencies = ['AB', 'A_B', 'A%B', 'A\\B', 'A"B', 'A*B', 'A.B', 'A[B', 'A(B', 'A|B'];
  const db = database({ legal_request_intake: agencies.map((requesting_agency, index) => row(index + 1, { requesting_agency })) });
  const list = handler('legalRequestList');
  for (const [search, expected] of [['_', 'A_B'], ['%', 'A%B'], ['\\', 'A\\B'], ['"', 'A"B'], ['*', 'A*B'], ['.', 'A.B'], ['[', 'A[B'], ['(', 'A(B'], ['|', 'A|B']]) {
    const response = await list(db, owner, { search, limit: 10 });
    assert.deepEqual(response.payload.requests.map(row => row.requesting_agency), [expected]);
  }
});

test('actual audit handler reaches older filters and preserves owner suppression, redaction and scoped access', async () => {
  const rows = Array.from({ length: 1105 }, (_, i) => row(i + 1, { action: i < 3 ? 'target-action' : 'other', actor_role: i === 0 ? 'owner' : 'operator', metadata: {}, reason: 'secret reason' }));
  const db = database({ platform_admin_audit_logs: rows }); const list = handler('auditList');
  const user = { id: 'audit-reader', role: 'operator', permissions: new Set(['admin.audit.view']) };
  const first = await list(db, user, { actionType: 'target-action', limit: 10 });
  assert.equal(first.payload.rows.length, 0); assert.equal(first.payload.hasMore, true); assert.equal(first.payload.summary.scanLimitReached, true);
  const next = await list(db, user, { actionType: 'target-action', limit: 10, cursor: first.payload.nextCursor });
  assert.deepEqual(next.payload.rows.map(row => row.id), [id(3), id(2)]);
  assert.equal(next.payload.rows[0].reason, '[redacted] reason'); assert.equal(next.payload.completeness, 'complete');
  assert.equal((await list(db, { ...user, permissions: new Set() }, {})).status, 403);
});

test('actual audit source failure rejects partial results and normal owner Break Glass remains visible', async () => {
  const list = handler('auditList');
  const db = database({ platform_admin_audit_logs: [row(2, { actor_role: 'owner', metadata: { break_glass_active: true } }), row(1, { actor_role: 'owner', metadata: {} })] });
  const response = await list(db, owner, { limit: 10 });
  assert.deepEqual(response.payload.rows.map(row => row.id), [id(2)]);
  await assert.rejects(list(database({}, 'legal_evidence_audit_log'), owner, {}), /Audit source legal_evidence unavailable/);
});
