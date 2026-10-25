// Test-only logical restore adapter. The production guard stays database-bound.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const migration = readFileSync(new URL('../../supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql', import.meta.url), 'utf8');
const marker = '-- BEGIN immutable normalized helper DDL safeguard';
const endMarker = '-- END immutable normalized helper DDL safeguard';
assert.equal(migration.split(marker).length, 2);
assert.equal(migration.split(endMarker).length, 2);
const installer = migration.split(marker)[1].split(endMarker)[0];
const templateBody = installer.match(/as \$guard_body\$([\s\S]*?)\$guard_body\$/u)?.[1];
assert.ok(templateBody);
const guard = 'guard_platform_brand_index_helper_ddl_v1';
const events = new Map([
  ['platform_brand_index_helper_ddl_v1', 'ddl_command_end'],
  ['platform_brand_index_helper_drop_v1', 'sql_drop'],
]);
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const identifier = value => `"${value.replaceAll('"', '""')}"`;
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const normalized = value => value.trim().replace(/\s+/gu, ' ');
const decodeLiteral = sql => {
  const escaped = sql.startsWith("E'");
  const value = sql.slice(escaped ? 2 : 1, -1).replaceAll("''", "'");
  if (!escaped) return value;
  // format('%L') doubles backslashes and quotes; accept only that canonical
  // escape form, not arbitrary SQL escape-string transformations.
  assert.ok(!value.replaceAll('\\\\', '').includes('\\'), 'noncanonical frozen JSON literal');
  return value.replaceAll('\\\\', '\\');
};
const assertTarget = database => {
  assert.match(database, /^(?:brand_dispatch_queue|brand_empty_queue|brand_remove|brand_global_[a-z_]+|archived_brand_[a-z_]+|inspection_queue|runtime_authority|retention_queue|external_retention|legacy_retention_queue|scan_byte_queue|brand_retention_queue|codex_studio|r2_qual|codex_premium|template_queue|copy_cutover)_\d+_[a-f0-9]{12}(?:_[a-z0-9_]+)?$/u,
    'Brand guard restore requires an owned generated clone name');
};

const helperCatalog = `select jsonb_agg((to_jsonb(p)-'proacl'-'oid'-'pronamespace')||jsonb_build_object('namespace_name',n.nspname,
  'acl',(select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
    order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
    from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a)) order by p.proname)
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where p.oid in ('private.platform_brand_index_jsonb_bytes_v1(jsonb)'::regprocedure,
    'private.platform_brand_index_normalize_v1(text)'::regprocedure)`;
const catalog = `jsonb_build_object('functions',(select jsonb_agg(to_jsonb(p) order by p.oid)
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='private' and p.proname in ('platform_brand_index_jsonb_bytes_v1','platform_brand_index_normalize_v1'))
    or (n.nspname='extensions' and p.proname='${guard}')),
  'events',(select jsonb_agg(to_jsonb(e) order by e.evtname) from pg_catalog.pg_event_trigger e
    where e.evtname in ('platform_brand_index_helper_ddl_v1','platform_brand_index_helper_drop_v1')))`;
export const brandGuardSourceFingerprintSql = `select jsonb_build_object(
  'helpers',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
    and p.proname in ('platform_brand_index_jsonb_bytes_v1','platform_brand_index_normalize_v1')),
  'guard',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='extensions' and p.proname='${guard}'),
  'events',(select count(*) from pg_event_trigger where evtname in ('platform_brand_index_helper_ddl_v1','platform_brand_index_helper_drop_v1')),
  'hash',md5((${catalog})::text))::text;`;

