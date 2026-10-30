import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import {createDatabase, splitSQL} from './helpers/database-runtime-authority-fixture.mjs';

const root = new URL('../', import.meta.url);
const migrationName = '20261021152932_explicit_service_api_grants.sql';
const migration = fs.readFileSync(new URL(`supabase/migrations/${migrationName}`, root), 'utf8');
const requirements = JSON.parse(fs.readFileSync(new URL('tests/fixtures/explicit-api-service-grants.json', root), 'utf8'));
// Audited literal/constant table calls plus the closed finance/usage/DMCA read
// wrappers. This inventory tests existing call requirements, not every unused
// privilege Supabase's old defaults happened to supply.
const clientRequirements = JSON.parse(fs.readFileSync(new URL('tests/fixtures/explicit-api-client-operations.json', root), 'utf8'));
const clean = sql => sql.replace(/--[^\n]*/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '').trim();
const quote = value => `"${value.replaceAll('"', '""')}"`;
const qualified = value => value.split('.').map(quote).join('.');
const roles = ['anon', 'authenticated', 'service_role'];
const dml = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
const permissions = [...dml, 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];

function consumerOperations(file, table, selector) {
  const source = ts.createSourceFile(file, fs.readFileSync(new URL(file, root), 'utf8'), ts.ScriptTarget.Latest, true);
  const operations = new Set();
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'from' && node.arguments.length > 0
      && ((ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === table)
        || (selector && node.arguments[0].getText(source) === selector))) {
      if (selector) {
        // Reviewed closed audit-source list, not a caller-supplied table name.
        assert.equal(selector, 'source.table');
        let enumerated = false;
        const find = child => {
          if (ts.isPropertyAssignment(child) && child.name.getText(source) === 'table'
            && ts.isStringLiteral(child.initializer) && child.initializer.text === table) enumerated = true;
          ts.forEachChild(child, find);
        };
        find(source);
        assert.ok(enumerated, `${table}: dynamic audit source remains explicitly enumerated`);
      }
      let parent = node.parent;
      while (parent && (ts.isCallExpression(parent) || ts.isPropertyAccessExpression(parent))) {
        if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)) {
          operations.add(parent.expression.name.text);
        }
        parent = parent.parent;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return operations;
}

test('historical grants stay exact and current service consumers remain source-backed', () => {
  assert.equal(new Set(requirements.map(row => row.table)).size, requirements.length);
  const expected = requirements.map(({table, privileges}) =>
    `grant ${privileges.map(p => p.toLowerCase()).join(', ')} on table public.${table} to service_role;`);
  assert.deepEqual(splitSQL(migration).map(clean).filter(Boolean), ['begin;', ...expected, 'commit;']);
  // This immutable grant predates moving Connect eligibility into the account
  // transaction. Record the one retired caller explicitly; do not retain a dead
  // Edge mutator or rewrite a historical migration to satisfy this inventory.
  assert.deepEqual(requirements.filter(row => row.retiredConsumers).map(row => ({
    table: row.table, consumers: row.consumers, retiredConsumers: row.retiredConsumers, retiredBy: row.retiredBy,
  })), [{table: 'creator_payout_eligibility_records', consumers: [],
    retiredConsumers: [{file: 'supabase/functions/_shared/stripe-connect.ts', operations: ['upsert']}],
    retiredBy: '20261027034858_creator_connect_observed_configuration.sql'}]);
  for (const {table, privileges, consumers, retiredConsumers, retiredBy} of requirements) {
    if (retiredConsumers) {
      assert.deepEqual(privileges, ['INSERT', 'SELECT', 'UPDATE'], 'historical privileges are unchanged');
      for (const consumer of retiredConsumers) {
        const actual = consumerOperations(consumer.file, table);
        assert.deepEqual([...actual], [], 'the retired Edge table caller is absent');
      }
      const successor = fs.readFileSync(new URL(`supabase/migrations/${retiredBy}`, root), 'utf8');
      assert.match(successor, /create or replace function private\.project_creator_connect_observed_eligibility\(\)/iu);
      assert.match(successor, /insert into public\.creator_payout_eligibility_records/iu);
      assert.match(successor, /execute function private\.project_creator_connect_observed_eligibility\(\)/iu);
      assert.match(successor, /revoke all on function private\.project_creator_connect_observed_eligibility\(\) from public,\s*anon,\s*authenticated,\s*service_role/iu);
      assert.equal(splitSQL(successor).map(clean).some(sql => /^grant\s/iu.test(sql)), false, 'projection adds no API grants');
      continue;
    }
    const justified = new Set();
    for (const consumer of consumers) {
      const actual = consumerOperations(consumer.file, table, consumer.selector);
      for (const op of consumer.operations) {
        assert.ok(actual.has(op), `${consumer.file}: ${table}.${op} is still a real call`);
        // PostgREST upserts need INSERT/UPDATE and filtered UPDATE/DELETE need
        // SELECT for the predicate. Chained SELECT requests returning rows.
        const needed = op === 'upsert' ? ['INSERT', 'UPDATE', 'SELECT']
          : op === 'update' || op === 'delete' ? [op.toUpperCase(), 'SELECT'] : [op.toUpperCase()];
        for (const privilege of needed) justified.add(privilege);
      }
      if (actual.has('select')) justified.add('SELECT');
    }
    assert.deepEqual([...justified].sort(), privileges, `${table}: no unnecessary DML grant`);
  }
});

