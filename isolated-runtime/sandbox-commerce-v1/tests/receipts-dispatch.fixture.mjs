// Local-only concurrency instrumentation for the real begin_dispatch source.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { sqlText } from './receipts.fixture.mjs';

export async function runDispatchConcurrencyCases({ q, runQuery, api, bin, args, env }) {
  const clients = [], cases = [], evidence = [];
  const gateKey = [683, 55451];
  const session = (sql, eof = false) => {
    const child = spawn(path.join(bin, 'psql'), args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const s = { child, stdout: '', stderr: '', closed: false, code: null };
    clients.push(s);
    child.stdout.on('data', value => { s.stdout += value.toString(); });
    child.stderr.on('data', value => { s.stderr += value.toString(); });
    child.on('error', error => { s.stderr += error.message; });
    child.on('close', code => { s.closed = true; s.code = code; });
    child.stdin.on('error', error => { s.stderr += error.message; });
    const payload = "set statement_timeout='8s';set idle_in_transaction_session_timeout='12s';select 'FIXTURE_PID:'||pg_backend_pid();\n" + sql + '\n';
    if (eof) child.stdin.end(payload); else child.stdin.write(payload);
    return s;
  };
  const waitFor = async (check, description, limit = 2500) => {
    const until = Date.now() + limit;
    while (!check() && Date.now() < until) await delay(15);
    assert.ok(check(), description + '\n' + clients.filter(c => c.code !== 0 && c.closed).map(c => c.stderr).join('\n'));
  };
  const pid = s => Number(s.stdout.match(/^FIXTURE_PID:(\d+)$/mu)?.[1]);
  const waitPid = async s => { await waitFor(() => Number.isInteger(pid(s)), 'Missing local backend PID'); return pid(s); };
  const closeSuccess = async (s, sql = null) => {
    if (sql !== null && !s.child.stdin.writableEnded) s.child.stdin.end(sql + '\n');
    await waitFor(() => s.closed, 'Local session did not finish', 3000);
    assert.equal(s.code, 0, s.stderr); return s.stdout;
  };
  const blockers = backendPid => JSON.parse(q(`select to_json(pg_blocking_pids(${backendPid}));`));
  const noClaim = context => {
    assert.equal(q(`select count(*) from sandbox_commerce_v1.dispatch_attempts where intent_id='${context.rawIntentId}';`), '0');
    assert.equal(q(`select state||':'||(dispatch_id is null)::text||':'||(dispatched_at is null)::text from sandbox_commerce_v1.intents where id='${context.rawIntentId}';`), 'prepared:true:true');
  };
  const quoteWriters = context => [
    ['provider route', `update sandbox_commerce_v1.provider_routes set initiation_enabled=false where provider=${sqlText(context.provider)} and scope_key=${sqlText(context.providerScopeKey)} and store=${sqlText(context.store)};`],
    ['offer', `update sandbox_commerce_v1.offers set status='retired' where id=${sqlText(context.offer.id.replace('scv1_offer_', ''))};`],
    ['resource', `update sandbox_commerce_v1.resources set status='quarantined' where id=${sqlText(context.resource.id.replace('scv1_resource_', ''))};`],
    ['catalog', `update sandbox_commerce_v1.catalog set amount_minor=amount_minor+1 where provider=${sqlText(context.provider)} and scope_key=${sqlText(context.providerScopeKey)} and store=${sqlText(context.store)} and product_id=${sqlText(context.productId)};`],
  ];
  const fresh = () => { api.reset(); return api.prepare(api.seedCatalog()); };
  const claimSql = context => api.servicePrefix + `select public.isolated_sandbox_begin_dispatch_v1(${sqlText(context.intent.id)},${sqlText(context.dispatchId)});`;
  const gated = async context => {
    const holder = session(`begin;select pg_advisory_xact_lock(${gateKey});select 'GATE_HELD';`);
    await waitFor(() => holder.stdout.includes('GATE_HELD'), 'Fixture gate not acquired');
    const holderPid = await waitPid(holder);
    const dispatch = session(claimSql(context), true);
    const dispatchPid = await waitPid(dispatch);
    await waitFor(() => /FIXTURE_DEADLINE_MS:\d+/u.test(dispatch.stderr)
      && /FIXTURE_TRANSACTION_DEADLINE_MS:\d+/u.test(dispatch.stderr), 'After-write trigger deadlines were not emitted');
    const deadlineMs = Number(dispatch.stderr.match(/FIXTURE_DEADLINE_MS:(\d+)/u)[1]);
    assert.ok(Number.isSafeInteger(deadlineMs));
    const transactionDeadlineMs = Number(dispatch.stderr.match(/FIXTURE_TRANSACTION_DEADLINE_MS:(\d+)/u)?.[1]);
    assert.ok(Number.isSafeInteger(transactionDeadlineMs), 'Missing emitted transaction cap');
    await waitFor(() => blockers(dispatchPid).includes(holderPid), 'Dispatch did not block on its fixture gate');
    return { holder, holderPid, dispatch, dispatchPid, deadlineMs, transactionDeadlineMs };
  };
  let triggerInstalled = false;
  try {
    for (let index = 0; index < 4; index++) {
      const context = fresh(), [label, update] = quoteWriters(context)[index];
      const writer = session('begin;' + update + "select 'WRITER_HELD';");
      await waitFor(() => writer.stdout.includes('WRITER_HELD'), `Writer did not hold ${label}`);
      const writerPid = await waitPid(writer);
      const denied = runQuery("set statement_timeout='2s';" + claimSql(context));
      assert.notEqual(denied.status, 0, `${label} writer should deny admission`);
      assert.match(denied.stderr, /could not obtain lock on row in relation/u);
      noClaim(context);
      await closeSuccess(writer, 'commit;');
      const committedDenial = runQuery(claimSql(context));
      assert.notEqual(committedDenial.status, 0, `${label} committed takedown should remain denied`);
      assert.match(committedDenial.stderr, /sandbox_provider_route_unavailable|sandbox_tip_quote_changed/u);
      noClaim(context);
      cases.push(`Pre-existing ${label} row writer denies dispatch NOWAIT without a claim`);
      evidence.push({ schedule: 'writer-first', relation: label, writerPid, denial: 'row_lock_nowait',
        dispatchWritesRolledBack: true, committedTakedownRemainedDenied: true });
    }
    // AFTER UPDATE observes both dispatch_attempts INSERT and intents UPDATE.
    // NOTICE is immediate; transactional NOTIFY would be too late for this proof.
    q(`create schema receipt_dispatch_fixture;
      grant usage on schema receipt_dispatch_fixture to sbx_v1_core_owner;
      create function receipt_dispatch_fixture.after_claim() returns trigger
      language plpgsql security invoker set search_path='' as $$
      declare lease timestamptz;
      begin
        select a.authority_valid_until into strict lease from sandbox_commerce_v1.dispatch_attempts a where a.intent_id=new.id;
        raise notice 'FIXTURE_DEADLINE_MS:%',floor(extract(epoch from lease)*1000)::bigint;
        raise notice 'FIXTURE_TRANSACTION_DEADLINE_MS:%',floor(extract(epoch from (transaction_timestamp()+interval '5 seconds'))*1000)::bigint;
        perform pg_advisory_xact_lock(${gateKey});return new;
      end;$$;
      create trigger fixture_after_dispatch_writes after update on sandbox_commerce_v1.intents
      for each row when(old.state='prepared' and new.state='provider_pending')
      execute function receipt_dispatch_fixture.after_claim();`);
    triggerInstalled = true;
    {
      const context = fresh(), gate = await gated(context);
      const writers = quoteWriters(context).map(([label, update]) => ({ label,
        client: session(update + "select 'WRITER_DONE';", true) }));
      await Promise.all(writers.map(w => waitPid(w.client)));
      const blockerEvidence = [];
      for (const writer of writers) {
        const writerPid = pid(writer.client);
        await waitFor(() => blockers(writerPid).includes(gate.dispatchPid), `${writer.label} was not blocked by the admitted dispatch`);
        blockerEvidence.push({ relation: writer.label, writerPid, blockedBy: gate.dispatchPid });
      }
      const releaseAt = Number(q('select floor(extract(epoch from clock_timestamp())*1000)::bigint;'));
      assert.ok(releaseAt < gate.deadlineMs - 100, 'Positive schedule failed to retain an unexpired authority lease');
      await closeSuccess(gate.holder, 'commit;');
      await closeSuccess(gate.dispatch);
      const claim = JSON.parse(gate.dispatch.stdout.split('\n').find(line => line.startsWith('{')));
      assert.equal(claim.status, 'dispatch_claimed'); assert.equal(claim.dispatchAllowed, true);
      await Promise.all(writers.map(writer => closeSuccess(writer.client)));
      assert.equal(q(`select count(*) from sandbox_commerce_v1.dispatch_attempts where intent_id='${context.rawIntentId}';`), '1');
      assert.equal(q(`select state from sandbox_commerce_v1.intents where id='${context.rawIntentId}';`), 'provider_pending');
      cases.push('Admitted dispatch holds exact route, offer, resource and catalog rows through both writes and return');
      evidence.push({ schedule: 'dispatch-first', gatePid: gate.holderPid, dispatchPid: gate.dispatchPid,
        blockedAtAfterBothWrites: true, writerBlockers: blockerEvidence, releaseAt, authorityDeadlineMs: gate.deadlineMs,
        writersBlockedUntilDispatchTransactionCompleted: true });
    }
    {
      const context = fresh();
      // The product transaction cap is independently tested elsewhere. Make
      // buyer authority expire first, so this schedule still tests the final
      // freshness checks after both writes rather than accepting a generic
      // FATAL transaction timeout as evidence that those checks executed.
      const buyerDeadlineMs = Number(q(`update auth.sessions set not_after=clock_timestamp()+interval '1500 milliseconds'
        where id=(select buyer_session_id from sandbox_commerce_v1.intents where id='${context.rawIntentId}')
        returning floor(extract(epoch from not_after)*1000)::bigint;`));
      assert.ok(Number.isSafeInteger(buyerDeadlineMs));
      const gate = await gated(context);
      assert.equal(gate.deadlineMs, buyerDeadlineMs, 'Dispatch lease must use the shortened buyer deadline');
      assert.ok(gate.transactionDeadlineMs - gate.deadlineMs > 2000, 'Authority expiry must precede the transaction cap with margin');
      const waitingAt = Number(q('select floor(extract(epoch from clock_timestamp())*1000)::bigint;'));
      assert.ok(waitingAt < gate.deadlineMs - 100, 'Fixture setup missed the unexpired authority window');
      await delay(gate.deadlineMs - waitingAt + 50);
      const releaseAt = Number(q('select floor(extract(epoch from clock_timestamp())*1000)::bigint;'));
      assert.ok(releaseAt > gate.deadlineMs, 'Fixture did not pass the actual emitted authority deadline');
      assert.ok(releaseAt < gate.transactionDeadlineMs - 1000, 'Fixture missed the pre-transaction-cap release window');
      assert.equal(gate.dispatch.closed, false, 'Dispatch must remain blocked before authority-expired release');
      assert.ok(blockers(gate.dispatchPid).includes(gate.holderPid), 'Dispatch lost its after-write barrier before release');
      await closeSuccess(gate.holder, 'commit;');
      await waitFor(() => gate.dispatch.closed, 'Expired dispatch did not finish', 2500);
      assert.notEqual(gate.dispatch.code, 0); assert.match(gate.dispatch.stderr, /sandbox_authority_expired|sandbox_dispatch_authority_expired/u);
      assert.doesNotMatch(gate.dispatch.stderr, /terminating connection due to transaction timeout/u);
      assert.doesNotMatch(gate.dispatch.stdout, /"dispatchAllowed"\s*:\s*true/u);
      noClaim(context);
      cases.push('Authority expiry after both dispatch writes rolls back claim and intent state before any capability returns');
      evidence.push({ schedule: 'after-writes-deadline', gatePid: gate.holderPid, dispatchPid: gate.dispatchPid,
        blockedAtAfterBothWrites: true, authorityDeadlineMs: gate.deadlineMs, buyerDeadlineMs,
        transactionDeadlineMs: gate.transactionDeadlineMs, releaseAt,
        claimRolledBack: true, intentRolledBack: true, returnedCapability: false });
    }
    return { cases, evidence };
  } finally {
    for (const s of clients) if (!s.closed) {
      s.child.kill('SIGTERM');
      const until = Date.now() + 1500;
      while (!s.closed && Date.now() < until) await delay(15);
      if (!s.closed) {
        s.child.kill('SIGKILL');
        await waitFor(() => s.closed, 'Local test client could not be terminated', 1500);
      }
    }
    assert.ok(clients.every(s => s.closed), 'Local concurrency sessions remain active');
    if (triggerInstalled) q('drop trigger fixture_after_dispatch_writes on sandbox_commerce_v1.intents;drop schema receipt_dispatch_fixture cascade;');
  }
}
