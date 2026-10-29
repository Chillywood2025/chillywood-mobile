#!/usr/bin/env python3
"""Run unchanged pgTAP files against a verified isolated schema-template clone.

Canonical Supabase CI still runs `supabase db reset; supabase test db`. This
socket-only runner reports the managed-service fixture substitutions explicitly.
This is not clean-cluster migration replay: the explicitly supplied preparation
manifest binds the retained complete template to historical migration bytes.
The template contains synthetic reservation fixtures. Only the supplied new
forward migrations and managed fixture compatibility overlay are applied to a
new clone. No historical migration or role-creation guard is bypassed.
Timeouts and incomplete TAP plans always fail.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import threading
import time
import uuid


CONTAINER = 'chillywood-event-offer-audit-policy-20261028-task2'
IMAGE = 'sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f'
TEMPLATE = 'event_reservation_broadcast_policy_20261028'
TAP_PARSER = r'''
use TAP::Parser; use JSON::PP;
open my $fh, '<', $ARGV[0] or die $!;
my $tap = do { local $/; <$fh> };
my $p = TAP::Parser->new({tap=>$tap});
my (@failed, @skipped, @todo, @bailouts);
while (my $r=$p->next) {
  if ($r->is_test) {
    push @failed, $r->as_string unless $r->is_ok;
    push @skipped, $r->as_string if $r->has_skip;
    push @todo, $r->as_string if $r->has_todo;
  }
  push @bailouts, $r->as_string if $r->is_bailout;
}
my @errors=$p->parse_errors;
print encode_json({tests_run=>$p->tests_run,tests_planned=>$p->tests_planned,
  good_plan=>$p->is_good_plan ? JSON::PP::true : JSON::PP::false,
  failed=>\@failed,skipped=>\@skipped,todo=>\@todo,bailouts=>\@bailouts,parse_errors=>\@errors});
'''


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def identifier(value):
    return '"' + str(value).replace('"', '""') + '"'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--evidence', required=True, type=Path)
    parser.add_argument('--prepared-manifest', required=True, type=Path,
                        help='Original successful prepare-results.json beside its full-schema.sql')
    parser.add_argument('--patch', action='append', default=[], type=Path,
                        help='Explicit new forward migration; must cover every migration absent from the manifest')
    parser.add_argument('--only', action='append', default=[], help='Exact SQL basename for a diagnostic subset')
    parser.add_argument('--test-timeout', type=int, default=50, help='Explicit per-file wall-clock budget in seconds')
    parser.add_argument('--statement-timeout', type=int, default=40)
    parser.add_argument('--lock-timeout', type=int, default=10)
    parser.add_argument('--suite-timeout', type=int, default=2100,
                        help='Overall wall-clock budget, including setup; canonical Database CI allows 35 minutes')
    args = parser.parse_args()
    if min(args.test_timeout, args.statement_timeout, args.lock_timeout, args.suite_timeout) <= 0:
        parser.error('timeouts must be positive')
    repo, evidence = args.repo.resolve(), args.evidence.resolve()
    evidence.mkdir(parents=True, exist_ok=False)
    database = 'native_pgtap_' + uuid.uuid4().hex[:12]
    suite_started = time.monotonic()
    report = {'started_at': stamp(), 'database': database, 'container': CONTAINER,
              'full_suite': not args.only, 'passed': False, 'tests': [], 'checks': [],
              'timeouts': {'file': args.test_timeout, 'statement': args.statement_timeout, 'lock': args.lock_timeout,
                           'suite': args.suite_timeout},
              'runtime': 'Native PostgreSQL with explicit managed auth/storage/cron/net/realtime fixture substitutions',
              'schema_mode': 'Verified complete-schema template clone plus explicit forward migrations',
              'clean_cluster_migration_replay': False, 'template': TEMPLATE,
              'template_preseed': 'Synthetic event-reservation-authority.sql fixtures from original preparation'}

    def save():
        (evidence / 'result.json').write_text(json.dumps(report, indent=2) + '\n')

    def check(condition, label):
        if not condition:
            raise AssertionError(label)
        report['checks'].append(label)
        save()
        print('ok - ' + label, flush=True)

    def psql_args(db):
        return ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-P', 'pager=off',
                '-h', '/tmp', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']

    def query(sql, db=None):
        result = subprocess.run(psql_args(db or database), input=sql, text=True, capture_output=True, timeout=20)
        if result.returncode:
            raise RuntimeError(result.stderr)
        return result.stdout.strip()

    def database_acl_snapshot(db):
        return json.loads(query("select json_build_object('owner',owner.rolname,"
            "'encoding',pg_encoding_to_char(database.encoding),'collate',database.datcollate,"
            "'ctype',database.datctype,'acl',coalesce((select json_agg(json_build_object("
            "'grantor',grantor.rolname,'grantee',case when privilege.grantee=0 then 'PUBLIC' else grantee.rolname end,"
            "'privilege',privilege.privilege_type,'grantable',privilege.is_grantable) "
            "order by privilege.grantor,privilege.grantee,privilege.privilege_type,privilege.is_grantable) "
            "from aclexplode(coalesce(database.datacl,acldefault('d',database.datdba))) privilege "
            "join pg_roles grantor on grantor.oid=privilege.grantor "
            "left join pg_roles grantee on grantee.oid=privilege.grantee),'[]'::json)) "
            "from pg_database database join pg_roles owner on owner.oid=database.datdba "
            "where database.datname=" + literal(db) + ';', db='postgres'))

    def inventory():
        paths = set((repo / 'supabase/migrations').glob('*.sql')) | set((repo / 'supabase/tests').glob('*.sql'))
        paths |= set((repo / 'tests/helpers').glob('*.mjs'))
        paths |= {repo / 'tests/fixtures/storage-table-authority-production-20261029.sql',
                  repo / 'tests/fixtures/storage-delete-protection-production-20261029.sql',
                  repo / 'tests/fixtures/realtime-delete-filter-production-20261022.sql',
                  repo / 'tests/fixtures/database-managed-schema-20261015.json'}
        paths |= {repo / 'scripts/export-event-reservation-runtime-fixture.mjs', Path(__file__).resolve(), repo / 'package-lock.json'}
        return {str(path.relative_to(repo)): digest(path) for path in sorted(paths)}

    def observe(application):
        return json.loads(query("select coalesce(json_agg(json_build_object('pid',pid,'state',state,"
            "'query_start',query_start,'xact_start',xact_start,'wait_event_type',wait_event_type,"
            "'wait_event',wait_event,'blocking_pids',pg_blocking_pids(pid),'query',query)), '[]'::json) "
            "from pg_stat_activity where datname=" + literal(database) + ' and application_name=' + literal(application) + ';'))

    def terminate(application):
        # The generated application name and owned database scope every cancel.
        return json.loads(query("select coalesce(json_agg(json_build_object("
            "'pid',pid,'terminated',pg_terminate_backend(pid))), '[]'::json) from pg_stat_activity where datname="
            + literal(database) + ' and application_name=' + literal(application) + ';'))

    def schema_snapshot(db, application_only=False):
        command = ['docker', 'exec', CONTAINER, 'pg_dump', '-h', '/tmp', '-U', 'postgres',
                   '--schema-only', db]
        if application_only:
            command += ['--schema=public', '--schema=private']
        snapshot = subprocess.check_output(command, timeout=60)
        # New pg_dump releases generate a random psql restriction key per dump.
        return b'\n'.join(line for line in snapshot.splitlines()
                          if not line.startswith((b'\\restrict ', b'\\unrestrict '))) + b'\n'

    def execute(label, content, timeout, parse_tap=False):
        application = 'codex_pgtap_' + uuid.uuid4().hex[:16]
        output_path, error_path = evidence / (label + '.stdout.log'), evidence / (label + '.stderr.log')
        entry = {'file': label, 'application_name': application, 'started_at': stamp(), 'observations': [], 'timed_out': False}
        prefix = ("set application_name=" + literal(application) + "; set search_path=public,extensions; "
                  "set statement_timeout=" + literal(str(args.statement_timeout) + 's') + '; '
                  "set lock_timeout=" + literal(str(args.lock_timeout) + 's') + ';\n')
        with output_path.open('wb') as output, error_path.open('wb') as errors:
            process = subprocess.Popen(psql_args(database), stdin=subprocess.PIPE, stdout=output, stderr=errors)
            writer_error = []

            def feed():
                try:
                    process.stdin.write((prefix + content).encode())
                except BrokenPipeError:
                    pass  # ON_ERROR_STOP can exit before consuming the remainder.
                except Exception as error:
                    writer_error.append(str(error))
                finally:
                    try:
                        process.stdin.close()
                    except BrokenPipeError:
                        pass

            writer = threading.Thread(target=feed, daemon=True)
            writer.start()
            start = time.monotonic()
            next_sample = min(10, timeout / 2)
            try:
                while process.poll() is None:
                    elapsed = time.monotonic() - start
                    if elapsed >= next_sample:
                        entry['observations'].append({'elapsed_seconds': round(elapsed, 3), 'sessions': observe(application)})
                        next_sample += 10
                        (evidence / (label + '.observations.json')).write_text(json.dumps(entry['observations'], indent=2) + '\n')
                    if elapsed >= timeout:
                        entry['timed_out'] = True
                        entry['timeout_snapshot'] = observe(application)
                        break
                    time.sleep(0.1)
            finally:
                if process.poll() is None:
                    try:
                        entry['terminated_sessions'] = terminate(application)
                    finally:
                        try:
                            process.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait(timeout=5)
            writer.join(timeout=5)
            entry.update({'elapsed_seconds': round(time.monotonic() - start, 3), 'exit_code': process.returncode,
                          'writer_errors': writer_error, 'completed_at': stamp()})
        entry['remaining_sessions'] = observe(application)
        entry['passed'] = entry['exit_code'] == 0 and not entry['timed_out'] and not writer_error and not entry['remaining_sessions']
        if parse_tap:
            parsed = subprocess.run(['perl', '-e', TAP_PARSER, str(output_path)], text=True, capture_output=True, timeout=20)
            if parsed.returncode:
                entry['tap_parser_error'] = parsed.stderr
                entry['passed'] = False
            else:
                tap = json.loads(parsed.stdout)
                entry['tap'] = tap
                entry['passed'] = bool(entry['passed'] and tap['good_plan'] and tap['tests_run']
                    and not any(tap[key] for key in ('failed', 'skipped', 'todo', 'bailouts', 'parse_errors')))
        return entry

    try:
        inspection = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER], text=True, timeout=20))[0]
        check(inspection['Name'] == '/' + CONTAINER and inspection['Image'] == IMAGE and inspection['State']['Running']
              and inspection['HostConfig']['NetworkMode'] == 'none' and not inspection['Mounts']
              and not inspection['HostConfig']['PortBindings'] and not inspection['NetworkSettings']['Ports'],
              'exact allowlisted container/image remains isolated')
        report['source_head'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
        report['source_sha256'] = inventory()
        if not args.only:
            source_changes = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=all', '--',
                *report['source_sha256']], cwd=repo, text=True).strip()
            check(not source_changes, 'full-suite inputs are committed at the recorded Git head')
        report['postgres'] = query('show server_version;', db='postgres')
        check(report['postgres'] == '17.6' and query('show listen_addresses;', db='postgres') == '',
              'native PostgreSQL17.6 uses its existing Unix socket with no TCP listener')
        roles = json.loads(query("select json_agg(json_build_object('name',rolname,'superuser',rolsuper,'bypassrls',rolbypassrls)) "
            "from pg_roles where rolname in('anon','authenticated','service_role','supabase_admin','supabase_auth_admin','supabase_storage_admin');", db='postgres'))
        check(len(roles) == 6 and all(not role['superuser'] and not role['bypassrls'] for role in roles if role['name'] in ('anon','authenticated')),
              'existing managed fixture roles are present without elevated buyer/anonymous privileges')
        report['managed_roles'] = roles
        prepared_path = args.prepared_manifest.resolve()
        prepared = json.loads(prepared_path.read_text())
        check(prepared['passed'] is True and prepared['container'] == CONTAINER and prepared['database'] == TEMPLATE
              and all(step['exitCode'] == 0 for step in prepared['results'])
              and digest(prepared_path.parent / 'full-schema.sql') == prepared['schemaSHA256'],
              'retained preparation succeeded and original full schema export hash matches')
        baseline = prepared['sourceSHA256']
        check(all((repo / name).is_file() and digest(repo / name) == value for name, value in baseline.items()),
              'every historical migration and recorded fixture/script byte matches the prepared template manifest')
        new_migrations = sorted(path.resolve() for path in (repo / 'supabase/migrations').glob('*.sql')
                                if str(path.relative_to(repo)) not in baseline)
        patches = sorted(path.resolve() for path in args.patch)
        check(patches == new_migrations and len(patches) == len(set(patches)),
              'explicit patches cover exactly all new migrations, with none skipped')
        report['prepared_manifest'] = {'path': str(prepared_path), 'sha256': digest(prepared_path),
            'source_head': prepared['sourceHead'], 'schema_sha256': prepared['schemaSHA256'],
            'verified_source_files': len(baseline)}
        template_schema = schema_snapshot(TEMPLATE)
        (evidence / 'template-schema.sql').write_bytes(template_schema)
        report['template_schema_sha256'] = hashlib.sha256(template_schema).hexdigest()
        # CREATE DATABASE ... TEMPLATE copies object ACLs, but not pg_database.datacl.
        # Preserve the template database privilege boundary explicitly on the owned clone.
        template_database = database_acl_snapshot(TEMPLATE)
        report['template_database'] = template_database
        check(template_database['owner'] == 'postgres'
              and all(privilege['grantor'] == 'postgres' for privilege in template_database['acl']),
              'prepared template database owner and all ACL grantors are the existing fixture owner')
        check(query("select count(*) from pg_db_role_setting where setdatabase=(select oid from pg_database where datname="
              + literal(TEMPLATE) + ');', db='postgres') == '0',
              'prepared template has no omitted database-specific role settings')
        subprocess.run(['docker', 'exec', CONTAINER, 'createdb', '-h', '/tmp', '-U', 'postgres', '--template=' + TEMPLATE, database],
                       check=True, capture_output=True, timeout=90)
        cloned_database = database_acl_snapshot(database)
        check(all(cloned_database[key] == template_database[key] for key in ('owner','encoding','collate','ctype')),
              'clone database owner, encoding and locale match the prepared template')
        acl_sql = []
        for grantee_name in sorted({privilege['grantee'] for privilege in cloned_database['acl']}):
            grantee = 'public' if grantee_name == 'PUBLIC' else identifier(grantee_name)
            acl_sql.append('revoke all privileges on database ' + identifier(database) + ' from ' + grantee + ';')
        for privilege in template_database['acl']:
            if privilege['privilege'] not in ('CONNECT','CREATE','TEMPORARY'):
                raise AssertionError('unexpected source database privilege')
            grantee = 'public' if privilege['grantee'] == 'PUBLIC' else identifier(privilege['grantee'])
            acl_sql.append('grant ' + privilege['privilege'] + ' on database ' + identifier(database)
                + ' to ' + grantee + (' with grant option' if privilege['grantable'] else '') + ';')
        (evidence / 'clone-database-acl.sql').write_text('\n'.join(acl_sql) + '\n')
        query("begin; set local statement_timeout='10s'; set local lock_timeout='10s';\n"
              + '\n'.join(acl_sql) + '\ncommit;', db='postgres')
        check(database_acl_snapshot(database) == template_database,
              'clone database ACL exactly matches the prepared template, including PUBLIC/runtime TEMP denial')
        check(schema_snapshot(database) == template_schema, 'fresh clone schema is byte-identical to retained template dump')
        report['forward_migrations'] = []
        for patch in patches:
            entry = execute(patch.name, patch.read_text(), 120)
            entry['sha256'] = digest(patch)
            report['forward_migrations'].append(entry)
            check(entry['passed'], 'new forward migration applied: ' + patch.name)
        application_before = schema_snapshot(database, application_only=True)
        overlay = subprocess.check_output(['node', '--input-type=module', '-e',
            "import {managedRequestContextSQL,managedExtensionUsageSQL,managedStorageObjectIDDefaultSQL} from './tests/helpers/database-managed-request-context.mjs';"
            "process.stdout.write(managedRequestContextSQL.replaceAll('create function auth.','create or replace function auth.')+'\\n'+managedExtensionUsageSQL+'\\n'+managedStorageObjectIDDefaultSQL);"],
            cwd=repo, text=True, timeout=30)
        (evidence / 'managed-fixture-overlay.sql').write_text(overlay)
        report['managed_fixture_overlay'] = execute('managed-fixture-overlay', overlay, 60)
        check(report['managed_fixture_overlay']['passed'], 'managed request claims and extensions schema usage match Supabase fixtures')
        check(schema_snapshot(database, application_only=True) == application_before,
              'managed fixture overlay leaves all public/private application definitions unchanged')
        # Preserve the real managed statement-level delete guard in the native
        # fixture. Never set storage.allow_delete_query in the harness.
        storage_guard_fixture = repo / 'tests/fixtures/storage-delete-protection-production-20261029.sql'
        check(query("select to_regprocedure('storage.protect_delete()') is null and not exists("
                    "select 1 from pg_trigger where tgrelid='storage.objects'::regclass "
                    "and tgname='protect_objects_delete');") == 't',
              'captured managed Storage delete guard is absent before isolated overlay')
        report['managed_storage_delete_guard_overlay'] = execute('managed-storage-delete-guard-overlay', storage_guard_fixture.read_text(), 60)
        report['managed_storage_delete_guard_overlay']['source'] = str(storage_guard_fixture.relative_to(repo))
        report['managed_storage_delete_guard_overlay']['source_sha256'] = digest(storage_guard_fixture)
        check(report['managed_storage_delete_guard_overlay']['passed'], 'captured managed Storage delete guard applied locally')
        storage_guard = json.loads(query("select json_build_object('owner',pg_get_userbyid(proowner),"
            "'acl',proacl::text,'security_definer',prosecdef,'config',proconfig,"
            "'definition_md5',md5(pg_get_functiondef(oid)),"
            "'trigger',(select pg_get_triggerdef(oid) from pg_trigger where tgrelid='storage.objects'::regclass "
            "and tgname='protect_objects_delete')) from pg_proc where oid='storage.protect_delete()'::regprocedure;"))
        report['managed_storage_delete_guard_overlay']['catalog'] = storage_guard
        check(storage_guard == {
            'owner': 'supabase_storage_admin', 'acl': None, 'security_definer': False, 'config': None,
            'definition_md5': '4371ae544fb1ef704f9c5d42265ac324',
            'trigger': 'CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete()'},
              'managed Storage guard owner, default ACL, exact definition and statement trigger match captured metadata')
        # The retained synthetic schema omitted managed Storage table authority.
        # This bounded fixture restores captured ownership, exact ACL tuples and
        # RLS together; its transaction asserts all row policies and other guards
        # plus global roles/schema privileges remain byte-identical.
        storage_authority_fixture = repo / 'tests/fixtures/storage-table-authority-production-20261029.sql'
        report['managed_storage_table_authority_overlay'] = execute(
            'managed-storage-table-authority-overlay', storage_authority_fixture.read_text(), 60)
        report['managed_storage_table_authority_overlay']['source'] = str(storage_authority_fixture.relative_to(repo))
        report['managed_storage_table_authority_overlay']['source_sha256'] = digest(storage_authority_fixture)
        check(report['managed_storage_table_authority_overlay']['passed'],
              'managed Storage table owner, exact ACL and RLS match captured authority with all definitions and global roles preserved')
        # This captured managed filter implementation is pure local SQL. It does
        # not assert an installed Realtime service or replace application code.
        realtime_fixture = repo / 'tests/fixtures/realtime-delete-filter-production-20261022.sql'
        check(query("select to_regtype('realtime.equality_op') is null "
                    "and to_regtype('realtime.wal_column') is null "
                    "and to_regtype('realtime.user_defined_filter') is null "
                    "and not exists(select 1 from pg_proc where pronamespace='realtime'::regnamespace "
                    "and proname in ('check_equality_op','is_visible_through_filters'));") == 't',
              'retained synthetic Realtime filter objects are absent before captured fixture overlay')
        report['managed_realtime_filter_overlay'] = execute('managed-realtime-filter-overlay', realtime_fixture.read_text(), 60)
        report['managed_realtime_filter_overlay']['source'] = str(realtime_fixture.relative_to(repo))
        report['managed_realtime_filter_overlay']['source_sha256'] = digest(realtime_fixture)
        check(report['managed_realtime_filter_overlay']['passed'], 'captured managed Realtime filter SQL applied locally')
        report['managed_realtime_filter_overlay']['definition_md5'] = query(
            "select md5(pg_get_functiondef('realtime.is_visible_through_filters(realtime.wal_column[],realtime.user_defined_filter[])'::regprocedure));")
        # Reservation preparation enables only synthetic sandbox rails. Restore
        # the App Store source seed from 20260715151250_ios_app_store_mappings.sql
        # before unchanged suite assertions; no real provider is contacted.
        money_state_sql = "select json_object_agg(key,state order by key) from public.platform_money_kill_switches;"
        report['template_money_switches'] = json.loads(query(money_state_sql))
        check(report['template_money_switches'].get('revenuecat_app_store_enabled') == 'sandbox_only',
              'App Store template preseed matches the recorded synthetic reservation fixture')
        report['template_app_store_default_restore'] = execute('template-app-store-default-restore',
            "begin; update public.platform_money_kill_switches set state='off' "
            "where key='revenuecat_app_store_enabled' and state='sandbox_only'; commit;", 60)
        check(report['template_app_store_default_restore']['passed'], 'owned clone App Store switch restored to source-seeded off default')
        expected_switches = dict(report['template_money_switches'], revenuecat_app_store_enabled='off')
        check(json.loads(query(money_state_sql)) == expected_switches
              and query("select public.ios_creator_money_expected_environment_internal() is null;") == 't',
              'only the clone App Store fixture state changed and off resolves no purchase environment')
        check(schema_snapshot(database, application_only=True) == application_before,
              'captured infrastructure and fixture-state overlays preserve application definitions and grants')
        query('create extension if not exists pgtap with schema extensions;')
        report['pgtap'] = query("select extversion from pg_extension where extname='pgtap';")
        all_paths = sorted((repo / 'supabase/tests').glob('*.sql'))
        check(not args.only or set(args.only) <= {path.name for path in all_paths}, 'requested test files exist')
        paths = [path for path in all_paths if not args.only or path.name in args.only]
        report['available_tests'] = len(all_paths)
        report['selected_tests'] = [path.name for path in paths]
        report['unrun_tests'] = []
        for index, path in enumerate(paths):
            remaining = args.suite_timeout - (time.monotonic() - suite_started)
            if remaining <= 0:
                report['suite_timed_out'] = True
                report['unrun_tests'] = [pending.name for pending in paths[index:]]
                break
            entry = execute(path.name, path.read_text(), min(args.test_timeout, remaining), parse_tap=True)
            report['tests'].append(entry)
            save()
            print(('PASS ' if entry['passed'] else 'FAIL ') + path.name + ' (' + str(entry['elapsed_seconds']) + 's)', flush=True)
        report['remaining_database_sessions'] = json.loads(query("select coalesce(json_agg(pid),'[]'::json) from pg_stat_activity "
            "where datname=current_database() and pid<>pg_backend_pid();"))
        check(not report['remaining_database_sessions'], 'all test database sessions closed')
        check(database_acl_snapshot(TEMPLATE) == template_database,
              'original template database ACL and locale remained unchanged')
        check(database_acl_snapshot(database) == template_database,
              'test rollback left the clone database ACL equal to the original template')
        check(schema_snapshot(TEMPLATE) == template_schema, 'retained template schema remained unchanged')
        check(inventory() == report['source_sha256'], 'source bytes stayed frozen throughout the run')
        check(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == report['source_head'],
              'Git head stayed frozen throughout the run')
        check(time.monotonic() - suite_started <= args.suite_timeout, 'overall suite wall-clock budget was not exceeded')
        report['passed'] = bool(report['tests']) and not report['unrun_tests'] and all(entry['passed'] for entry in report['tests'])
    except Exception as error:
        report['error'] = {'type': type(error).__name__, 'message': str(error)}
        print(json.dumps(report['error']), flush=True)
    finally:
        report['completed_at'] = stamp()
        report['elapsed_seconds'] = round(time.monotonic() - suite_started, 3)
        save()
    print(json.dumps({'passed': report['passed'], 'full_suite': report['full_suite'], 'database': database,
                      'tests': len(report['tests']), 'failed': [entry['file'] for entry in report['tests'] if not entry['passed']]}), flush=True)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
