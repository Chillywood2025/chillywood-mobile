import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = fs.readFileSync(new URL("../supabase/migrations/20261010180514_ios_native_call_state_observer.sql", import.meta.url), "utf8");
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = id(1), CALLER = id(2), SESSION = id(3), TOKEN = id(4), INVITE = id(5), THREAD = id(6), ATTEMPT = id(7), OBSERVER = id(8), GENERATION = id(9);
const HASH = "a".repeat(64);

test("actual observer SQL confines short-lived read authority to immutable issued ownership", async t => {
  const db = new PGlite();
  try {
    // Only pre-existing catalog dependencies are modeled here. All issuance,
    // authorization, lease, status, RLS and grant behavior executes new SQL.
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      create function auth.jwt() returns jsonb language sql stable as
        $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create table public.restricted_accounts(id text primary key);
      create function public.is_account_access_restricted(p_user text) returns boolean language sql stable as
        $$select exists(select 1 from public.restricted_accounts where id=p_user)$$;
      create table public.user_voip_push_tokens(id uuid primary key,user_id uuid,account_id uuid,
        session_generation uuid,install_id text,token_hash text,revocation_credential_hash text,
        enabled boolean,ownership_state text,revoked_at timestamptz);
      create table public.chat_call_invites(id uuid primary key,thread_id uuid,caller_user_id text,
        callee_user_id text,call_type text,status text,expires_at timestamptz);
      create table public.chat_thread_members(thread_id uuid,user_id text);
      create table public.voip_push_delivery_attempts(id uuid primary key,voip_push_token_id uuid,
        call_invite_id uuid,recipient_user_id uuid,attempt_count integer,status text);`);
    await db.exec(migration);
    await db.query("insert into auth.users values($1),($2)", [U, CALLER]);
    await db.query("insert into auth.sessions values($1,$2,null)", [SESSION, U]);
    await db.query(`insert into user_voip_push_tokens values($1,$2,$2,$3,'observer-install',
      repeat('b',64),repeat('c',64),true,'ACCOUNT_BOUND',null)`, [TOKEN, U, SESSION]);
    await db.query("insert into chat_call_invites values($1,$2,$3,$4,'voice','ringing',clock_timestamp()+interval '90 seconds')", [INVITE, THREAD, CALLER, U]);
    await db.query("insert into chat_thread_members values($1,$2),($1,$3)", [THREAD, U, CALLER]);
    await db.query("insert into voip_push_delivery_attempts values($1,$2,$3,$4,1,'attempted')", [ATTEMPT, TOKEN, INVITE, U]);
    const issue = async (observer = OBSERVER, count = 1, hash = HASH) => (await db.query(
      "select whole_app_issue_ios_call_state_observer($1,$2,$3,$4) as value", [observer, ATTEMPT, count, hash])).rows[0].value;
    const claim = async (connection = id(10), generation = GENERATION, hash = HASH) => (await db.query(
      "select whole_app_claim_ios_call_state_observer($1,$2,$3,$4) as value", [OBSERVER, hash, connection, generation])).rows[0].value;
    const read = async (connection = id(10), generation = GENERATION, hash = HASH) => (await db.query(
      "select whole_app_read_ios_call_state_observer($1,$2,$3,$4) as value", [OBSERVER, hash, connection, generation])).rows[0].value;
    const isolated = async (name, fn) => t.test(name, async () => {
      await db.exec("begin"); try { await fn(); } finally { await db.exec("rollback"); }
    });
    await isolated("anonymous and authenticated callers cannot execute or read either table", async () => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        await db.exec("savepoint denied_access");
        await db.exec(`set local role ${role}`);
        await assert.rejects(db.query("select * from ios_native_call_state_issuances"), { code: "42501" });
        await db.exec("rollback to savepoint denied_access; release savepoint denied_access");
        await db.exec("savepoint denied_access");
        await db.exec(`set local role ${role}`);
        await assert.rejects(db.query("select * from ios_native_call_state_connections"), { code: "42501" });
        await db.exec("rollback to savepoint denied_access; release savepoint denied_access");
      }
    });
    await isolated("grants deny client RPCs/direct service-table mutation and hide internal predicate", async () => {
      for (const role of ["anon", "authenticated"]) {
        const rows = (await db.query(`select has_function_privilege($1,
          'whole_app_issue_ios_call_state_observer(uuid,uuid,integer,text)','execute') as issue,
          has_function_privilege($1,'whole_app_claim_ios_call_state_observer(uuid,text,uuid,uuid)','execute') as claim,
          has_function_privilege($1,'whole_app_read_ios_call_state_observer(uuid,text,uuid,uuid)','execute') as read`, [role])).rows;
        assert.deepEqual(rows[0], { issue: false, claim: false, read: false });
      }
      assert.equal((await db.query("select has_table_privilege('service_role','ios_native_call_state_issuances','update') as v")).rows[0].v, false);
      assert.equal((await db.query("select has_function_privilege('service_role','whole_app_current_ios_call_state_observer(uuid,text)','execute') as v")).rows[0].v, false);
      const rows = (await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid in ('ios_native_call_state_issuances'::regclass,'ios_native_call_state_connections'::regclass)")).rows;
      assert.deepEqual(rows, Array(2).fill({ relrowsecurity: true, relforcerowsecurity: true }));
    });
    assert.equal((await issue()).observerId, OBSERVER);
    await isolated("only one immutable issuance exists per exact provider attempt generation", async () => {
      assert.equal(await issue(), null);
      assert.equal(await issue(id(18)), null);
      await db.query("update voip_push_delivery_attempts set attempt_count=2 where id=$1", [ATTEMPT]);
      assert.equal((await issue(id(18), 2, "d".repeat(64))).observerId, id(18));
      assert.equal((await claim()).observerId, OBSERVER, "mutable attempt retry cannot overwrite old issued authority");
      assert.equal((await db.query("select capability_hash from ios_native_call_state_issuances where id=$1", [OBSERVER])).rows[0].capability_hash, HASH);
    });
    await isolated("exact read returns only this invite and bounded state; wrong secret/nonce/generation denied", async () => {
      assert.equal(await read(), null, "reading requires a claimed connection");
      const snapshot = await claim(); assert.equal(snapshot.inviteId, INVITE); assert.equal(snapshot.callUuid, INVITE);
      assert.equal(snapshot.recipientUserId, U); assert.equal(snapshot.recipientInstallId, "observer-install");
      assert.equal((await read()).status, "ringing");
      assert.equal(await read(id(11)), null); assert.equal(await read(id(10), id(99)), null);
      assert.equal(await read(id(10), GENERATION, "f".repeat(64)), null);
      assert.equal(await claim(id(11), id(99)), null);
      assert.equal(await claim(id(11), GENERATION, "f".repeat(64)), null);
    });
    await isolated("three connections maximum, old connection retired and deadlines never renewed", async () => {
      const initial = await claim(); assert.ok(initial);
      assert.equal(await claim(), null, "same connection cannot be replayed as another claim");
      assert.ok(await claim(id(11))); assert.equal(await read(id(10)), null);
      const last = await claim(id(12)); assert.equal(last.expiresAt, initial.expiresAt);
      assert.equal(await claim(id(13)), null); assert.equal((await read(id(12))).status, "ringing");
    });
    await isolated("elapsed original issuance deadline denies claim and reads", async () => {
      assert.ok(await claim());
      // Advance the stored fixture dates together without weakening the real
      // expiry predicate or creating a fresh ringing lease.
      await db.exec(`update ios_native_call_state_issuances
        set created_at=clock_timestamp()-interval '91 seconds',
          expires_at=clock_timestamp()-interval '1 second';
        update chat_call_invites set expires_at=(select expires_at from ios_native_call_state_issuances);`);
      assert.equal(await read(), null); assert.equal(await claim(id(11)), null);
    });
    for (const [name, query, params] of [
      ["revoked token", "update user_voip_push_tokens set enabled=false,revoked_at=now()", []],
      ["expired session", "update auth.sessions set not_after=now()-interval '1 second'", []],
      ["replaced session", "update user_voip_push_tokens set session_generation=$1", [id(99)]],
      ["replaced account", "update user_voip_push_tokens set account_id=$1", [CALLER]],
      ["replaced install", "update user_voip_push_tokens set install_id='replacement-install'", []],
      ["rotated native token", "update user_voip_push_tokens set token_hash=repeat('d',64)", []],
      ["rotated revocation credential", "update user_voip_push_tokens set revocation_credential_hash=repeat('d',64)", []],
      ["restricted account", "insert into restricted_accounts values($1)", [U]],
      ["removed callee membership", "delete from chat_thread_members where user_id=$1", [U]],
      ["removed caller membership", "delete from chat_thread_members where user_id=$1", [CALLER]],
      ["changed invite thread", "update chat_call_invites set thread_id=$1", [id(99)]],
      ["changed deadline", "update chat_call_invites set expires_at=expires_at+interval '1 second'", []],
    ]) await isolated(`${name} invalidates existing and new observer authority`, async () => {
      assert.ok(await claim()); await db.query(query, params);
      assert.equal(await read(), null); assert.equal(await claim(id(11)), null);
    });
    for (const status of ["canceled", "declined", "missed", "ended", "accepted"]) await isolated(`${status} is authoritative without any server call mutation`, async () => {
      assert.ok(await claim()); await db.query("update chat_call_invites set status=$1", [status]);
      assert.equal((await read()).status, status);
      assert.equal((await db.query("select status from chat_call_invites")).rows[0].status, status);
    });
    await isolated("deleted auth session removes capability and connection", async () => {
      assert.ok(await claim()); await db.query("delete from auth.sessions where id=$1", [SESSION]);
      assert.equal(await read(), null);
      assert.equal((await db.query("select count(*)::int as n from ios_native_call_state_connections")).rows[0].n, 0);
    });
  } finally { await db.close(); }
});
