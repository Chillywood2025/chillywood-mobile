import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createDatabase, repairMigrationPath } from './helpers/database-runtime-authority-fixture.mjs';

const actor = 'e6000000-0000-4000-8000-000000000001';
const ordinary = 'e6000000-0000-4000-8000-000000000002';
const otherStaff = 'e6000000-0000-4000-8000-000000000003';
const owner = 'e6000000-0000-4000-8000-000000000004';
const actorSession = 'e6100000-0000-4000-8000-000000000001';
const ordinarySession = 'e6100000-0000-4000-8000-000000000002';
const otherSession = 'e6100000-0000-4000-8000-000000000003';
const ownerSession = 'e6100000-0000-4000-8000-000000000004';
const missingSession = 'e6100000-0000-4000-8000-999999999999';
const actorEmail = 'permission-repair-moderator@example.test';

function claims(user = actor, session = actorSession, role = 'authenticated') {
  return { role, sub: user, session_id: session };
}

async function asRole(db, role, jwt, callback) {
  assert.ok(['authenticated', 'anon', 'service_role'].includes(role));
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(jwt)]);
  await db.exec(`set role ${role}`);
  try {
    return await callback();
  } finally {
    await db.exec('reset role');
  }
}

async function selfReadCounts(db) {
  const result = await db.query(`select
    (select count(*)::integer from public.platform_role_memberships
      where user_id in ($1,$2)) as roles,
    (select count(*)::integer from public.platform_staff_permission_grants
      where target_user_id in ($1,$2)) as permissions`, [actor, otherStaff]);
  return result.rows[0];
}

async function visibleAuthorityRows(db) {
  return {
    roles: (await db.query(`select user_id,role,status,expires_at
      from public.platform_role_memberships order by user_id,role`)).rows,
    permissions: (await db.query(`select target_user_id,permission_key,status,expires_at
      from public.platform_staff_permission_grants order by target_user_id,permission_key`)).rows,
  };
}

function expectedActorRows({ live = false, expiresAt = null } = {}) {
  return {
    roles: [
      { user_id: actor, role: 'moderator', status: 'active', expires_at: expiresAt },
      ...(live ? [{ user_id: actor, role: 'operator', status: 'revoked', expires_at: null }] : []),
    ],
    permissions: [
      ...(live ? [{ target_user_id: actor, permission_key: 'reports_review', status: 'revoked', expires_at: null }] : []),
      { target_user_id: actor, permission_key: 'user_lookup', status: 'active', expires_at: expiresAt },
    ],
  };
}

async function grantedRpcAcl(db) {
  return (await db.query(`select p.proname as name,p.proowner::regrole::text as owner,p.prosecdef as secdef,
      a.grantor::regrole::text as grantor,case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
      a.privilege_type as privilege,a.is_grantable as grantable
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid in ('public.has_active_beta_access()'::regprocedure,
      'public.resolve_sandbox_monetization_tester(text,text)'::regprocedure)
    order by p.proname,grantee,grantor,a.privilege_type`)).rows;
}

async function staffAuthority(db) {
  return (await db.query(`select public.has_platform_role(array['moderator']) as role,
    public.has_platform_permission('user_lookup') as permission`)).rows[0];
}

async function assertPermissionDenied(callback, message) {
  await assert.rejects(callback, (error) => error.code === '42501', message);
}

async function unchangedSecuritySurface(db) {
  const relations = (await db.query(`select n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private','cognitive_runtime','auth','storage','realtime')
      and c.relkind in ('r','p','v','m','S') order by n.nspname,c.relname`)).rows;
  const roles = (await db.query(`select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
      rolreplication,rolbypassrls from pg_roles order by rolname`)).rows;
  const memberships = (await db.query(`select parent.rolname as parent,member.rolname as member,
      m.admin_option from pg_auth_members m
    join pg_roles parent on parent.oid=m.roleid join pg_roles member on member.oid=m.member
    order by parent.rolname,member.rolname`)).rows;
  const functions = (await db.query(`select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
      p.proowner::regrole::text as owner,p.prosecdef,p.proacl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private','cognitive_runtime')
      and p.oid not in ('public.has_active_beta_access()'::regprocedure,
        'public.resolve_sandbox_monetization_tester(text,text)'::regprocedure)
    order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`)).rows;
  return { relations, roles, memberships, functions };
}

