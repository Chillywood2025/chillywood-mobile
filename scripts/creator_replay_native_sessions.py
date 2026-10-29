"""Bounded psql sessions for isolated, synthetic native PostgreSQL regressions."""
import json
from pathlib import Path
import queue
import subprocess
import threading
import time
import uuid


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


class NativeSessions:
    def __init__(self, container, database, evidence):
        self.container, self.database = container, database
        self.evidence = Path(evidence)
        self.evidence.mkdir(parents=True, exist_ok=False)
        self.sessions = []
        self.run_id = uuid.uuid4().hex

    def session(self, label):
        return Session(self, label)

    def close(self):
        for session in reversed(self.sessions):
            session.close()
        names = ','.join(literal(session.application_name) for session in self.sessions)
        predicate = ('datname=' + literal(self.database) + ' and application_name in (' + names + ')')
        command = ['docker','exec','-i',self.container,'psql','-X','-qAt','-h','/tmp',
                   '-U','postgres','-d',self.database,'-v','ON_ERROR_STOP=1']
        cleanup = {'run_id': self.run_id, 'owned_backend_pids':[s.pid for s in self.sessions],
                   'owned_application_names':[s.application_name for s in self.sessions],
                   'remaining': None, 'readbacks': []}
        try:
            if not self.sessions:
                cleanup['remaining'] = '0'
                return
            result = subprocess.run(command, input='select pg_terminate_backend(pid) from pg_stat_activity where '
                + predicate + ';', text=True, capture_output=True, timeout=20)
            cleanup.update({'exit_code':result.returncode, 'stderr':result.stderr})
            if result.returncode:
                raise AssertionError('Test-owned database session termination was not confirmed')
            # Termination acknowledgement is not backend disappearance. Fresh
            # psql sessions avoid a cached pg_stat_activity transaction snapshot.
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                result = subprocess.run(command, input='select count(*) from pg_stat_activity where '
                    + predicate + ';', text=True, capture_output=True, timeout=5)
                remaining = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else None
                cleanup['readbacks'].append({'exit_code':result.returncode, 'remaining':remaining,
                                            'stderr':result.stderr})
                cleanup['remaining'] = remaining
                if result.returncode:
                    raise AssertionError('Test-owned database session cleanup readback failed')
                if remaining == '0':
                    return
                time.sleep(.05)
            raise AssertionError('Test-owned database session cleanup was not confirmed')
        finally:
            (self.evidence/'session-cleanup.json').write_text(json.dumps(cleanup,indent=2)+'\n')


class Session:
    def __init__(self, owner, label):
        self.owner, self.label, self.lock = owner, label, threading.Lock()
        # Stay below PostgreSQL's 63-byte application_name limit without
        # truncating labels into collisions between owned sessions.
        self.application_name = 'creator-lock-regression-' + uuid.uuid4().hex
        self.pid = None
        self.rows, self.errors, self.output = queue.Queue(), [], []
        self.process = subprocess.Popen([
            'docker', 'exec', '-i', '-e', 'PGAPPNAME=' + self.application_name,
            owner.container, 'psql', '-X', '-qAt',
            '-h', '/tmp', '-U', 'postgres', '-d', owner.database,
            '-v', 'ON_ERROR_STOP=0', '-v', 'VERBOSITY=verbose'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1)
        # Track even a session whose initialization fails, so cleanup can find
        # its exact unique application name before a backend PID was read.
        owner.sessions.append(self)

        def stdout():
            for line in self.process.stdout:
                self.output.append(line.rstrip('\n'))
                self.rows.put(line.rstrip('\n'))
            self.rows.put(None)

        def stderr():
            for line in self.process.stderr:
                self.errors.append(line.rstrip('\n'))

        self.readers = [threading.Thread(target=stdout, daemon=True), threading.Thread(target=stderr, daemon=True)]
        for reader in self.readers:
            reader.start()
        self.require("set statement_timeout='25s'; set lock_timeout='20s'; "
                     "set idle_in_transaction_session_timeout='45s'; set deadlock_timeout='3s';")
        self.pid = int(self.scalar('select pg_backend_pid();'))

    def execute(self, sql, timeout=40):
        with self.lock:
            token = '__END_' + uuid.uuid4().hex
            self.process.stdin.write(sql.rstrip(';\n') + ';\n\\echo ' + token + ' :SQLSTATE\n')
            self.process.stdin.flush()
            rows, deadline = [], time.monotonic() + timeout
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError(self.label + ': response timeout, not deadlock evidence')
                try:
                    row = self.rows.get(timeout=remaining)
                except queue.Empty as exc:
                    raise TimeoutError(self.label + ': response timeout, not deadlock evidence') from exc
                if row is None:
                    raise RuntimeError(self.label + ': psql exited before response')
                if row.startswith(token + ' '):
                    return {'session': self.label, 'sqlstate': row.split()[-1], 'rows': rows}
                if row:
                    rows.append(row)

    def require(self, sql):
        result = self.execute(sql)
        if result['sqlstate'] != '00000':
            raise AssertionError(json.dumps(result))
        return result

    def scalar(self, sql):
        rows = self.require(sql)['rows']
        return rows[-1] if rows else None

    def claim(self, user, session):
        claims = json.dumps({'role': 'authenticated', 'sub': user, 'session_id': session})
        self.require('select set_config(\'request.jwt.claims\',' + literal(claims) + ',true),'
                     'set_config(\'request.headers\',\'{"x-chillywood-platform":"ios"}\',true);')
        self.require('set local role authenticated;')

    def service(self):
        self.require("set local request.jwt.claims='{\"role\":\"service_role\"}'; set local role service_role;")

    def close(self):
        try:
            if self.process.poll() is None:
                self.execute('rollback; select pg_advisory_unlock_all();')
                self.process.stdin.write('\\quit\n')
                self.process.stdin.flush()
                self.process.wait(timeout=5)
        except Exception:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        finally:
            for reader in self.readers:
                reader.join(timeout=1)
            (self.owner.evidence / (self.label + '-stdout.log')).write_text('\n'.join(self.output) + '\n')
            (self.owner.evidence / (self.label + '-stderr.log')).write_text('\n'.join(self.errors) + '\n')


def wait_for(predicate, label, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.025)
    raise TimeoutError('Barrier timeout, not deadlock evidence: ' + label)


def blockers(observer, sessions):
    pids = ','.join(str(s.pid) for s in sessions)
    return json.loads(observer.scalar("select coalesce(jsonb_agg(jsonb_build_object('pid',pid,"
        "'state',state,'wait_event_type',wait_event_type,'wait_event',wait_event,"
        "'blocking_pids',pg_blocking_pids(pid)) order by pid),'[]') "
        'from pg_stat_activity where pid in (' + pids + ');'))


def has_edge(rows, waiter, holder):
    return any(r['pid'] == waiter.pid and r['wait_event_type'] == 'Lock'
               and holder.pid in r['blocking_pids'] for r in rows)
