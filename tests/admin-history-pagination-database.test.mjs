import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createDatabase } from './helpers/database-runtime-authority-fixture.mjs';

test('real PostgreSQL history contracts preserve tied boundaries, exact aggregates, ACLs and authority', async () => {
  const { db } = await createDatabase({ includeHeldStudio: true, applyRepair: true });
  try {
    const source = fs.readFileSync('supabase/tests/admin_history_pagination_test.sql', 'utf8');
    await db.exec('begin;' + source.split('-- BEGIN FIXTURES:')[1].split('\n').slice(1).join('\n').split('-- END FIXTURES')[0]);
    await db.exec('set local role authenticated');
    const rpc = async (name, params, values) => (await db.query(`select public.${name}(${params}) as result`, values)).rows[0].result;
    let cursor = null; const reports = []; let pages = 0;
    do {
      const page = await rpc('list_admin_reports_page', '$1,$2,$3', ['needs_review', cursor, 50]);
      reports.push(...page.items); cursor = page.nextCursor; pages++;
      assert.equal(page.hasMore, !!cursor); assert.ok(pages < 10);
    } while (cursor);
    assert.equal(pages, 3); assert.equal(reports.length, 125);
    assert.equal(new Set(reports.map(r => r.id)).size, 125); assert.equal(reports[0].id, 970000125);
    cursor = null; pages = 0; const audits = [];
    do {
      const page = await rpc('list_admin_report_audit_events_page', '$1,$2,$3', [970000001, cursor, 100]);
      audits.push(...page.items); cursor=page.nextCursor; pages++; assert.ok(pages<10);
    } while (cursor);
    assert.equal(pages,3); assert.equal(audits.length,251); assert.equal(new Set(audits.map(row=>row.id)).size,251);
    cursor = null; pages = 0; const cases = [];
    do {
      const page = await rpc('list_admin_dmca_cases_page', '$1,$2,$3,$4,$5', ['all', 'history-fixture-', cursor, 50, false]);
      cases.push(...page.items); cursor = page.nextCursor; pages++;
      assert.equal(page.hasMore, !!cursor); assert.ok(pages < 10);
      if (pages===1) {
        const repeated=await rpc('list_admin_dmca_cases_page','$1,$2,$3,$4,$5',['all','history-fixture-',null,50,false]);
        assert.deepEqual(repeated,page,'replaying a page is deterministic');
        await db.exec("reset role; update public.dmca_cases set admin_notes='Interleaved update' where case_number='history-fixture-150'; set local role authenticated");
      }
    } while (cursor);
    assert.equal(pages, 6); assert.equal(cases.length, 251); assert.equal(new Set(cases.map(c => c.id)).size, 251);
    assert.equal(cases.find(c=>c.case_number==='history-fixture-150').admin_notes,'Interleaved update');
    assert.ok(cases.every(c => c.active_strike_count === 601));
    assert.equal(cases.find(c => c.case_number === 'history-fixture-2').last_action, 'admin_note_added');
    const summary = await rpc('get_admin_dmca_case_summary', '$1', [false]);
    assert.equal(summary.total, 251); assert.equal(summary.open, 250); assert.equal(summary.priority, 251);
    assert.equal(summary.byStatus.received, 250); assert.equal(summary.byStatus.closed, 1);
    assert.equal((await rpc('get_admin_dmca_case_summary', '$1', [true])).total, 252);
    assert.equal((await rpc('list_admin_dmca_cases_page', '$1,$2,$3,$4,$5', ['all', 'history-fixture-1', null, 200, false])).items.length, 111);
    for (const fn of ['list_admin_reports_page(text,text,integer)', 'list_admin_dmca_cases_page(text,text,text,integer,boolean)', 'get_admin_dmca_case_summary(boolean)', 'list_admin_report_audit_events_page(bigint,text,integer)']) {
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', ['anon', `public.${fn}`, 'execute'])).rows[0].allowed, false);
    }
    assert.equal((await db.query("select prosecdef from pg_proc where oid='public.list_admin_dmca_cases_page(text,text,text,integer,boolean)'::regprocedure")).rows[0].prosecdef, false);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.dmca_cases'::regclass")).rows[0].relrowsecurity, true);
    const rejects = async (operation, pattern) => {
      await db.exec('savepoint expected_error'); await assert.rejects(operation(), pattern); await db.exec('rollback to expected_error');
    };
    const first = await rpc('list_admin_reports_page', '$1,$2,$3', ['needs_review', null, 50]);
    await rejects(() => rpc('list_admin_reports_page', '$1,$2,$3', ['all', first.nextCursor, 50]), /invalid_history_cursor/);
    await rejects(() => rpc('list_admin_reports_page', '$1,$2,$3', ['all', 'bad', 50]), /invalid_history_cursor/);
    await rejects(() => rpc('list_admin_reports_page', '$1,$2,$3', ['all', JSON.stringify({v:1,scope:{source:'reports',filter:'all'},createdAt:'yesterday',id:'1'}), 50]), /invalid_history_cursor/);
    await rejects(() => rpc('list_admin_dmca_cases_page', '$1,$2,$3,$4,$5', ['all', '', first.nextCursor, 50, false]), /invalid_history_cursor/);
    await db.exec(`reset role; select set_config('request.jwt.claims','{"role":"authenticated","sub":"97000000-0000-4000-8000-000000000002","session_id":"97100000-0000-4000-8000-000000000002"}',true); set local role authenticated;`);
    await rejects(() => rpc('list_admin_reports_page', '', []), /admin_reports_permission_denied/);
    await rejects(() => rpc('list_admin_dmca_cases_page', '', []), /dmca_owner_or_scoped_staff_required/);
    await rejects(() => rpc('get_admin_dmca_case_summary', '', []), /dmca_owner_or_scoped_staff_required/);
    await rejects(() => rpc('list_admin_report_audit_events_page', '$1', [970000001]), /admin_reports_permission_denied/);
  } finally { await db.close(); }
});