async function seed(db) {
  // These are synthetic subjects. All normal table guards remain enabled.
  await db.query(`insert into auth.users
      (id,email,email_confirmed_at,is_sso_user,is_anonymous)
    values ($1,$4,now(),false,false),
           ($2,'permission-repair-ordinary@example.test',now(),false,false),
           ($3,'permission-repair-other-staff@example.test',now(),false,false)`,
  [actor, ordinary, otherStaff, actorEmail]);
  await db.query(`insert into auth.sessions(id,user_id)
    values ($1,$4),($2,$5),($3,$6)`,
  [actorSession, ordinarySession, otherSession, actor, ordinary, otherStaff]);
  await db.query(`insert into public.platform_role_memberships
      (role,user_id,email,status,notes,granted_by)
    values ('moderator',$1,$3,'active','Permission repair active fixture','test'),
           ('operator',$1,$3,'revoked','Permission repair revoked fixture','test'),
           ('moderator',$2,'permission-repair-other-staff@example.test','active',
            'Permission repair other-subject fixture','test')`, [actor, otherStaff, actorEmail]);
  await db.query(`insert into public.platform_staff_permission_grants
      (target_user_id,target_email,permission_key,status,reason,granted_by)
    values ($1,$3,'user_lookup','active','Permission repair active fixture','test'),
           ($1,$3,'reports_review','revoked','Permission repair revoked fixture','test'),
           ($2,'permission-repair-other-staff@example.test','user_lookup','active',
            'Permission repair other-subject fixture','test')`, [actor, otherStaff, actorEmail]);
  await db.query(`insert into public.beta_access_memberships
      (email,user_id,access_status,cohort)
    values ($2,$1,'active','permission-repair')`, [actor, actorEmail]);
  assert.equal((await db.query("select public.wave1_legal_document_configuration_complete_internal('account') as ready")).rows[0].ready, true);
  await seedLegalAcceptances(db);
  await db.query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
    values($1,'permission-repair-owner@example.test',now(),false,false)`, [owner]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [ownerSession, owner]);
  await db.query(`insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
    values('owner',$1,'permission-repair-owner@example.test','active','Permission repair Owner fixture','test')`, [owner]);
  await seedLegalAcceptances(db, owner, ownerSession);
}

async function seedLegalAcceptances(db, subject = actor, session = actorSession) {
  await db.query(`insert into public.wave1_legal_acceptances
      (user_id,subject_hash,document_key,document_version,market,role_key,
       capability,session_generation,authority_source)
    select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,
      'member',capability,$2,'service_reconciliation'
    from public.wave1_legal_document_versions
    where active and market='UNITED_STATES' and capability='account'`, [subject, session]);
}

async function rpcReadbacks(db, target = null, email = null) {
  return (await db.query(`select public.has_active_beta_access() as beta,
    public.resolve_sandbox_monetization_tester($1,$2) as tester`, [target, email])).rows[0];
}

async function withNaturallyExpiredRows(db, callback) {
  // Every statement commits in this isolated fixture. Install a future expiry
  // through the real write guards, then read in a fresh transaction after the
  // database clock passes it. No trigger disabling or replication bypass.
  const cutoff = (await db.query("select now()+interval '1 second' as cutoff")).rows[0].cutoff;
  await db.query(`update public.platform_role_memberships set expires_at=$2
    where user_id=$1 and role='moderator' and status='active'`, [actor, cutoff]);
  await db.query(`update public.platform_staff_permission_grants set expires_at=$2
    where target_user_id=$1 and permission_key='user_lookup' and status='active'`, [actor, cutoff]);
  try {
    while (!(await db.query('select clock_timestamp()>$1::timestamptz as elapsed', [cutoff])).rows[0].elapsed) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await callback(cutoff);
  } finally {
    await db.query(`update public.platform_role_memberships set expires_at=null
      where user_id=$1 and role='moderator' and status='active'`, [actor]);
    await db.query(`update public.platform_staff_permission_grants set expires_at=null
      where target_user_id=$1 and permission_key='user_lookup' and status='active'`, [actor]);
  }
}

async function capturedPolicyCases(db, policyName) {
  // Supplemental predicate cases complement actual RLS reads after a naturally
  // elapsed expiry. No trigger or replication bypass is used in either path.
  const { rows } = await db.query(`select pg_get_expr(p.polqual,p.polrelid) as predicate
    from pg_policy p join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and p.polname=$1`, [policyName]);
  assert.equal(rows.length, 1);
  const predicate = rows[0].predicate;
  const result = await db.query(`select scenario from (
    values ('active',$1::text,$1::text,'active',null::timestamptz),
           ('revoked',$1::text,$1::text,'revoked',null::timestamptz),
           ('expired',$1::text,$1::text,'active',now()-interval '1 second'),
           ('other',$2::text,$2::text,'active',null::timestamptz)
    ) fixture(scenario,user_id,target_user_id,status,expires_at)
    where (${predicate}) order by scenario`, [actor, otherStaff]);
  return result.rows.map((row) => row.scenario);
}

for (const includeHeldStudio of [false, true]) {
test(`forward permission repair preserves exact callers (held Studio ${includeHeldStudio ? 'present' : 'absent'})`, async (t) => {
  const fixture = await createDatabase({ overlayLiveDrift: true, applyRepair: false, includeHeldStudio });
  const db = fixture.db ?? fixture;
  try {
    await seed(db);

    await t.test('captured live policies and ACLs fail the repaired boundary', async () => {
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => visibleAuthorityRows(db)),
        expectedActorRows({ live: true }), 'live control exposes these exact active and revoked own rows only');
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => selfReadCounts(db)),
        { roles: 2, permissions: 2 }, 'live control exposes the revoked own rows');
      assert.deepEqual(await asRole(db, 'authenticated', claims(actor, missingSession), () => selfReadCounts(db)),
        { roles: 2, permissions: 2 }, 'live control ignores the missing exact session');
      for (const name of ['platform_role_memberships_select_own', 'platform_staff_permission_grants_select_owner_or_self']) {
        assert.deepEqual(await asRole(db, 'authenticated', claims(), () => capturedPolicyCases(db, name)),
          ['active', 'expired', 'revoked']);
      }
      await withNaturallyExpiredRows(db, async (cutoff) => {
        assert.deepEqual(await asRole(db, 'authenticated', claims(), () => selfReadCounts(db)),
          { roles: 2, permissions: 2 }, 'live policies expose genuinely expired active rows');
        assert.deepEqual(await asRole(db, 'authenticated', claims(), () => visibleAuthorityRows(db)),
          expectedActorRows({ live: true, expiresAt: cutoff }), 'live control exposes the exact naturally expired rows');
      });
      await asRole(db, 'service_role', { role: 'service_role' }, async () => {
        await assertPermissionDenied(() => db.query('select public.has_active_beta_access()'));
        await assertPermissionDenied(() => db.query('select public.resolve_sandbox_monetization_tester(null,null)'));
      });
      await db.query('update public.wave1_legal_acceptances set invalidated_at=now() where user_id=$1', [actor]);
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => rpcReadbacks(db)),
        { beta: false, tester: false }, 'repair must retain the deployed legal guard');
      await db.query('update public.wave1_legal_acceptances set invalidated_at=null where user_id=$1', [actor]);
    });

    const repairSql = fs.readFileSync(repairMigrationPath, 'utf8');
    assert.ok(repairSql.trim(), 'a nonempty repair migration is required');
    const beforeRepairSecurity = await unchangedSecuritySurface(db);
    const beforeRpcAcl = await grantedRpcAcl(db);
    assert.ok(beforeRpcAcl.every(row => ['postgres', 'authenticated'].includes(row.grantee)),
      'captured RPC ACLs contain only owner and authenticated grants');
    await db.exec(repairSql);
    assert.deepEqual(await unchangedSecuritySurface(db), beforeRepairSecurity,
      'repair preserves table/sequence ACLs, RLS flags, roles, memberships and every unrelated function ACL/owner');
    const expectedRpcAcl = beforeRpcAcl.concat(['has_active_beta_access', 'resolve_sandbox_monetization_tester'].map(name => {
      const original = beforeRpcAcl.find(row => row.name === name);
      return { name, owner: original.owner, secdef: original.secdef, grantor: original.owner,
        grantee: 'service_role', privilege: 'EXECUTE', grantable: false };
    })).sort((a, b) => `${a.name}|${a.grantee}|${a.grantor}`.localeCompare(`${b.name}|${b.grantee}|${b.grantor}`));
    assert.deepEqual(await grantedRpcAcl(db), expectedRpcAcl,
      'the exact RPC ACL delta is only two nongrantable service EXECUTE entries');

    await t.test('actual RLS reads permit only active own rows from the exact live session', async () => {
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => visibleAuthorityRows(db)),
        expectedActorRows(), 'only the exact active moderator and user_lookup rows are visible');
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => selfReadCounts(db)),
        { roles: 1, permissions: 1 });
      assert.deepEqual(await asRole(db, 'authenticated', claims(ordinary, ordinarySession), () => selfReadCounts(db)),
        { roles: 0, permissions: 0 }, 'another subject cannot read staff rows');
      assert.deepEqual(await asRole(db, 'authenticated', claims(ordinary, ordinarySession), () => visibleAuthorityRows(db)),
        { roles: [], permissions: [] }, 'ordinary actor sees no unrelated authority rows anywhere');
      for (const jwt of [claims(actor, missingSession), claims(actor, otherSession), { role: 'authenticated', sub: actor }]) {
        assert.deepEqual(await asRole(db, 'authenticated', jwt, () => selfReadCounts(db)),
          { roles: 0, permissions: 0 }, 'missing or cross-user generation fails closed');
      }
      for (const name of ['platform_role_memberships_select_own', 'platform_staff_permission_grants_select_owner_or_self']) {
        assert.deepEqual(await asRole(db, 'authenticated', claims(), () => capturedPolicyCases(db, name)), ['active']);
      }
      await withNaturallyExpiredRows(db, async () => {
        assert.deepEqual(await asRole(db, 'authenticated', claims(), () => selfReadCounts(db)),
          { roles: 0, permissions: 0 }, 'repaired RLS rejects genuinely expired active rows');
        assert.deepEqual(await asRole(db, 'authenticated', claims(), () => visibleAuthorityRows(db)),
          { roles: [], permissions: [] });
        assert.deepEqual(await asRole(db, 'authenticated', claims(), () => staffAuthority(db)),
          { role: false, permission: false }, 'naturally expired membership and grant lose authority');
      });
    });

    await t.test('null, blank, malformed and cross-subject claims never confer current authority', async () => {
      const invalidClaims = [
        {}, { role: 'authenticated' }, { role: 'authenticated', sub: null, session_id: actorSession },
        claims(actor, null), claims(actor, ''), claims(actor, ' '), claims(actor, 'not-a-session-uuid'),
        claims(actor, missingSession), claims(actor, otherSession),
        claims('e6000000-0000-4000-8000-999999999999', actorSession),
      ];
      for (const role of ['authenticated', 'service_role']) {
        for (const invalid of invalidClaims) {
          const payload = { ...invalid, role };
          assert.deepEqual(await asRole(db, role, payload, () => rpcReadbacks(db, actor, actorEmail)),
            { beta: false, tester: false }, `${role} invalid claims cannot borrow explicit target authority`);
          assert.deepEqual(await asRole(db, role, payload, () => staffAuthority(db)), { role: false, permission: false });
          if (role === 'authenticated') {
            assert.deepEqual(await asRole(db, role, payload, () => visibleAuthorityRows(db)),
              { roles: [], permissions: [] }, 'invalid current subject/session returns no authority metadata');
          }
        }
      }
    });

    await t.test('service EXECUTE preserves live caller authority and rejects target impersonation', async () => {
      const acl = (await db.query(`select
        has_function_privilege('service_role','public.has_active_beta_access()','EXECUTE') as beta,
        has_function_privilege('service_role','public.resolve_sandbox_monetization_tester(text,text)','EXECUTE') as tester`)).rows[0];
      assert.deepEqual(acl, { beta: true, tester: true });
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => rpcReadbacks(db)), { beta: true, tester: true });
      assert.deepEqual(await asRole(db, 'service_role', claims(actor, actorSession, 'service_role'), () => rpcReadbacks(db)),
        { beta: true, tester: true }, 'trusted server can call for an exact active subject/session');
      for (const jwt of [{ role: 'service_role' }, claims(actor, missingSession, 'service_role'),
        claims(actor, otherSession, 'service_role'), claims(ordinary, ordinarySession, 'service_role')]) {
        assert.deepEqual(await asRole(db, 'service_role', jwt, () => rpcReadbacks(db, actor, actorEmail)),
          { beta: false, tester: false }, 'target arguments cannot confer another subject authority');
      }
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => rpcReadbacks(db, actor, actorEmail)),
        { beta: true, tester: true }, 'matching explicit target remains valid');
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => rpcReadbacks(db, ordinary, actorEmail)),
        { beta: true, tester: false }, 'a mismatched explicit target cannot reuse caller authority');
      assert.deepEqual(await asRole(db, 'service_role', claims(actor, actorSession, 'service_role'), () => rpcReadbacks(db, actor, 'other@example.test')),
        { beta: true, tester: false }, 'a mismatched explicit email cannot reuse caller authority');
    });

    await t.test('the existing Owner read branch remains exact-session and legal-bound', async () => {
      assert.deepEqual(await asRole(db, 'authenticated', claims(owner, ownerSession), () => selfReadCounts(db)),
        { roles: 3, permissions: 3 }, 'current Owner can still review other staff and revoked history');
      assert.deepEqual(await asRole(db, 'authenticated', claims(owner, missingSession), () => selfReadCounts(db)),
        { roles: 0, permissions: 0 }, 'a missing Owner session cannot use the privileged branch');
      await db.query('update public.wave1_legal_acceptances set invalidated_at=now() where user_id=$1', [owner]);
      assert.deepEqual(await asRole(db, 'authenticated', claims(owner, ownerSession), () => selfReadCounts(db)),
        { roles: 0, permissions: 0 }, 'Owner legal requirements remain effective through actual RLS');
      await db.query('update public.wave1_legal_acceptances set invalidated_at=null where user_id=$1', [owner]);
    });

    await t.test('current legal acceptance stays bound to this exact subject and session', async () => {
      const assertAuthority = async (allowed, description) => {
        for (const role of ['authenticated', 'service_role']) {
          const authority = await asRole(db, role, claims(actor, actorSession, role), async () =>
            (await db.query(`select public.has_platform_role(array['moderator']) as role,
              public.has_platform_permission('user_lookup') as permission,
              public.has_active_beta_access() as beta,
              public.resolve_sandbox_monetization_tester(null,null) as tester`)).rows[0]);
          assert.deepEqual(authority, { role: allowed, permission: allowed, beta: allowed, tester: allowed }, description);
        }
      };
      await assertAuthority(true, 'current same-session acceptance preserves legitimate authority');
      await db.query('delete from public.wave1_legal_acceptances where user_id=$1', [actor]);
      await assertAuthority(false, 'missing legal acceptance fails closed');
      await seedLegalAcceptances(db);
      await db.query(`update public.wave1_legal_acceptances set session_generation=$2
        where user_id=$1`, [actor, otherSession]);
      await assertAuthority(false, 'another session acceptance cannot be reused');
      await db.query(`update public.wave1_legal_acceptances set session_generation=$2
        where user_id=$1`, [actor, actorSession]);
      await db.exec(`insert into public.wave1_legal_document_versions
          (document_key,version,market,capability,active,effective_at)
        select document_key,'permission-repair-stale',market,capability,false,effective_at
        from public.wave1_legal_document_versions
        where active and market='UNITED_STATES' and capability='account'`);
      await db.query(`update public.wave1_legal_acceptances set document_version='permission-repair-stale'
        where user_id=$1`, [actor]);
      await assertAuthority(false, 'stale document versions fail closed');
      await db.query(`update public.wave1_legal_acceptances a set document_version=d.version
        from public.wave1_legal_document_versions d where a.user_id=$1
          and d.document_key=a.document_key and d.market=a.market and d.capability=a.capability and d.active`, [actor]);
      await db.query('update public.wave1_legal_acceptances set invalidated_at=now() where user_id=$1', [actor]);
      await assertAuthority(false, 'invalidated legal acceptance fails closed');
      await db.query('update public.wave1_legal_acceptances set invalidated_at=null where user_id=$1', [actor]);
      await assertAuthority(true, 'restored current acceptance reopens only the existing authority');
    });

    await t.test('revocation removes only the authority granted by that specific row', async () => {
      await db.query("update public.platform_staff_permission_grants set status='revoked' where target_user_id=$1 and permission_key='user_lookup'", [actor]);
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => staffAuthority(db)), { role: true, permission: false });
      const withoutPermission = expectedActorRows(); withoutPermission.permissions = [];
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => visibleAuthorityRows(db)), withoutPermission);
      await db.query("update public.platform_staff_permission_grants set status='active' where target_user_id=$1 and permission_key='user_lookup'", [actor]);
      await db.query("update public.platform_role_memberships set status='revoked' where user_id=$1 and role='moderator'", [actor]);
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => staffAuthority(db)), { role: false, permission: false });
      assert.deepEqual(await asRole(db, 'service_role', claims(actor, actorSession, 'service_role'), () => rpcReadbacks(db)),
        { beta: true, tester: true }, 'independent active beta membership remains valid after staff-role revocation');
      await db.query("update public.beta_access_memberships set access_status='revoked' where user_id=$1", [actor]);
      assert.deepEqual(await asRole(db, 'service_role', claims(actor, actorSession, 'service_role'), () => rpcReadbacks(db)),
        { beta: false, tester: false }, 'revoked beta and staff rows confer neither beta nor tester access');
      await db.query("update public.platform_role_memberships set status='active' where user_id=$1 and role='moderator'", [actor]);
      await db.query("update public.beta_access_memberships set access_status='active' where user_id=$1", [actor]);
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => staffAuthority(db)), { role: true, permission: true });
    });

    await t.test('sandbox-only authority expires naturally and cannot outlive revocation', async () => {
      await db.query("update public.beta_access_memberships set access_status='revoked' where user_id=$1", [actor]);
      await db.query(`insert into public.sandbox_monetization_testers(user_id,email,status,note,created_by)
        values($1,$2,'active','Permission repair tester fixture','test')`, [actor, actorEmail]);
      const read = () => asRole(db, 'service_role', claims(actor, actorSession, 'service_role'), () => rpcReadbacks(db, actor, actorEmail));
      assert.deepEqual(await read(), { beta: false, tester: true });
      await db.query("update public.sandbox_monetization_testers set status='revoked' where user_id=$1", [actor]);
      assert.deepEqual(await read(), { beta: false, tester: false });
      await db.query("update public.sandbox_monetization_testers set status='active',expires_at=now()+interval '1 second' where user_id=$1", [actor]);
      const cutoff = (await db.query('select expires_at from public.sandbox_monetization_testers where user_id=$1', [actor])).rows[0].expires_at;
      assert.deepEqual(await read(), { beta: false, tester: true });
      while (!(await db.query('select clock_timestamp()>$1::timestamptz as elapsed', [cutoff])).rows[0].elapsed) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.deepEqual(await read(), { beta: false, tester: false }, 'expired status-active tester row fails closed');
      await db.query('delete from public.sandbox_monetization_testers where user_id=$1', [actor]);
      await db.query("update public.beta_access_memberships set access_status='active' where user_id=$1", [actor]);
      assert.deepEqual(await read(), { beta: true, tester: true });
    });

    await t.test('expired, revoked, unconfirmed, deleted and restricted sessions/accounts fail closed', async () => {
      const assertClosed = async (description) => {
        assert.deepEqual(await asRole(db, 'authenticated', claims(), () => selfReadCounts(db)),
          { roles: 0, permissions: 0 }, description);
        assert.deepEqual(await asRole(db, 'service_role', claims(actor, actorSession, 'service_role'), () => rpcReadbacks(db)),
          { beta: false, tester: false }, description);
      };
      await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [actorSession]);
      await assertClosed('expired session');
      await db.query('update auth.sessions set not_after=null where id=$1', [actorSession]);
      for (const [column, deniedValue, restoredValue] of [
        ['email_confirmed_at', 'null', 'now()'],
        ['deleted_at', 'now()', 'null'],
        ['banned_until', "now()+interval '1 hour'", 'null'],
      ]) {
        await db.query(`update auth.users set ${column}=${deniedValue} where id=$1`, [actor]);
        await assertClosed(column);
        await db.query(`update auth.users set ${column}=${restoredValue} where id=$1`, [actor]);
      }
      await db.query(`insert into public.account_deletion_requests(user_id,status,reason,delete_after,restore_deadline)
        values($1,'scheduled','Permission repair restore-only fixture',now()+interval '30 days',now()+interval '30 days')`, [actor]);
      await assertClosed('scheduled deletion / restore-only account');
      await db.query("delete from public.account_deletion_requests where user_id=$1 and reason='Permission repair restore-only fixture'", [actor]);
      await db.query('delete from auth.sessions where id=$1', [actorSession]);
      await assertClosed('revoked/deleted session');
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [actorSession, actor]);
      assert.deepEqual(await asRole(db, 'authenticated', claims(), () => selfReadCounts(db)), { roles: 1, permissions: 1 });
    });

    await t.test('anonymous calls, direct role writes and obsolete Watch Party writes remain denied', async () => {
      await asRole(db, 'anon', { role: 'anon' }, async () => {
        await assertPermissionDenied(() => db.query('select * from public.platform_role_memberships'));
        await assertPermissionDenied(() => db.query('select public.has_active_beta_access()'));
        await assertPermissionDenied(() => db.query('select public.resolve_sandbox_monetization_tester(null,null)'));
      });
      await asRole(db, 'authenticated', claims(), async () => {
        await assertPermissionDenied(() => db.query("update public.platform_role_memberships set status='active' where false"));
        await assertPermissionDenied(() => db.query("update public.platform_staff_permission_grants set status='active' where false"));
        await assertPermissionDenied(() => db.query("update public.watch_party_room_memberships set membership_state='active' where false"));
        await assertPermissionDenied(() => db.query('insert into public.watch_party_room_memberships default values'));
      });
      const obsolete = await db.query(`select policyname from pg_policies
        where schemaname='public' and tablename='watch_party_room_memberships'
          and policyname in ('watch_party_room_memberships_self_insert_policy','watch_party_room_memberships_self_update_policy')`);
      assert.deepEqual(obsolete.rows, []);
      const predecessor = (await db.query(`select p.proconfig,
        has_function_privilege('anon',p.oid,'EXECUTE') as anon,
        has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,
        has_function_privilege('service_role',p.oid,'EXECUTE') as service
        from pg_proc p where p.oid='public.admin_grant_platform_role_by_email_pre_exact_subject_closure(text,text,text)'::regprocedure`)).rows[0];
      assert.deepEqual(predecessor, { proconfig: ['search_path=""'], anon: false, authenticated: false, service: false });
      assert.equal((await db.query(`select count(*)::integer as count from pg_class c
        join pg_namespace n on n.oid=c.relnamespace cross join (values('anon'),('authenticated')) r(role)
        where n.nspname='public' and c.relkind in('r','p')
          and has_table_privilege(r.role,c.oid,'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')`)).rows[0].count, 0);
    });
  } finally {
    await db.close();
  }
});
}
