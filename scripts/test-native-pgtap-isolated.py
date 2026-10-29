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

    def inventory():
        paths = set((repo / 'supabase/migrations').glob('*.sql')) | set((repo / 'supabase/tests').glob('*.sql'))
        paths |= set((repo / 'tests/helpers').glob('*.mjs'))
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
        subprocess.run(['docker', 'exec', CONTAINER, 'createdb', '-h', '/tmp', '-U', 'postgres', '--template=' + TEMPLATE, database],
                       check=True, capture_output=True, timeout=90)
        check(schema_snapshot(database) == template_schema, 'fresh clone schema is byte-identical to retained template dump')
        report['forward_migrations'] = []
        for patch in patches:
            entry = execute(patch.name, patch.read_text(), 120)
            entry['sha256'] = digest(patch)
            report['forward_migrations'].append(entry)
            check(entry['passed'], 'new forward migration applied: ' + patch.name)
        application_before = schema_snapshot(database, application_only=True)
        overlay = subprocess.check_output(['node', '--input-type=module', '-e',
            "import {managedRequestContextSQL,managedExtensionUsageSQL} from './tests/helpers/database-managed-request-context.mjs';"
            "process.stdout.write(managedRequestContextSQL.replaceAll('create function auth.','create or replace function auth.')+'\\n'+managedExtensionUsageSQL);"],
            cwd=repo, text=True, timeout=30)
        (evidence / 'managed-fixture-overlay.sql').write_text(overlay)
        report['managed_fixture_overlay'] = execute('managed-fixture-overlay', overlay, 60)
        check(report['managed_fixture_overlay']['passed'], 'managed request claims and extensions schema usage match Supabase fixtures')
        check(schema_snapshot(database, application_only=True) == application_before,
              'managed fixture overlay leaves all public/private application definitions unchanged')
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
