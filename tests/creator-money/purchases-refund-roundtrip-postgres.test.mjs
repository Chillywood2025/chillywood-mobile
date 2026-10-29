import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import React from "react";
import { createDatabase } from "../helpers/database-runtime-authority-fixture.mjs";

const migration = "20261027034920_buyer_purchase_partial_refund_presentation.sql";
test("real refund projector to owner RPC, parser and mounted Purchases preserves cumulative refunds and wrapper authority", { timeout: 240_000 }, async t => {
  const { db } = await createDatabase({ includeHeldStudio: true, implicitApiGrants: false, excludeMigrations: [migration] });
  // Initialize PGlite in Node before the mounted React fixture installs its
  // minimal browser globals; those globals are solely a native UI test double.
  const { mount, wallet, textOf } = await import("./purchases-mounted-fixture.mjs");
  const id = n => `ba100000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const buyer = id(1), other = id(2), creator = id(3), session = id(4), otherSession = id(5), tip = id(6);
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const signature = "public.read_my_creator_purchases(integer,timestamptz,uuid,text,uuid)";
  const innerSignature = "public.read_my_creator_purchases_pre_event_remedies(integer,timestamptz,uuid,text,uuid)";
  const definition = async name => one("select oid, pg_get_functiondef(oid) definition, proacl::text acl from pg_proc where oid=$1::regprocedure", [name]);
  const seed = async fn => {
    await db.exec("set session_replication_role=replica");
    try { await fn(); } finally { await db.exec("set session_replication_role=origin"); }
  };
  const read = async (user = buyer, sid = session) => {
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: "authenticated", sub: user, session_id: sid })]);
    await db.exec("set role authenticated");
    try { return (await one("select public.read_my_creator_purchases() result")).result; }
    finally { await db.exec("reset role"); }
  };
  let eventNumber = 100;
  const project = async (type, changes = {}) => {
    const event = `evt_purchase_refund_${eventNumber}`, attempt = id(eventNumber++);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: "service_role" })]);
    await db.exec("set role service_role");
    try {
      await one("select public.reserve_stripe_tip_webhook_event($1,$2,repeat('d',64),$3)", [event, type, attempt]);
      return (await one("select public.process_stripe_tip_webhook_lifecycle($1,$2,$3,$4,'{\"metadata\":{}}','{}') result", [event, attempt, tip, {
        event_livemode: false, object_livemode: false, object_type: "charge", object_id: "ch_purchase_refund",
        payment_intent_id: "pi_purchase_refund", amount_cents: 500, amount_refunded_cents: 125, refunded: false,
        currency: "usd", metadata_tip_id: tip, metadata_sender_id: buyer, metadata_creator_id: creator, ...changes,
      }])).result;
    } finally { await db.exec("reset role"); }
  };
  try {
    const outerBefore = await definition(signature), innerBefore = await definition(innerSignature);
    await seed(async () => {
      for (const user of [buyer, other, creator]) await db.query("insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,$2,now(),false,false)", [user, `${user}@refund.example.test`]);
      await db.query("insert into auth.sessions(id,user_id) values($1,$2),($3,$4)", [session, buyer, otherSession, other]);
      for (const [user, sid] of [[buyer, session], [other, otherSession]]) await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
        select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation'
        from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account'`, [user, sid]);
      await db.query(`insert into public.creator_tip_transactions(id,sender_id,creator_id,buyer_account_id,buyer_session_generation,tip_amount_cents,total_paid_cents,currency,provider,payment_status,status,provider_environment,provider_payment_intent_id,provider_checkout_session_id,paid_at,refunded_at,refunded_amount_cents,metadata)
        values($1,$2,$3,$2,$4,500,500,'usd','stripe_connect','succeeded','paid','test','pi_purchase_refund','cs_test_purchase_refund',now(),now(),125,'{}')`, [tip, buyer, creator, session]);
    });
    assert.equal((await read()).items[0].status, "refunded", "pre-repair timestamp projection reproduces the partial-as-full bug");
    await db.exec(fs.readFileSync(`supabase/migrations/${migration}`, "utf8"));
    assert.deepEqual(await definition(signature), outerBefore, "outer event-remedy wrapper OID, definition and ACL stay byte-identical");
    const innerAfter = await definition(innerSignature);
    assert.equal(innerAfter.oid, innerBefore.oid); assert.equal(innerAfter.acl, innerBefore.acl);
    assert.notEqual(innerAfter.definition, innerBefore.definition);
    let generation = "one";
    let pendingRead = Promise.resolve();
    const reader = (user = buyer, sid = session) => {
      pendingRead = (async () => {
        const response = await read(user, sid), parsed = wallet.parseCreatorPurchasePage(response, user);
        assert.ok(parsed, "real RPC payload passes the production parser");
        return { ...parsed, status: "resolved", subjectSessionGeneration: generation };
      })();
      return pendingRead;
    };
    const settleRead = () => React.act(async () => { await pendingRead; });
    const h = await mount(t, { userId: buyer, reader: () => reader() });
    await settleRead();
    const refresh = async () => { await h.press("purchases-refresh"); await settleRead(); };
    const assertReceipt = (state, amount, label) => {
      assert.ok(h.text().includes(label));
      assert.match(h.text(), /Purchase price:\s+\$5\.00/);
      assert.ok(textOf(h.node(`purchase-refund-${tip}`)).includes(`${state} · $${(amount / 100).toFixed(2)} of $5.00`));
    };
    assertReceipt("Partial", 125, "Partially refunded");
    assert.equal((await read()).items[0].status, "completed");
    assert.equal((await read()).items[0].receipt.reportedAmountMinor, 500);
    await project("charge.refunded", { amount_refunded_cents: 250 });
    await refresh(); assertReceipt("Partial", 250, "Partially refunded");
    await project("charge.refunded", { amount_refunded_cents: 100 });
    await refresh(); assertReceipt("Partial", 250, "Partially refunded");
    assert.equal((await read()).items[0].refund.amountMinor, 250, "stale provider refund cannot lower the projected cumulative amount");
    await project("charge.refunded", { amount_refunded_cents: 500, refunded: true });
    await refresh(); assertReceipt("Full", 500, "Fully refunded");
    await project("charge.refunded", { amount_refunded_cents: 125 });
    await refresh(); assertReceipt("Full", 500, "Fully refunded");
    await project("charge.dispute.created", { object_type: "dispute", object_id: "dp_purchase_refund" });
    await refresh(); assertReceipt("Full", 500, "Disputed");
    assert.doesNotMatch(h.text(), /Fully refunded/); assert.equal(h.node(`purchase-open-${tip}`), undefined);
    const disputed = (await read()).items[0];
    assert.equal(disputed.status, "disputed"); assert.equal(disputed.amountMinor, 500); assert.equal(disputed.grantsAccess, false);
    const rejected = await project("charge.refunded", { amount_refunded_cents: 600, refunded: true });
    assert.equal(rejected.updated, false); assert.equal((await read()).items[0].refund.amountMinor, 500);
    assert.equal((await read(other, otherSession)).items.length, 0);
    await assert.rejects(read(buyer, otherSession), /buyer_purchase_history_authority_required/);
    generation = "two"; await h.account(() => reader(other, otherSession), "two", other);
    await settleRead();
    assert.ok(h.node("purchases-empty")); assert.equal(h.node(`purchase-${tip}`), undefined);
    await seed(async () => { await db.query("update public.creator_tip_transactions set status='refunded',disputed_at=null,refunded_amount_cents=125 where id=$1", [tip]); });
    const inconsistent = (await read()).items[0];
    assert.equal(inconsistent.status, "reconciliation_required"); assert.equal(inconsistent.refund, null);
    assert.ok(wallet.parseCreatorPurchasePage(await read(), buyer));
    await seed(async () => { await db.query("update public.creator_tip_transactions set status='paid',payment_status='refunded' where id=$1", [tip]); });
    assert.equal((await read()).items[0].refund, null, "a full-refund payment state cannot authenticate a partial amount");
    assert.equal((await read()).items[0].status, "reconciliation_required");
    await seed(async () => { await db.query("update public.creator_tip_transactions set status='disputed',disputed_at=now() where id=$1", [tip]); });
    assert.equal((await read()).items[0].status, "disputed", "inconsistent refund details cannot erase dispute precedence");
    assert.equal((await read()).items[0].refund, null);
    for (const role of ["anon", "authenticated", "service_role"]) assert.equal((await one("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, innerSignature])).allowed, false);
    await seed(async () => { await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [session]); });
    await assert.rejects(read(), /buyer_purchase_history_authority_required/);
  } finally { await db.close(); }
});