const aclSnapshot = async db => (await db.query(`
  select n.nspname || '.' || c.relname as relation, r.rolname as role,
    p.privilege, has_table_privilege(r.oid,c.oid,p.privilege) as allowed,
    c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join pg_roles r cross join unnest($1::text[]) p(privilege)
  where n.nspname in ('public','private') and c.relkind in ('r','p','v','m')
    and r.rolname=any($2::text[]) order by 1,2,3`, [permissions, roles])).rows;
const key = row => `${row.relation}:${row.role}:${row.privilege}`;

async function asRole(db, role, sql) {
  await db.exec(`set role ${role}`);
  try { return await db.exec(sql); } finally { await db.exec('reset role'); }
}

async function operationSql(db, table, privilege) {
  const name = qualified(`public.${table}`);
  if (privilege === 'SELECT') return `select * from ${name} limit 0`;
  if (privilege === 'INSERT') return `explain insert into ${name} default values`;
  if (privilege === 'DELETE') return `explain delete from ${name} where false`;
  const {rows} = await db.query(`select attname from pg_attribute where attrelid=$1::regclass
    and attnum>0 and not attisdropped and attgenerated='' and attidentity='' order by attnum limit 1`, [`public.${table}`]);
  assert.equal(rows.length, 1, `${table}: writable column available`);
  const column = quote(rows[0].attname);
  return `explain update ${name} set ${column}=${column} where false`;
}

// New public tables must be deliberately classified, not automatically granted.
// Private tables remain inaccessible to all three API roles, including service.
const recentPublic = {
  // Exact-session creator/buyer RPCs own SKU reads and reservations; even
  // service transport has no direct table privilege on this inventory.
  'public.merch_product_variants': {},
  'public.creator_channel_subscription_price_requests': {authenticated: ['SELECT'], service_role: ['SELECT']},
  'public.creator_channel_subscription_catalog_bindings': {service_role: ['SELECT']},
  'public.creator_channel_subscription_group_owners': {},
  'public.ios_native_call_state_issuances': {},
  'public.ios_native_call_state_connections': {},
  'public.notification_activity_events': {service_role: dml},
  'public.notification_activity_pushes': {service_role: dml},
  'public.notification_activity_worker_config': {service_role: dml},
  'public.notification_video_view_sessions': {service_role: dml},
  'public.notification_qualified_views': {service_role: dml},
  'public.platform_brand_publications': {service_role: ['SELECT']},
  'public.platform_brand_publication_metadata': {authenticated: ['SELECT'], service_role: ['SELECT']},
  'public.creator_event_offer_revisions': {authenticated: ['SELECT']},
  'public.event_ticket_reservations': {authenticated: ['SELECT']},
  'public.creator_money_provider_purchase_times': {},
  'public.creator_money_purchase_quotes': {authenticated: ['SELECT'], service_role: ['SELECT']},
  'public.creator_event_purchase_remedies': {authenticated: ['SELECT']},
};

