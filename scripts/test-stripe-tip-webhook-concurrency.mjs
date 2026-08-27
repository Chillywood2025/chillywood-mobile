#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const projectId = readFileSync("supabase/config.toml", "utf8")
  .match(/^project_id\s*=\s*"([^"]+)"/mu)?.[1];
assert.ok(projectId, "supabase/config.toml must declare project_id");
const container = process.env.SUPABASE_DB_CONTAINER ||
  `supabase_db_${projectId}`;
const psql = [
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-q",
  "-A",
  "-t",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  "postgres",
  "-d",
  "postgres",
];
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const admin = (sql, capture = false) =>
  spawnSync("docker", psql, {
    cwd: root,
    encoding: "utf8",
    input: sql,
    stdio: ["pipe", capture ? "pipe" : "ignore", "pipe"],
  });
const read = (sql) => {
  const result = admin(sql, true);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const session = (applicationName, sql) => {
  const child = spawn("docker", psql, {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise((resolve) =>
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  );
  child.stdin.end(
    `set application_name=${literal(applicationName)};\n${sql}\n`,
  );
  return { child, done };
};
const waitUntil = async (predicate, label) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error(`bounded local barrier timeout: ${label}`);
};
const stopChild = async (child, done) => {
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    if (child.exitCode !== null) return;
    child.kill(signal);
    await Promise.race([done, delay(1_000)]);
  }
  assert.notEqual(child.exitCode, null, "bounded local child cleanup failed");
};
const barrier = async (key) => {
  const holder = spawn("docker", psql, {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let error = "";
  holder.stdout.setEncoding("utf8");
  holder.stderr.setEncoding("utf8");
  holder.stdout.on("data", (chunk) => {
    output += chunk;
  });
  holder.stderr.on("data", (chunk) => {
    error += chunk;
  });
  const done = new Promise((resolve) => holder.on("close", resolve));
  holder.stdin.write(
    `select pg_advisory_lock(${key}); select 'BARRIER_READY';\n`,
  );
  try {
    await waitUntil(
      () => output.includes("BARRIER_READY"),
      `barrier ${key} acquisition`,
    );
  } catch (cause) {
    holder.stdin.destroy();
    try {
      await stopChild(holder, done);
    } catch {
      // Preserve the acquisition failure.
    }
    throw cause;
  }
  return {
    release: async () => {
      holder.stdin.end(`select pg_advisory_unlock(${key});\n\\q\n`);
      const code = await Promise.race([
        done,
        delay(2_000).then(() => null),
      ]);
      if (code === null) {
        try {
          await stopChild(holder, done);
        } catch {
          // Report the bounded cleanup timeout below.
        }
        throw new Error(`bounded local barrier cleanup timeout: ${key}`);
      }
      assert.equal(code, 0, error);
    },
  };
};
const waitForLock = (applicationName, waitEvent = null) =>
  waitUntil(() => {
    const eventFilter = waitEvent ? `and wait_event=${literal(waitEvent)}` : "";
    return Number(read(`
      select count(*)
      from pg_catalog.pg_stat_activity
      where application_name=${literal(applicationName)}
        and wait_event_type='Lock'
        ${eventFilter};
    `)) === 1;
  }, `${applicationName} lock wait`);
const reserveSql = (eventId, eventType, hash, attemptId) => `
  select public.reserve_stripe_tip_webhook_event(
    ${literal(eventId)},${literal(eventType)},${literal(hash)},${
  literal(attemptId)
}::uuid
  );`;
const finalizeSql = (eventId, attemptId, status) => `
  select public.finalize_stripe_tip_webhook_event(
    ${literal(eventId)},${literal(attemptId)}::uuid,${literal(status)}
  );`;
const projectSql = ({
  eventId,
  attemptId,
  tipId,
  objectId,
  paymentIntentId,
  amount,
  amountRefunded = null,
  refunded = null,
  senderId,
  creatorId,
}) => `
  select public.process_stripe_tip_webhook_lifecycle(
    ${literal(eventId)},${literal(attemptId)}::uuid,${literal(tipId)}::uuid,
    jsonb_build_object(
      'object_id',${literal(objectId)},
      'payment_intent_id',${literal(paymentIntentId)},
      'amount_cents',${amount},
      ${
  amountRefunded === null
    ? ""
    : `'amount_refunded_cents',${amountRefunded},'refunded',${refunded === true},`
}
      'currency','usd',
      'metadata_tip_id',${literal(tipId)},
      'metadata_sender_id',${literal(senderId)},
      'metadata_creator_id',${literal(creatorId)}
    ),
    jsonb_build_object('metadata','{}'::jsonb),
    '{}'::jsonb
  );`;
const cleanupSessions = async (contenders) => {
  for (const [applicationName, contender] of contenders) {
    if (!contender || contender.child.exitCode !== null) continue;
    admin(`
      select pg_catalog.pg_terminate_backend(pid)
      from pg_catalog.pg_stat_activity
      where application_name=${literal(applicationName)}
        and pid<>pg_catalog.pg_backend_pid();
    `);
    try {
      await stopChild(contender.child, contender.done);
    } catch {
      // The primary assertion reports the race failure.
    }
  }
};

const started = spawnSync(
  "docker",
  ["inspect", "-f", "{{.State.Running}}", container],
  { encoding: "utf8" },
);
assert.equal(
  started.status,
  0,
  `local Supabase database container unavailable: ${container}`,
);
assert.equal(
  started.stdout.trim(),
  "true",
  `local Supabase database is not running: ${container}`,
);

const suffix = crypto.randomUUID();
const tipId = crypto.randomUUID();
const senderId = crypto.randomUUID();
const creatorId = crypto.randomUUID();
const paymentIntentId = `pi_concurrency_${suffix}`;
const checkoutSessionId = `cs_concurrency_${suffix}`;
const refundEventId = `evt_tip_refund_${suffix}`;
const completionEventId = `evt_tip_completion_${suffix}`;
const staleEventId = `evt_tip_stale_${suffix}`;
const authorityTipId = crypto.randomUUID();
const authorityUserId = crypto.randomUUID();
const authorityCreatorId = crypto.randomUUID();
const authoritySessionId = crypto.randomUUID();
const authorityPaymentIntentId = `pi_authority_${suffix}`;
const authorityCheckoutSessionId = `cs_authority_${suffix}`;
const authorityEventId = `evt_tip_authority_${suffix}`;
const refundAttempt = crypto.randomUUID();
const completionAttempt = crypto.randomUUID();
const staleAttempt = crypto.randomUUID();
const reclaimedAttempt = crypto.randomUUID();
const authorityAttempt = crypto.randomUUID();
const eventIds = [
  refundEventId,
  completionEventId,
  staleEventId,
  authorityEventId,
];

const seed = admin(`
  begin;
  set local session_replication_role=replica;
  insert into auth.users(id) values (${literal(authorityUserId)}::uuid);
  insert into auth.sessions(id,user_id,not_after) values (
    ${literal(authoritySessionId)}::uuid,
    ${literal(authorityUserId)}::uuid,
    timezone('utc'::text,now())+interval '1 day'
  );
  insert into public.user_profiles(user_id,username,channel_role) values (
    ${literal(authorityUserId)},
    ${literal(`stripe_${suffix.replaceAll("-", "").slice(0, 12)}`)},
    'member'
  ) on conflict(user_id) do update set channel_role=excluded.channel_role;
  insert into public.wave1_legal_acceptances(
    user_id,subject_hash,document_key,document_version,market,role_key,
    capability,session_generation,authority_source
  )
  select
    ${literal(authorityUserId)}::uuid,
    pg_catalog.encode(extensions.digest(${
  literal(authorityUserId)
},'sha256'),'hex'),
    document.document_key,document.version,document.market,'member',
    document.capability,${literal(authoritySessionId)},'service_reconciliation'
  from public.wave1_legal_document_versions document
  where document.active
    and document.market='UNITED_STATES'
    and document.capability='account';
  insert into public.creator_tip_transactions(
    id,sender_id,creator_id,tip_amount_cents,service_fee_cents,
    provider_fee_cents,total_paid_cents,currency,provider,payment_status,
    payout_status,status,provider_environment,provider_checkout_session_id,
    provider_payment_intent_id,creator_net_cents,metadata,buyer_account_id,
    buyer_session_generation
  ) values (
    ${literal(tipId)}::uuid,${literal(senderId)}::uuid,${
  literal(creatorId)
}::uuid,
    1200,0,0,1200,'usd','stripe_connect','succeeded','not_payable','paid',
    'test',${literal(checkoutSessionId)},${literal(paymentIntentId)},1200,
    '{"compensation_required":false}'::jsonb,null,null
  ),(
    ${literal(authorityTipId)}::uuid,
    ${literal(authorityUserId)}::uuid,
    ${literal(authorityCreatorId)}::uuid,
    1300,0,0,1300,'usd','stripe_connect','failed','not_payable','failed',
    'test',${literal(authorityCheckoutSessionId)},
    ${literal(authorityPaymentIntentId)},0,
    '{"compensation_required":false}'::jsonb,
    ${literal(authorityUserId)}::uuid,${literal(authoritySessionId)}::uuid
  );
  commit;
`);
assert.equal(seed.status, 0, seed.stderr);

try {
  for (
    const [eventId, eventType, attemptId, hash] of [
      [refundEventId, "charge.refunded", refundAttempt, "a".repeat(64)],
      [
        completionEventId,
        "checkout.session.completed",
        completionAttempt,
        "b".repeat(64),
      ],
    ]
  ) {
    const claim = admin(reserveSql(eventId, eventType, hash, attemptId));
    assert.equal(claim.status, 0, claim.stderr);
  }

  {
    const barrierKey = 9_270_001;
    const firstApp = `stripe-tip-refund-${suffix}`.slice(0, 60);
    const secondApp = `stripe-tip-completion-${suffix}`.slice(0, 60);
    let gate;
    let first;
    let second;
    try {
      gate = await barrier(barrierKey);
      first = session(
        firstApp,
        `
        begin;
        set local statement_timeout='10s';
        ${
          projectSql({
            eventId: refundEventId,
            attemptId: refundAttempt,
            tipId,
            objectId: `ch_concurrency_${suffix.replaceAll("-", "")}`,
            paymentIntentId,
            amount: 1200,
            amountRefunded: 1200,
            refunded: true,
            senderId,
            creatorId,
          })
        }
        select pg_advisory_xact_lock(${barrierKey});
        commit;
      `,
      );
      await waitForLock(firstApp, "advisory");

      second = session(
        secondApp,
        `
        begin;
        set local statement_timeout='10s';
        ${
          projectSql({
            eventId: completionEventId,
            attemptId: completionAttempt,
            tipId,
            objectId: checkoutSessionId,
            paymentIntentId,
            amount: 1200,
            senderId,
            creatorId,
          })
        }
        commit;
      `,
      );
      await waitForLock(secondApp);
      await gate.release();
      gate = null;

      const [firstResult, secondResult] = await Promise.all([
        first.done,
        second.done,
      ]);
      assert.equal(firstResult.code, 0, firstResult.stderr);
      assert.equal(secondResult.code, 0, secondResult.stderr);
    } finally {
      if (gate) await gate.release();
      await cleanupSessions([
        [firstApp, first],
        [secondApp, second],
      ]);
    }

    const outcome = JSON.parse(read(`
      select jsonb_build_object(
        'tipStatus',tip.status,
        'paymentStatus',tip.payment_status,
        'payoutStatus',tip.payout_status,
        'creatorNet',tip.creator_net_cents,
        'refundedAmount',tip.refunded_amount_cents,
        'refundClaim',(select status from public.monetization_webhook_events where provider='stripe_tip' and event_id=${
      literal(refundEventId)
    }),
        'completionClaim',(select status from public.monetization_webhook_events where provider='stripe_tip' and event_id=${
      literal(completionEventId)
    }),
        'completionApplied',(select (metadata->>'lifecycle_transition_applied')::boolean from public.creator_tip_events where provider_event_id=${
      literal(completionEventId)
    } and event_type='checkout_completed')
      )::text
      from public.creator_tip_transactions tip
      where tip.id=${literal(tipId)}::uuid;
    `));
    assert.deepEqual(outcome, {
      tipStatus: "refunded",
      paymentStatus: "refunded",
      payoutStatus: "reversed",
      creatorNet: 0,
      refundedAmount: 1200,
      refundClaim: "processed",
      completionClaim: "processed",
      completionApplied: false,
    });
  }

  {
    const initialClaim = admin(
      reserveSql(
        staleEventId,
        "checkout.session.expired",
        "c".repeat(64),
        staleAttempt,
      ),
    );
    assert.equal(initialClaim.status, 0, initialClaim.stderr);
    const ageClaim = admin(`
      update public.monetization_webhook_events
      set processing_started_at=timezone('utc'::text,now())-interval '10 minutes'
      where provider='stripe_tip' and event_id=${literal(staleEventId)};
    `);
    assert.equal(ageClaim.status, 0, ageClaim.stderr);

    const barrierKey = 9_270_002;
    const reclaimApp = `stripe-tip-reclaim-${suffix}`.slice(0, 60);
    const staleApp = `stripe-tip-stale-${suffix}`.slice(0, 60);
    let gate;
    let reclaimer;
    let stale;
    try {
      gate = await barrier(barrierKey);
      reclaimer = session(
        reclaimApp,
        `
        begin;
        set local statement_timeout='10s';
        ${
          reserveSql(
            staleEventId,
            "checkout.session.expired",
            "c".repeat(64),
            reclaimedAttempt,
          )
        }
        select pg_advisory_xact_lock(${barrierKey});
        commit;
      `,
      );
      await waitForLock(reclaimApp, "advisory");

      stale = session(
        staleApp,
        `
        begin;
        set local statement_timeout='10s';
        ${
          projectSql({
            eventId: staleEventId,
            attemptId: staleAttempt,
            tipId,
            objectId: checkoutSessionId,
            paymentIntentId,
            amount: 1200,
            senderId,
            creatorId,
          })
        }
        commit;
      `,
      );
      await waitForLock(staleApp, "advisory");
      await gate.release();
      gate = null;

      const [reclaimResult, staleResult] = await Promise.all([
        reclaimer.done,
        stale.done,
      ]);
      assert.equal(reclaimResult.code, 0, reclaimResult.stderr);
      assert.notEqual(
        staleResult.code,
        0,
        "stale projector unexpectedly succeeded",
      );
      assert.match(staleResult.stderr, /stripe_tip_webhook_claim_not_current/u);
    } finally {
      if (gate) await gate.release();
      await cleanupSessions([
        [reclaimApp, reclaimer],
        [staleApp, stale],
      ]);
    }

    const staleFinalize = admin(
      finalizeSql(staleEventId, staleAttempt, "processed"),
      true,
    );
    assert.notEqual(
      staleFinalize.status,
      0,
      "stale finalizer unexpectedly succeeded",
    );
    assert.match(staleFinalize.stderr, /stripe_tip_webhook_claim_not_current/u);
    const currentFinalize = admin(
      finalizeSql(staleEventId, reclaimedAttempt, "ignored"),
    );
    assert.equal(currentFinalize.status, 0, currentFinalize.stderr);
    const finalClaim = JSON.parse(read(`
      select jsonb_build_object(
        'status',status,
        'attemptCleared',processing_attempt_id is null,
        'startedCleared',processing_started_at is null,
        'attemptCount',processing_attempt_count
      )::text
      from public.monetization_webhook_events
      where provider='stripe_tip' and event_id=${literal(staleEventId)};
    `));
    assert.deepEqual(finalClaim, {
      status: "ignored",
      attemptCleared: true,
      startedCleared: true,
      attemptCount: 2,
    });
  }

  {
    assert.equal(
      read(`select public.creator_tip_buyer_session_authority_internal(
        ${literal(authorityUserId)}::uuid,
        ${literal(authoritySessionId)}::uuid
      );`),
      "t",
      "authority race fixture must begin with exact current buyer authority",
    );
    const claim = admin(
      reserveSql(
        authorityEventId,
        "checkout.session.completed",
        "d".repeat(64),
        authorityAttempt,
      ),
    );
    assert.equal(claim.status, 0, claim.stderr);

    const barrierKey = 9_270_003;
    const completionApp = `stripe-tip-authority-${suffix}`.slice(0, 60);
    const restrictionApp = `stripe-tip-restriction-${suffix}`.slice(0, 60);
    let gate;
    let completion;
    let restriction;
    try {
      gate = await barrier(barrierKey);
      completion = session(
        completionApp,
        `
          begin;
          set local statement_timeout='10s';
          ${
          projectSql({
            eventId: authorityEventId,
            attemptId: authorityAttempt,
            tipId: authorityTipId,
            objectId: authorityCheckoutSessionId,
            paymentIntentId: authorityPaymentIntentId,
            amount: 1300,
            senderId: authorityUserId,
            creatorId: authorityCreatorId,
          })
        }
          select pg_advisory_xact_lock(${barrierKey});
          commit;
        `,
      );
      await waitForLock(completionApp, "advisory");

      restriction = session(
        restrictionApp,
        `
          begin;
          set local statement_timeout='10s';
          update auth.users
          set banned_until=timezone('utc'::text,now())+interval '1 day'
          where id=${literal(authorityUserId)}::uuid;
          commit;
        `,
      );
      await waitForLock(restrictionApp, "advisory");
      await gate.release();
      gate = null;

      const [completionResult, restrictionResult] = await Promise.all([
        completion.done,
        restriction.done,
      ]);
      assert.equal(completionResult.code, 0, completionResult.stderr);
      assert.equal(restrictionResult.code, 0, restrictionResult.stderr);
    } finally {
      if (gate) await gate.release();
      await cleanupSessions([
        [completionApp, completion],
        [restrictionApp, restriction],
      ]);
    }

    const outcome = JSON.parse(read(`
      select jsonb_build_object(
        'tipStatus',tip.status,
        'creatorNet',tip.creator_net_cents,
        'buyerAuthority',(tip.metadata->>'buyer_authority_valid_at_completion')::boolean,
        'claimStatus',(select status from public.monetization_webhook_events where provider='stripe_tip' and event_id=${
      literal(authorityEventId)
    }),
        'restrictionCommitted',(select banned_until>timezone('utc'::text,now()) from auth.users where id=${
      literal(authorityUserId)
    }::uuid)
      )::text
      from public.creator_tip_transactions tip
      where tip.id=${literal(authorityTipId)}::uuid;
    `));
    assert.deepEqual(outcome, {
      tipStatus: "paid",
      creatorNet: 1300,
      buyerAuthority: true,
      claimStatus: "processed",
      restrictionCommitted: true,
    });
  }

  process.stdout.write(
    "Stripe tip webhook concurrency, stale-attempt fencing, and authority serialization: 3/3 passed\n",
  );
} finally {
  const cleanup = admin(`
    begin;
    set local session_replication_role=replica;
    delete from public.creator_tip_events
    where tip_transaction_id=${literal(tipId)}::uuid
      or provider_event_id=any(array[${eventIds.map(literal).join(",")}]);
    delete from public.monetization_webhook_events
    where provider='stripe_tip'
      and event_id=any(array[${eventIds.map(literal).join(",")}]);
    delete from public.creator_tip_transactions
    where id=any(array[
      ${literal(tipId)}::uuid,${literal(authorityTipId)}::uuid
    ]);
    delete from public.wave1_legal_acceptances
    where user_id=${literal(authorityUserId)}::uuid;
    delete from public.user_profiles where user_id=${literal(authorityUserId)};
    delete from auth.sessions where user_id=${literal(authorityUserId)}::uuid;
    delete from auth.users where id=${literal(authorityUserId)}::uuid;
    commit;
  `);
  assert.equal(cleanup.status, 0, cleanup.stderr);
}