// pg_dump COPY text escapes embedded newlines. Every removed section must still
// contain exactly its expected SQL, so forged headers or appended SQL fail shut.
export function prepareBrandGuardCloneRestore(bytes, database) {
  assertTarget(database);
  const dump = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes;
  assert.equal(typeof dump, 'string');
  assert.ok(dump.startsWith('--\n-- PostgreSQL database dump\n'), 'expected plain pg_dump SQL');
  const footer = '\n--\n-- PostgreSQL database dump complete\n--\n';
  assert.equal(dump.split(footer).length, 2, 'exact pg_dump footer required');
  const footerStart = dump.indexOf(footer);
  const headers = [...dump.matchAll(/\n--\n-- Name: ([^\n]+); Type: ([^;\n]+); Schema: ([^;\n]+); Owner: ([^\n]+)\n--\n/gu)];
  const removed = [];
  let owner, expected;
  for (let index = 0; index < headers.length; index++) {
    const match = headers[index];
    const [, name, type, schema, sectionOwner] = match;
    const associated = name.includes(guard) || [...events.keys()].some(event => name.includes(event));
    if (!associated) continue;
    assert.match(sectionOwner, /^[a-z_][a-z0-9_]*$/u, 'unexpected guard owner');
    if (owner === undefined) owner = sectionOwner;
    assert.equal(sectionOwner, owner, 'guard function, ACL and events must retain one original owner');
    const start = match.index;
    const stop = headers[index + 1]?.index ?? footerStart;
    const sql = dump.slice(start + match[0].length, stop).trim();
    if (name === `${guard}()` && type === 'FUNCTION' && schema === 'extensions') {
      const bodyMatch = sql.match(/\bAS (\$[a-zA-Z_0-9]*\$)([\s\S]*?)\1;/u);
      assert.ok(bodyMatch, 'missing serialized guard body');
      const body = bodyMatch[2];
      const oidMatch = body.match(/protected_oids constant oid\[\]:=('(?:[^']|'')*')::oid\[\];/u);
      const expectedMatch = body.match(/expected constant jsonb:=(E?'(?:[^']|'')*')::jsonb;/u);
      assert.ok(oidMatch && expectedMatch, 'missing frozen guard identities');
      const canonical = body.replace(oidMatch[1], '%L').replace(expectedMatch[1], '%L');
      assert.equal(canonical, templateBody, 'serialized guard must be the exact current installer body');
      expected = JSON.parse(decodeLiteral(expectedMatch[1]));
      assert.equal(expected.length, 2);
      assert.deepEqual(expected.map(row => row.proname).sort(), ['platform_brand_index_jsonb_bytes_v1','platform_brand_index_normalize_v1']);
      assert.ok(expected.every(row => row.namespace_name === 'private'));
      assert.equal(oidMatch[1], literal(`{${expected.map(row => row.oid).join(',')}}`), 'frozen OIDs must match both captured rows');
      const outer = normalized(sql.slice(0, bodyMatch.index) + 'AS BODY;' + sql.slice(bodyMatch.index + bodyMatch[0].length));
      assert.equal(outer, `CREATE FUNCTION extensions.${guard}() RETURNS event_trigger LANGUAGE plpgsql SET search_path TO '' AS BODY; ALTER FUNCTION extensions.${guard}() OWNER TO ${owner};`, 'unexpected SQL in serialized guard section');
    } else if (name === `FUNCTION ${guard}()` && type === 'ACL' && schema === 'extensions') {
      assert.equal(normalized(sql), `REVOKE ALL ON FUNCTION extensions.${guard}() FROM PUBLIC;`, 'guard ACL must match the exact non-executable installer contract');
    } else if (events.has(name) && type === 'EVENT TRIGGER' && schema === '-') {
      const expectedSql = new RegExp(`^CREATE EVENT TRIGGER ${escape(name)} ON ${events.get(name)} EXECUTE (?:FUNCTION|PROCEDURE) extensions\\.${guard}\\(\\); ALTER EVENT TRIGGER ${escape(name)} OWNER TO ${escape(owner)};$`, 'u');
      assert.match(normalized(sql), expectedSql, 'unexpected event trigger SQL or enabled state');
    } else assert.fail(`unexpected Brand guard dump section: ${name} / ${type} / ${schema}`);
    removed.push({start, stop, key: `${type}:${name}`});
  }
  assert.deepEqual(removed.map(section => section.key).sort(), [
    `FUNCTION:${guard}()`, `ACL:FUNCTION ${guard}()`, ...[...events.keys()].map(name => `EVENT TRIGGER:${name}`),
  ].sort(), 'exactly one guard function, ACL and two event trigger sections are required');
  let restored = dump;
  for (const section of removed.toReversed()) restored = restored.slice(0, section.start) + restored.slice(section.stop);
  // Logical restore changes only object/namespace OIDs. All protected bodies,
  // flags, role identities and canonical ACLs must still match the source pin.
  const portableExpected = expected.map(({oid, pronamespace, ...row}) => row).sort((a,b) => a.proname.localeCompare(b.proname));
  const mutations = [
    `create or replace function private.platform_brand_index_normalize_v1(p_text text) returns text language plpgsql immutable security invoker called on null input parallel unsafe cost 100 set search_path='' as $$begin return 'changed';end$$`,
    'alter function private.platform_brand_index_normalize_v1(text) stable',
    'alter function private.platform_brand_index_normalize_v1(text) owner to authenticated',
    'revoke execute on function private.platform_brand_index_normalize_v1(text) from public',
    'drop function private.platform_brand_index_normalize_v1(text) cascade',
  ];
  const targetCheck = `do $clone_target$ begin if current_database()<>${literal(database)} then raise exception 'brand_guard_clone_target_mismatch'; end if; end $clone_target$;`;
  const suffix = `
${targetCheck}
do $clone_catalog$ begin
  if (${helperCatalog}) is distinct from ${literal(JSON.stringify(portableExpected))}::jsonb then
    raise exception 'brand_guard_clone_source_catalog_mismatch';
  end if;
end $clone_catalog$;
set role ${identifier(owner)};
${installer}
-- Supautils skips non-superuser-owned event triggers for platform superusers.
-- Verify under the captured owner used by the native protocol fixtures.
do $clone_guard_proof$
declare initial jsonb:=${catalog}; command text; mutation_number integer:=0;
  initial_namespace jsonb:=(select to_jsonb(n) from pg_namespace n where n.nspname='private');
begin
  if current_user<>${literal(owner)} then raise exception 'brand_guard_clone_proof_role_mismatch'; end if;
  if not pg_has_role(current_user,'authenticated','SET') then
    raise exception 'brand_guard_clone_proof_owner_membership_missing';
  end if;
  if not exists(select 1 from pg_proc p where p.oid='extensions.${guard}()'::regprocedure
    and p.proowner=${literal(owner)}::regrole and not p.prosecdef and not p.proleakproof
    and p.provolatile='v' and p.proparallel='u' and p.proconfig=array['search_path=""']
    and (select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)
      =jsonb_build_array(jsonb_build_array(p.proowner,p.proowner,'EXECUTE',false))
    and not has_function_privilege('anon',p.oid,'EXECUTE')
    and not has_function_privilege('authenticated',p.oid,'EXECUTE')
    and not has_function_privilege('service_role',p.oid,'EXECUTE')) then
    raise exception 'brand_guard_clone_owner_acl_mismatch';
  end if;
  if (select count(*) from pg_event_trigger where evtfoid='extensions.${guard}()'::regprocedure
    and ((evtname='platform_brand_index_helper_ddl_v1' and evtevent='ddl_command_end')
      or (evtname='platform_brand_index_helper_drop_v1' and evtevent='sql_drop')) and evtenabled='O'
    and evtowner=(select proowner from pg_proc where oid='extensions.${guard}()'::regprocedure))<>2 then
    raise exception 'brand_guard_clone_event_binding_mismatch';
  end if;
  foreach command in array array[${mutations.map(literal).join(',')}] loop
    mutation_number:=mutation_number+1;
    begin
      -- ALTER OWNER checks the recipient's schema privilege before firing the
      -- guard. This clone-only grant rolls back with the rejected mutation.
      if mutation_number=3 then grant create on schema private to authenticated; end if;
      execute command;
      raise exception 'brand_guard_clone_mutation_allowed (case %, role %)',mutation_number,current_user;
    exception when sqlstate '55000' then if sqlerrm<>'brand_index_helper_immutable' then raise; end if; end;
    if ${catalog} is distinct from initial then raise exception 'brand_guard_clone_mutation_not_atomic'; end if;
    if (select to_jsonb(n) from pg_namespace n where n.nspname='private') is distinct from initial_namespace then
      raise exception 'brand_guard_clone_namespace_not_atomic';
    end if;
  end loop;
  create temporary table brand_guard_clone_unrelated_ddl(id integer);
  drop table brand_guard_clone_unrelated_ddl;
end $clone_guard_proof$;
reset role;
`;
  return Buffer.from(`${targetCheck}\n${restored}\n${suffix}`, 'utf8');
}

export function createBrandGuardCloneRestorer({container, run = spawnSync}) {
  assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
  let original;
  const fingerprint = () => {
    const result = run('docker', ['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'], {
      input: `set default_transaction_read_only=on;set statement_timeout='15s';${brandGuardSourceFingerprintSql}`,
      encoding: 'utf8', maxBuffer: 1024*1024, timeout: 30_000,
    });
    assert.equal(result.status, 0, 'read-only original Brand guard fingerprint failed');
    const value = JSON.parse(result.stdout.trim());
    assert.deepEqual([value.helpers,value.guard,value.events], [2,1,2], 'complete original Brand guard required');
    assert.match(value.hash, /^[a-f0-9]{32}$/u);
    return value;
  };
  return {
    prepare(bytes, database) {
      const sql = prepareBrandGuardCloneRestore(bytes, database);
      original ??= fingerprint();
      return sql;
    },
    assertSourceUnchanged() {
      if (original !== undefined) assert.deepEqual(fingerprint(), original, 'original Brand helpers, guard and event catalog unchanged');
    },
  };
}