function recentTables() {
  const names = new Set();
  for (const file of fs.readdirSync(new URL('supabase/migrations/', root)).filter(name => name >= '20261001' && name.endsWith('.sql'))) {
    const statements = splitSQL(fs.readFileSync(new URL(`supabase/migrations/${file}`, root), 'utf8')).map(clean);
    const explicitAclTargets = statements.flatMap(sql => {
      const acl = sql.match(/^(?:grant|revoke)\s+[^;]+?\s+on\s+(?:table\s+)?([^;]+?)\s+(?:to|from)\s/iu);
      return acl ? acl[1].replaceAll('"', '').split(',').map(name => name.trim()) : [];
    });
    for (const sql of statements) {
      const match = clean(sql).match(/^create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:"(?:[^"]|"")+"|[a-z_][\w$]*)(?:\.(?:"(?:[^"]|"")+"|[a-z_][\w$]*))?)\s/iu);
      if (match) {
        const name = match[1].replaceAll('"', '');
        const relation = name.includes('.') ? name : `public.${name}`;
        if (/^(public|private)\./u.test(relation)) {
          // Private retention migrations intentionally apply their revokes in
          // a named-table DO loop. The full replay below checks the resulting
          // denial instead of pretending this lexical check interprets PL/pgSQL.
          if (relation.startsWith('public.')) assert.ok(explicitAclTargets.includes(relation),
            `${file}: ${relation} must declare grant/revoke intent alongside creation`);
          names.add(relation);
        }
      }
    }
  }
  return [...names].sort();
}

