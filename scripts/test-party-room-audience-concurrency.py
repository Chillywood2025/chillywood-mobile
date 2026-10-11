#!/usr/bin/env python3
"""Actual Party Room audience races in an owned disposable local database.

Requires Docker and the repository's current local Supabase schema. No real
user rows are copied. Example:
  python3 scripts/test-party-room-audience-concurrency.py --run \
    --output /tmp/party-room-concurrency-proof
An explicit SHA256 manifest permits checking reviewed, work-only SQL proposals
before source attachment. Neither path contacts a remote database/provider.
"""
import argparse, hashlib, json, queue, re, subprocess, threading, time, uuid
from pathlib import Path

CONTAINER='supabase_db_chillywood-mobile'
HOST='ac110000-0000-4000-8000-000000000001'
SESSION='ac110001-0000-4000-8000-000000000001'
SOURCE='ac110002-0000-4000-8000-000000000001'
PARTY='PARTY-CONCURRENT-01'

def args(db):
    return ['docker','exec','-i',CONTAINER,'sh','-c','export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql "$@"',
            'owned-race-psql','-U','supabase_admin','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1']

class Session:
    def __init__(self,db,name):
        self.name=name;self.pending=None;self.output=queue.Queue()
        self.proc=subprocess.Popen(args(db),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
        def read():
            for line in self.proc.stdout:self.output.put(line.rstrip('\n'))
            self.output.put(None)
        threading.Thread(target=read,daemon=True).start()
        self.run(f"set application_name='{name}'; set statement_timeout='15s'; set lock_timeout='12s';")
    def start(self,sql):
        if self.pending:raise RuntimeError('owned session already pending')
        self.pending='PARTY_BOUNDARY_'+uuid.uuid4().hex
        self.proc.stdin.write(sql+'\n\\echo '+self.pending+'\n');self.proc.stdin.flush()
    def finish(self):
        lines=[];deadline=time.monotonic()+20
        while True:
            line=self.output.get(timeout=max(.01,deadline-time.monotonic()))
            if line is None:raise RuntimeError('session ended: '+'\n'.join(lines))
            if line==self.pending:self.pending=None;return '\n'.join(lines).strip()
            lines.append(line)
    def run(self,sql):self.start(sql);return self.finish()
    def close(self):
        if self.proc.poll() is None:
            try:self.proc.communicate('rollback;\n\\q\n',timeout=10)
            except subprocess.TimeoutExpired:self.proc.kill();self.proc.wait(timeout=5)

def run(db,manifest,out,command,safe_body):
    checks=[];sessions=[];raw=[]
    def check(value,name):
        if not value:raise AssertionError(name)
        checks.append(name)
    def query(sql):return command(db,sql)
    def blocked(name):
        deadline=time.monotonic()+8
        while time.monotonic()<deadline:
            if query("select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='"+name+"' and wait_event_type='Lock')")=='t':return
            time.sleep(.03)
        raise AssertionError('no actual lock barrier '+name)
    claims=json.dumps({'role':'authenticated','sub':HOST,'session_id':SESSION},separators=(',',':'))
    login=f"select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claims','{claims}',false); set role authenticated;"
    publish=f"select public.publish_party_room_discovery('{PARTY}','platform_title','{SOURCE}','{SESSION}');"
    join=f"select count(*) from public.join_watch_party_room_session('{PARTY}');"
    try:
        migrations=[]
        for e in manifest['migrations']:
            b=Path(e['path']).read_bytes();check(hashlib.sha256(b).hexdigest()==e['sha256'],'frozen migration '+e['name'])
            migrations.append(safe_body(b.decode(),False))
        query('BEGIN; CREATE EXTENSION IF NOT EXISTS pgtap; SET LOCAL search_path=public,extensions;\n'+'\n'.join(migrations)+'\nCOMMIT;')
        test=Path(manifest['tests'][0]['path']).read_text()
        fixture=test.split('select pg_temp.party_login(1);',1)[0]
        fixture=fixture.removeprefix('begin;')
        setup=query('BEGIN; SET LOCAL search_path=public,extensions;\n'+fixture+'\nselect * from finish(); COMMIT;')
        (out/'concurrency-fixture.log').write_text(setup)
        check('not ok' not in setup and '1..9' in setup,'real Premium/session/friend fixtures pass before races')
        a=Session(db,'party_owned_a');sessions.append(a)
        b=Session(db,'party_owned_b');sessions.append(b)
        a.run(login);b.run(login)
        a.run(f"insert into public.watch_party_rooms(party_id,host_user_id,title_id,source_type,source_id,room_type,content_access_rule) values('{PARTY}','{HOST}','{SOURCE}','platform_title','{SOURCE}','title','premium');")
        a.run(f"select public.set_party_room_discovery('{PARTY}','public','Concurrent ordinary Party Room','platform_title','{SOURCE}','{SESSION}');")
        check(query(f"select count(*) from private.party_room_discovery_host_joins where party_id='{PARTY}'")=='0','automatic INSERT bootstrap did not create explicit join receipt')
        check(a.run(join)=='1','real host join commits before publication race')
        viewer='ac110000-0000-4000-8000-000000000002'
        viewer_session='ac110001-0000-4000-8000-000000000002'
        viewer_claims=json.dumps({'role':'authenticated','sub':viewer,'session_id':viewer_session},separators=(',',':'))
        b.run(f"reset role; select set_config('request.jwt.claims','{viewer_claims}',false); set role authenticated;")
        check(b.run(join)=='1','actual viewer joins before concurrent host removal')
        # Hold exactly the existing participant RPC's first lock in its host
        # transaction. This is a deterministic barrier, not substituted authority.
        a.run(f"BEGIN; select pg_advisory_xact_lock(hashtextextended('watch-party-member:{PARTY}:{viewer}',0));")
        b.start(f"BEGIN; do $$ begin perform public.join_watch_party_room_session('{PARTY}'); raise exception 'unexpected rejoin'; exception when raise_exception then if sqlerrm<>'watch_party_membership_removed' then raise; end if; end $$;")
        blocked(b.name)
        # Both production RPCs execute. With the old room-first wrapper, this
        # call deadlocks against rejoin; canonical advisory-first ordering lets
        # host removal commit and then rejoin must observe the terminal row.
        removed=a.run(f"select count(*) from public.set_watch_party_participant_authority('{PARTY}','{viewer}','listener',false,'removed');")
        check(removed=='1','actual host removal completes while concurrent rejoin is blocked')
        a.run('COMMIT;');b.finish();b.run('COMMIT;')
        check(query(f"select membership_state from public.watch_party_room_memberships where party_id='{PARTY}' and user_id='{viewer}'")=='removed','concurrent rejoin cannot resurrect terminal removed membership')
        b.run('reset role; '+login)
        first=json.loads(a.run('BEGIN; '+publish))
        b.start('BEGIN; '+publish);blocked(b.name)
        a.run('COMMIT;');second=json.loads(b.finish());b.run('COMMIT;')
        check(first['published'] and second['published'] and first['projectionId']==second['projectionId'],'concurrent starts resolve same canonical projection after actual row-lock wait')
        check(query(f"select count(*) from private.party_room_discovery_publications where party_id='{PARTY}'")=='1','concurrent start records one publication')
        check(query(f"select count(*) from public.notification_activity_events where source_id='{PARTY}' and context->>'sourceType'='party_room'")=='2','concurrent start creates one event per eligible recipient')
        a.run(f"BEGIN; select public.set_party_room_discovery('{PARTY}','private',null,'platform_title','{SOURCE}','{SESSION}');")
        b.start('BEGIN; '+publish);blocked(b.name)
        a.run('COMMIT;');hidden=json.loads(b.finish());b.run('COMMIT;')
        check(hidden['published'] is False,'late Start cannot reverse committed Private audience')
        check(query(f"select count(*) from public.discovery_feed_items where source_type='party_room' and source_id='{PARTY}' and is_publicly_discoverable")=='0','private race leaves no public projection')
        a.run(f"select public.set_party_room_discovery('{PARTY}','public','Current party','platform_title','{SOURCE}','{SESSION}');")
        a.run(f"BEGIN; update public.watch_party_rooms set is_active=false where party_id='{PARTY}';")
        # Catch only the exact expected SQL exception so the long-lived session
        # can expose a completion boundary without ON_ERROR_STOP terminating it.
        expected=f"do $$ begin perform public.publish_party_room_discovery('{PARTY}','platform_title','{SOURCE}','{SESSION}'); raise exception 'unexpected publication'; exception when raise_exception then if sqlerrm<>'party_room_host_required' then raise; end if; end $$;"
        b.start('BEGIN; '+expected);blocked(b.name)
        a.run('COMMIT;');b.finish();b.run('COMMIT;')
        check(query(f"select is_active from public.watch_party_rooms where party_id='{PARTY}'")=='f','End wins against blocked late Start')
        check(query(f"select count(*) from public.discovery_feed_items where source_type='party_room' and source_id='{PARTY}' and is_publicly_discoverable")=='0','End race cannot resurrect projection')
        check(query(f"select count(*) from public.notification_activity_events e where source_id='{PARTY}' and context->>'sourceType'='party_room' and private.resolve_discovery_notification_activity(e)->>'eligible'='true'")=='0','all old queued alerts become ineligible after End')
        a.run(f"update public.watch_party_rooms set is_active=true where party_id='{PARTY}';")
        a.run(join);a.run(publish)
        a.run(f"BEGIN; update public.watch_party_rooms set source_id='ac110002-0000-4000-8000-000000000002',title_id='ac110002-0000-4000-8000-000000000002' where party_id='{PARTY}';")
        stale=expected.replace('party_room_host_required','party_room_source_changed')
        b.start('BEGIN; '+stale);blocked(b.name)
        a.run('COMMIT;');b.finish();b.run('COMMIT;')
        check(query(f"select retired_at is not null from private.party_room_discovery_publications where party_id='{PARTY}'")=='t','source replacement retires prior generation across concurrent callback')
        check(query(f"select count(*) from public.discovery_feed_items where source_type='party_room' and source_id='{PARTY}' and is_publicly_discoverable")=='0','stale-source race cannot list replacement or old content')
        return {'status':'passed','checks':checks,'count':len(checks),'scope':'Two actual authenticated connections and observed database row locks, disposable local DB only; no provider sends.'}
    finally:
        for session in sessions:session.close()

BASELINE = "\nselect jsonb_build_object(\n 'relations', (select md5(coalesce(string_agg(n.nspname||'.'||c.relname||':'||c.relkind::text||':'||\n    c.relrowsecurity||':'||c.relforcerowsecurity||':'||coalesce(c.relacl::text,''),'|' order by n.nspname,c.relname),''))\n    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','extensions')),\n 'functions', (select md5(coalesce(string_agg(p.oid::text||':'||p.prosrc||':'||coalesce(p.proconfig::text,'')||':'||\n    p.prosecdef||':'||coalesce(p.proacl::text,''),'|' order by p.oid),''))\n    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','extensions')),\n 'triggers', (select md5(coalesce(string_agg(pg_get_triggerdef(t.oid),'|' order by t.oid),''))\n    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace\n    where not t.tgisinternal and n.nspname in ('public','private')),\n 'constraints', (select md5(coalesce(string_agg(c.conname||':'||pg_get_constraintdef(c.oid),'|' order by c.oid),''))\n    from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','private')),\n 'columns', (select md5(coalesce(string_agg(c.oid::text||':'||a.attnum||':'||a.attname||':'||a.atttypid||':'||a.attnotnull,\n    '|' order by c.oid,a.attnum),'')) from pg_attribute a join pg_class c on c.oid=a.attrelid\n    join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and a.attnum>0 and not a.attisdropped),\n 'users', (select count(*) from auth.users),\n 'notifications', (select count(*) from public.notifications),\n 'sessions', (select count(*) from auth.sessions),\n 'outbox_absent', to_regclass('public.notification_activity_events') is null,\n 'view_sessions_absent', to_regclass('public.notification_video_view_sessions') is null,\n 'qualified_views_absent', to_regclass('public.notification_qualified_views') is null,\n 'pgtap_absent', not exists(select 1 from pg_extension where extname='pgtap'),\n 'sequence_positions', (select coalesce(jsonb_object_agg(schemaname||'.'||sequencename,last_value),'{}'::jsonb)\n    from pg_sequences where schemaname in ('public','auth','private')));\n"

CONFIG=('monetization_products','platform_money_kill_switches','wave1_legal_document_versions')

def main():
    global CONTAINER
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository',type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--container',default=CONTAINER)
    parser.add_argument('--manifest',type=Path)
    parser.add_argument('--run',action='store_true')
    options=parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+',options.container):raise ValueError('local container name required')
    CONTAINER=options.container
    if options.manifest:
        manifest=json.loads(options.manifest.read_text())
        manifest={'migrations':manifest['migrations'],'tests':[manifest['tests'][0]]}
    else:
        test=options.repository/'supabase/tests/party_room_audience_discovery_test.sql'
        manifest={'migrations':[],'tests':[{'name':'party_room','path':str(test),
            'sha256':hashlib.sha256(test.read_bytes()).hexdigest()}]}
    for e in manifest['migrations']+manifest['tests']:
        if hashlib.sha256(Path(e['path']).read_bytes()).hexdigest()!=e['sha256']:
            raise ValueError('frozen input changed: '+e['name'])
    if not options.run:
        print(json.dumps({'planned':True,'scope':'Owned schema/config-only local clone; actual two-connection races; automatic owned DB removal.',
            'inputs':manifest,'output':str(options.output)}))
        return
    out=options.output
    out.mkdir(mode=0o700,parents=True,exist_ok=False)
    def command(db,statement):
        process=subprocess.run(args(db),input=statement,text=True,capture_output=True,timeout=120)
        if process.returncode:raise RuntimeError(process.stderr[-1800:])
        return process.stdout.strip()
    db='codex_party_'+uuid.uuid4().hex[:20]
    owner='party-room-concurrency '+db
    before=json.loads(command('postgres',BASELINE))
    created=False; result=None; error=None
    try:
        dump=subprocess.run(['docker','exec','-i',CONTAINER,'pg_dump','-U','postgres','-d','postgres',
            '--schema-only','--no-owner'],text=True,capture_output=True,timeout=120)
        if dump.returncode:raise RuntimeError('local schema dump failed: '+dump.stderr[-1000:])
        schema=dump.stdout
        # pg_cron is pinned to the original database; no scheduling is part of
        # this test. The hosted GraphQL shim is unrelated and absent in template0.
        # All application public/private function and table ACLs remain intact.
        for pattern in [
            r'^CREATE EXTENSION IF NOT EXISTS pg_cron .*?;\n',
            r'^COMMENT ON EXTENSION pg_cron IS .*?;\n',
            r'^(?:GRANT|REVOKE) [^\n]*\bcron\.[^\n]*;\n',
            r'^(?:GRANT|REVOKE) [^\n]*\bSCHEMA cron\b[^\n]*;\n',
            r'^ALTER DEFAULT PRIVILEGES [^\n]*\bSCHEMA cron\b[^\n]*;\n',
            r'^(?:GRANT|REVOKE) [^\n]*\bgraphql_public\.graphql\([^\n]*;\n',
        ]:schema=re.sub(pattern,'',schema,flags=re.M)
        private_schema=out/'schema-only-private.sql'
        private_schema.write_text(schema);private_schema.chmod(0o600)
        if command('postgres',f"select count(*) from pg_database where datname='{db}'")!='0':
            raise RuntimeError('unique test database unexpectedly exists')
        command('postgres',f'create database {db} template template0;');created=True
        command('postgres',f"comment on database {db} is '{owner}';")
        command(db,schema)
        config=[]
        for table in CONFIG:
            value=command('postgres',f"select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.{table} t;")
            config.append({'table':table,'rows':len(json.loads(value)),'sha256':hashlib.sha256(value.encode()).hexdigest()})
            escaped=value.replace("'","''")
            command(db,f"insert into public.{table} select * from jsonb_populate_recordset(null::public.{table},'{escaped}'::jsonb);")
        if command(db,'select (select count(*) from auth.users)+(select count(*) from auth.sessions)')!='0':
            raise RuntimeError('schema-only clone unexpectedly contains user data')
        (out/'inputs.json').write_text(json.dumps({'inputs':manifest,'schema_sha256':hashlib.sha256(schema.encode()).hexdigest(),
            'config':config,'copied_users':0,'copied_sessions':0},indent=2)+'\n')
        # Reviewed manifest migrations apply only inside this disposable clone.
        # The default repository path expects canonical local migrations already
        # applied and does not infer/repair any deployment history.
        result=run(db,manifest,out,command,lambda body,_:body)
        for e in manifest['migrations']+manifest['tests']:
            if hashlib.sha256(Path(e['path']).read_bytes()).hexdigest()!=e['sha256']:
                raise RuntimeError('source changed during test: '+e['name'])
    except Exception as exc:error=str(exc)
    finally:
        if created:
            actual=command('postgres',f"select shobj_description(oid,'pg_database') from pg_database where datname='{db}'")
            if actual!=owner:raise RuntimeError('owned database identity changed; no drop issued')
            command('postgres',f'drop database {db};')
        after=json.loads(command('postgres',BASELINE))
        removed=command('postgres',f"select count(*) from pg_database where datname='{db}'")=='0'
        report={'status':'passed' if result and not error and removed and before==after else 'failed',
            'error':error,'concurrency':result,'owned_database_removed':removed,'shared_database_fingerprint_unchanged':before==after,
            'shared_before':before,'shared_after':after,'runner_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
        (out/'receipt.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps({k:report[k] for k in ('status','error','owned_database_removed','shared_database_fingerprint_unchanged')}))
    if report['status']!='passed':raise SystemExit(1)

if __name__=='__main__':main()