test('full fresh-schema replay works without implicit table/sequence grants', {timeout: 120000}, async t => {
  const {db, replayReport} = await createDatabase({applyRepair: true, includeHeldStudio: true,
    implicitApiGrants: false, excludeMigrations: [migrationName]});
  try {
    const sourceFiles = fs.readdirSync(new URL('supabase/migrations/', root)).filter(name => name.endsWith('.sql'));
    assert.equal(replayReport.files.length + 2, sourceFiles.length, 'all migrations plus separately applied runtime repair, excluding only new grant repair');
    assert.deepEqual(replayReport.excludedMigrations, [migrationName]);
    t.diagnostic(`${replayReport.files.length + 1} historical migrations replayed; managed cron/net doubles and two empty-data recovery skips, not Supabase integration proof`);
    const before = await aclSnapshot(db);
    const requiredKeys = new Set();
    const queries = [];
    for (const {table, privileges} of requirements) {
      for (const privilege of privileges) {
        const id = `public.${table}:service_role:${privilege}`;
        requiredKeys.add(id);
        assert.equal(before.find(row => key(row) === id)?.allowed, false, `${id}: reproduces missing explicit grant`);
        const sql = await operationSql(db, table, privilege);
        await assert.rejects(asRole(db, 'service_role', sql), error => error.code === '42501', `${id}: before control is denied`);
        queries.push(sql);
      }
    }
    await db.exec('begin');
    // Execute the actual migration in a savepoint-free outer transaction to
    // prove rollback as well. Its transaction wrapper is the only omitted SQL.
    const body = splitSQL(migration).map(clean).filter(sql => sql && sql !== 'begin;' && sql !== 'commit;').join('\n');
    await db.exec(body);
    await db.exec('rollback');
    assert.deepEqual(await aclSnapshot(db), before, 'grant migration rolls back without ACL/RLS drift');
    await db.exec(migration);
    const after = await aclSnapshot(db);
    assert.deepEqual(after, before.map(row => requiredKeys.has(key(row)) ? {...row, allowed: true} : row),
      'only the exact service-role DML cells change; all consumer/private/DDL/RLS permissions stay unchanged');
    for (const sql of queries) await asRole(db, 'service_role', sql);
    await db.exec(migration);
    assert.deepEqual(await aclSnapshot(db), after, 'reapplying named grants is idempotent');

    const inserts = requirements.filter(row => row.privileges.includes('INSERT')).map(row => row.table);
    assert.equal((await db.query(`select count(*)::integer as count from pg_attribute a join pg_class c on c.oid=a.attrelid
      join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[])
      and a.attnum>0 and not a.attisdropped and pg_get_serial_sequence(format('%I.%I',n.nspname,c.relname),a.attname) is not null`, [inserts])).rows[0].count,
    0, 'insert consumers use no serial/identity sequence, so no sequence grant is justified');

    for (const relation of recentTables()) {
      const intended = relation.startsWith('private.') ? {} : recentPublic[relation];
      assert.ok(intended, `${relation}: classify new public table before exposing it`);
      const rows = after.filter(row => row.relation === relation);
      assert.equal(rows.length, roles.length * permissions.length, `${relation}: real table in replay`);
      for (const row of rows) {
        assert.equal(row.rls, true, `${relation}: RLS enabled`);
        const forceRls = !['private.party_room_discovery_publications', 'private.party_room_discovery_host_joins'].includes(relation);
        assert.equal(row.force_rls, forceRls, `${relation}: existing FORCE RLS posture preserved`);
        if (dml.includes(row.privilege)) assert.equal(row.allowed, (intended[row.role] ?? []).includes(row.privilege), key(row));
      }
      for (const role of roles.filter(role => !(intended[role] ?? []).includes('SELECT'))) {
        await assert.rejects(asRole(db, role, `select * from ${qualified(relation)} limit 0`),
          error => error.code === '42501', `${relation}: ${role} cannot directly read`);
      }
    }

    for (const relation of [
      'private.creator_external_payment_capabilities',
      'private.creator_external_payment_eligibility',
      'private.creator_event_auction_product_bindings',
    ]) {
      const column = (await db.query(`select attname from pg_attribute
        where attrelid=$1::regclass and attnum>0 and not attisdropped order by attnum limit 1`, [relation])).rows[0].attname;
      for (const role of roles) for (const sql of [
        `insert into ${qualified(relation)} default values`,
        `update ${qualified(relation)} set ${quote(column)}=${quote(column)} where false`,
        `delete from ${qualified(relation)} where false`,
      ]) {
        // Use an actual column: a missing-column error is not ACL proof.
        await assert.rejects(asRole(db, role, sql), error => error.code === '42501',
          `${relation}: direct ${role} mutation is denied`);
      }
    }

    // These two workflow columns are the complete service UPDATE authority.
    // Table-wide UPDATE remains denied by the matrix above; every other column
    // and every consumer role is explicitly checked below, not inferred from it.
    for (const [table, writable] of [
      ['creator_channel_subscription_price_requests', 'status'],
      ['creator_channel_subscription_catalog_bindings', 'available_for_new_purchases'],
    ]) {
      const relation = `public.${table}`;
      const columns = (await db.query(`select attname from pg_attribute
        where attrelid=$1::regclass and attnum>0 and not attisdropped order by attnum`, [relation])).rows;
      for (const role of roles) for (const {attname} of columns) {
        const permitted = role === 'service_role' && attname === writable;
        assert.equal((await db.query("select has_column_privilege($1,$2,$3,'UPDATE') allowed",
          [role, relation, attname])).rows[0].allowed, permitted, `${relation}.${attname}: exact ${role} UPDATE`);
        const sql = `update ${qualified(relation)} set ${quote(attname)}=${quote(attname)} where false`;
        if (permitted) await asRole(db, role, sql);
        else await assert.rejects(asRole(db, role, sql), error => error.code === '42501',
          `${relation}.${attname}: unauthorized ${role} write is denied`);
      }
    }

    await db.exec(`create table public.explicit_api_grants_future_probe(id bigint generated always as identity primary key);
      alter table public.explicit_api_grants_future_probe enable row level security;`);
    for (const role of roles) {
      await assert.rejects(asRole(db, role, 'select * from public.explicit_api_grants_future_probe limit 0'),
        error => error.code === '42501', `future ungranted table stays inaccessible to ${role}`);
      assert.equal((await db.query(`select has_sequence_privilege($1,'public.explicit_api_grants_future_probe_id_seq','USAGE') as allowed`, [role])).rows[0].allowed,
        false, `future sequence is not implicitly granted to ${role}`);
    }
    t.diagnostic(`${requiredKeys.size} actual denied-before/allowed-after table operations across ${requirements.length} tables; ${recentTables().length} new-table/private boundaries`);
  } finally { await db.close(); }
});

test('existing legacy-default database gains no capabilities from the additive repair', {timeout: 120000}, async () => {
  const {db} = await createDatabase({applyRepair: true, includeHeldStudio: true,
    implicitApiGrants: true, excludeMigrations: [migrationName]});
  try {
    const before = await aclSnapshot(db);
    await db.exec(migration);
    assert.deepEqual(await aclSnapshot(db), before, 'existing object grants and RLS remain exactly unchanged');
  } finally { await db.close(); }
});

test('authenticated client operations and anonymous readable surfaces do not rely on removed defaults', {timeout: 120000}, async t => {
  const snapshots = [];
  for (const implicitApiGrants of [true, false]) {
    const {db} = await createDatabase({applyRepair: true, includeHeldStudio: true, implicitApiGrants});
    try {
      const tables = clientRequirements.map(row => row.table);
      const requested = clientRequirements.flatMap(({table, privileges}) => privileges.map(privilege => `${table}:${privilege}`));
      const authenticated = (await db.query(`select c.relname as relation,p.privilege,
        has_table_privilege('authenticated',c.oid,p.privilege) as table_allowed,
        (select array_agg(a.attname order by a.attname) from pg_attribute a
          where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and case
            when p.privilege in ('INSERT','UPDATE','SELECT') then has_column_privilege('authenticated',c.oid,a.attnum,p.privilege)
            else false end) as allowed_columns
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        cross join unnest($2::text[]) p(privilege) where n.nspname='public' and c.relname=any($1::text[])
          and c.relname || ':' || p.privilege=any($3::text[]) order by 1,2`, [tables, dml, requested])).rows;
      assert.equal(authenticated.length, requested.length, 'every client table/operation exists in the fresh catalog');
      snapshots.push(authenticated);
      if (!implicitApiGrants) {
        // Loss of an unused anon GRANT is not loss of a public surface. Require
        // RLS and no anon/PUBLIC/inherited-role SELECT policy for every denied
        // relation; do not repair these by exposing signed-in or staff data.
        const anonymous = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname=any($1::text[]) and not has_table_privilege('anon',c.oid,'SELECT')
            and (not c.relrowsecurity or exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polcmd in ('r','*')
              and exists(select 1 from unnest(p.polroles) role_id where case when role_id=0 then true
                else pg_has_role('anon',role_id,'MEMBER') end)))`, [tables])).rows;
        assert.deepEqual(anonymous, [], 'no intended anonymous readable table loses access');
      }
    } finally { await db.close(); }
  }
  assert.deepEqual(snapshots[1], snapshots[0], 'all requested authenticated table/column ACLs survive the new defaults');
  // Several direct writes intentionally have only column grants. Table-wide
  // false is not a reason to grant UPDATE/INSERT over protected columns.
  assert.deepEqual(snapshots[1].filter(row => !row.table_allowed).map(row => `${row.relation}:${row.privilege}`), [
    'chat_thread_members:UPDATE', 'communication_room_memberships:UPDATE', 'communication_rooms:UPDATE',
    'safety_reports:INSERT', 'watch_party_room_memberships:UPDATE',
  ]);
  t.diagnostic(`${clientRequirements.length} client tables: requested authenticated table/column ACL parity; no anonymous RLS-readable surface lost`);
});
