#!/usr/bin/env python3
"""Additional real-PostgreSQL creator/provider lock-order regressions.

All data are synthetic. A test-only AFTER trigger supplies an observable
scheduling barrier; it does not replace any application function or guard.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import re
from pathlib import Path
import subprocess
import uuid
from creator_replay_native_sessions import NativeSessions, literal, wait_for, blockers, has_edge

ROOT = Path(__file__).resolve().parent.parent


def multi_event(owner, observer, repo, apply, check, report, expect):
    fixture = (repo / 'tests/fixtures/event-replay-deadline-policy.sql').read_text()
    apply('multi-one', fixture)
    apply('multi-two', fixture.replace('replay_deadline', 'multi_event_two')
          .replace('replay-deadline', 'multi-event-two').replace("kind='buyer17'", "kind='buyer18'"))
    contexts = [json.loads(observer.scalar('select context from event_reservation_fixture.' + table + ';'))
                for table in ['replay_deadline_context', 'multi_event_two_context']]
    for index, context in enumerate(contexts):
        setup = owner.session('end-' + str(index))
        setup.require('begin;')
        setup.claim(context['hostId'], context['hostSession'])
        setup.require('select public.manage_creator_event_lifecycle(id,\'end\',updated_at) from public.creator_events where id='
                      + literal(context['eventId']) + ';')
        setup.require('commit;')
    contexts.sort(key=lambda item: item['eventId'])
    ids = [literal(item['eventId']) for item in contexts]
    check(observer.scalar('select count(distinct event_id) from private.creator_event_replay_availability_facts '
          'where available and event_id in (' + ','.join(ids) + ');') == '2', 'both events begin with committed available observations')
    first, second = owner.session('replay-batch'), owner.session('receipt-batch')
    first.require('begin;')
    second.require('begin;')
    # Synthetic service batches deliberately visit disjoint source relations in
    # opposite event order. Product triggers and referential checks remain live.
    def replay(index):
        return "update public.creator_replay_library_items set visibility='draft' where broadcast_session_id in " \
            '(select broadcast_session_id from private.creator_event_broadcast_attempts where creator_event_id=' + ids[index] + ');'

    def broadcast(index):
        return 'insert into private.creator_event_broadcast_provider_receipts(attempt_id,provider_status,egress_id,private_origin_verified,binding_verified) ' \
            "select id,'COMPLETE',egress_id,true,true from private.creator_event_broadcast_attempts where creator_event_id=" + ids[index] + ';'

    first.require(replay(0))
    second.require(broadcast(1))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        left = pool.submit(first.execute, replay(1))
        right = pool.submit(second.execute, broadcast(0))
        if expect == 'deadlock':
            wait_for(lambda: has_edge(blockers(observer, [first, second]), first, second)
                     and has_edge(blockers(observer, [first, second]), second, first), 'opposite event observation order')
            report['observations'].append({'stage': 'multi_event_cycle', 'backends': blockers(observer, [first, second])})
            check(True, 'reciprocal multi-event observation lock edges captured')
            wait_for(lambda: (left.done() and left.result()['sqlstate'] == '40P01')
                     or (right.done() and right.result()['sqlstate'] == '40P01'), 'multi-event40P01')
            for future, session in [(left, first), (right, second)]:
                if future.done() and future.result()['sqlstate'] == '40P01':
                    session.require('rollback;')
            results = [left.result(timeout=30), right.result(timeout=30)]
            check(sorted(r['sqlstate'] for r in results) == ['00000', '40P01'], 'native multi-event40P01 and successful survivor')
            for result, session in zip(results, [first, second]):
                if result['sqlstate'] == '00000':
                    session.require('commit;')
        else:
            results = [left.result(timeout=30), right.result(timeout=30)]
            check(all(r['sqlstate'] == '00000' for r in results), 'opposite-order source writes both complete before capture')
            key = "hashtextextended('creator-event-replay-observation:'||" + ids[0] + '::text,0)'
            observer.require('select pg_advisory_lock(' + key + ');')
            left_commit = pool.submit(first.execute, 'commit;')
            right_commit = pool.submit(second.execute, 'commit;')
            wait_for(lambda: has_edge(blockers(observer, [first, second]), first, observer)
                     and has_edge(blockers(observer, [first, second]), second, observer), 'both batches acquire the first canonical event')
            report['observations'].append({'stage': 'both_wait_for_first_event', 'backends': blockers(observer, [first, second])})
            check(True, 'both opposite-order batches wait on the same first event advisory')
            observer.require('select pg_advisory_unlock(' + key + ');')
            commits = [left_commit.result(timeout=30), right_commit.result(timeout=30)]
            check(all(r['sqlstate'] == '00000' for r in commits), 'both multi-event transactions commit successfully')
            report['commits'] = commits
            check(observer.scalar('select count(*) from private.creator_event_replay_observation_pending;') == '0', 'commits fully drain observation work queue')
            latest = json.loads(observer.scalar('select jsonb_agg(available) from (select distinct on(event_id) available '
                'from private.creator_event_replay_availability_facts where event_id in (' + ','.join(ids) + ') order by event_id,id desc)t;'))
            check(latest == [False, False], 'both unavailable source states have committed observations')
    report['outcomes'] = results


def wallet_event(owner, observer, repo, apply, check, report, wallet_first):
    apply('wallet-replay-fixture', (repo / 'tests/fixtures/event-replay-deadline-policy.sql').read_text())
    context = json.loads(observer.scalar('select context from event_reservation_fixture.replay_deadline_context;'))
    event = literal(context['eventId'])
    wallet_sql = "select public.read_my_creator_purchases(50,null,null,'event'," + event + ');'
    end_sql = "select public.manage_creator_event_lifecycle(id,'end',updated_at) from public.creator_events where id=" + event + ';'
    buyer, creator = owner.session('wallet-buyer'), owner.session('event-creator')
    buyer.require('begin;')
    buyer.claim(context['buyerId'],context['buyerSession'])
    original = json.loads(buyer.scalar(wallet_sql))
    check(len(original['items']) == 1 and original['items'][0]['purchaseIntentId'] == context['intentId'],
          'wallet identifies exactly the synthetic buyer purchase')
    buyer.require('commit;')
    buyer.require('begin;')
    buyer.claim(context['buyerId'],context['buyerSession'])
    creator.require('begin;')
    creator.claim(context['hostId'],context['hostSession'])
    first, second = (buyer, creator) if wallet_first else (creator, buyer)
    first_sql, second_sql = (wallet_sql,end_sql) if wallet_first else (end_sql,wallet_sql)
    first_result = first.require(first_sql)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(second.execute,second_sql)
        wait_for(lambda: pending.done() or has_edge(blockers(observer,[buyer,creator]),second,first), 'wallet/lifecycle event serialization')
        state = blockers(observer,[buyer,creator])
        check(not pending.done() and has_edge(state,second,first) and not has_edge(state,first,second),
              'wallet and creator lifecycle serialize on event without reciprocal wait')
        report['observations'].append({'stage':'event_serialization','backends':state})
        first.require('commit;')
        second_result = pending.result(timeout=30)
        check(second_result['sqlstate']=='00000','waiting real RPC succeeds after first transaction commits')
        second.require('commit;')
    buyer.require('begin;')
    buyer.claim(context['buyerId'],context['buyerSession'])
    after = json.loads(buyer.scalar(wallet_sql))
    buyer.require('commit;')
    check(after['items'][0]['terms']==original['items'][0]['terms'],'creator transition preserves exact purchased terms in wallet')
    check(after['items'][0]['purchaseIntentId']==context['intentId'],'wallet retains original purchase identity after event change')
    check(observer.scalar('select status from public.creator_events where id='+event+';')=='ended','creator end transition commits')
    report['outcomes']=[first_result,second_result]


def buyer_replay(owner, observer, repo, apply, check, report):
    apply('buyer-replay-fixture', (repo / 'tests/fixtures/event-replay-deadline-policy.sql').read_text())
    context = json.loads(observer.scalar('select context from event_reservation_fixture.replay_deadline_context;'))
    event = literal(context['eventId'])
    creator, buyer = owner.session('replay-creator'), owner.session('replay-buyer')
    creator.require('begin;')
    creator.claim(context['hostId'], context['hostSession'])
    creator.require("select public.manage_creator_event_lifecycle(id,'end',updated_at) "
                    'from public.creator_events where id=' + event + ';')
    creator.require('commit;')
    check(observer.scalar('select available from private.creator_event_replay_availability_facts '
                          'where event_id=' + event + ' order by id desc limit 1;') == 't',
          'ended event begins with a committed available replay observation')
    replay = observer.scalar('select r.id from public.creator_replay_library_items r '
        'join private.creator_event_broadcast_attempts a on a.broadcast_session_id=r.broadcast_session_id '
        'where a.id=' + literal(context['source']['attemptId']) + ';')
    check(replay is not None, 'creator replay belongs to the exact purchased event attempt')
    wallet_sql = "select public.read_my_creator_purchases(50,null,null,'event'," + event + ');'
    buyer.require('begin;')
    buyer.claim(context['buyerId'], context['buyerSession'])
    original = json.loads(buyer.scalar(wallet_sql))
    buyer.require('commit;')
    check(len(original['items']) == 1 and original['items'][0]['purchaseIntentId'] == context['intentId'],
          'wallet identifies exactly the synthetic buyer purchase before concurrent replay edit')
    buyer.require('begin;')
    # Database-owner scheduling barrier only: the buyer's real wallet RPC runs
    # after assuming authenticated role. Product guards and triggers stay live.
    buyer.require('select id from public.creator_events where id=' + event + ' for update;')
    buyer.claim(context['buyerId'], context['buyerSession'])
    creator.require('begin;')
    creator.claim(context['hostId'], context['hostSession'])

    def edit_and_commit():
        changed = creator.require("update public.creator_replay_library_items set visibility='draft' "
                                  'where id=' + literal(replay) + ' returning id;')
        committed = creator.require('commit;')
        return changed, committed

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        edited = pool.submit(edit_and_commit)
        wait_for(lambda: edited.done() or has_edge(blockers(observer, [buyer, creator]), creator, buyer),
                 'creator replay commit while buyer owns event-row scheduling barrier')
        state = blockers(observer, [buyer, creator])
        report['observations'].append({'stage': 'buyer_event_row_and_creator_replay',
            'scheduling_barrier': 'database-owner event row lock; authenticated creator edit and buyer wallet RPC',
            'backends': state})
        check(edited.done() and not has_edge(state, creator, buyer) and not has_edge(state, buyer, creator),
              'creator replay update and commit finish while buyer owns event row, without reciprocal wait')
        changed, committed = edited.result(timeout=30)
        check(changed['sqlstate'] == '00000' and changed['rows'] == [replay]
              and committed['sqlstate'] == '00000', 'exact authenticated creator replay row changes and commits')
    check(observer.scalar('select available from private.creator_event_replay_availability_facts '
                          'where event_id=' + event + ' order by id desc limit 1;') == 'f',
          'creator commit records unavailable replay without an event parent-row lock')
    check(observer.scalar('select count(*) from private.creator_event_replay_observation_pending;') == '0',
          'creator commit drains observation work queue while buyer event lock is held')
    wallet = buyer.require(wallet_sql)
    after = json.loads(wallet['rows'][-1])
    buyer_commit = buyer.require('commit;')
    check(after['items'][0]['terms'] == original['items'][0]['terms'],
          'real buyer wallet RPC preserves exact purchased terms after replay edit')
    check(after['items'][0]['purchaseIntentId'] == context['intentId'],
          'real buyer wallet RPC preserves original purchase identity after replay edit')
    check(observer.scalar('select count(*) from private.creator_event_replay_observation_pending;') == '0',
          'buyer commit leaves no pending observation work')
    report['outcomes'] = [changed, committed, wallet, buyer_commit]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=ROOT)
    parser.add_argument('--container', required=True)
    parser.add_argument('--image', required=True, help='Exact retained sha256 Docker image ID')
    parser.add_argument('--template', required=True, help='Prepared caller-owned template database')
    parser.add_argument('--preparation-manifest', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--patch', type=Path, action='append', default=[])
    parser.add_argument('--expect', choices=['deadlock', 'success'], required=True)
    parser.add_argument('--case', choices=['provider', 'provider-late', 'multi-event', 'worker', 'wallet-first', 'lifecycle-first', 'buyer-replay'], default='provider')
    args = parser.parse_args()
    if not re.fullmatch(r'chillywood-event-offer-audit-[a-z0-9-]+', args.container):
        parser.error('--container must name an isolated chillywood-event-offer-audit fixture')
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', args.image):
        parser.error('--image must be an exact sha256 image ID')
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', args.template):
        parser.error('--template must be a PostgreSQL identifier')
    args.repo = args.repo.resolve(strict=True)
    args.preparation_manifest = args.preparation_manifest.resolve(strict=True)
    args.patch = [path.resolve(strict=True) for path in args.patch]
    source_paths = sorted(set(args.repo.glob('supabase/migrations/*.sql')) | {
        Path(__file__).resolve(), Path(__file__).resolve().with_name('creator_replay_native_sessions.py'),
        args.repo / 'tests/fixtures/event-broadcast-producer-authority.sql',
        args.repo / 'tests/fixtures/event-replay-deadline-policy.sql',
        args.repo / 'tests/fixtures/event-reservation-authority.sql',
    })

    def digest(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    source_hashes = {str(path.relative_to(args.repo)) if path.is_relative_to(args.repo) else str(path): digest(path)
                     for path in source_paths}
    input_hashes = {str(path): digest(path) for path in [args.preparation_manifest, *args.patch]}
    report = {'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'source_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=args.repo, text=True).strip(),
              'expected': args.expect, 'passed': False, 'checks': [], 'observations': [],
              'case': args.case, 'container': args.container, 'image': args.image,
              'template': args.template, 'preparation_manifest': str(args.preparation_manifest),
              'provider_transport': False, 'production_mutations': False}
    database = 'creator_extended_' + uuid.uuid4().hex[:12]
    report['database'] = database
    owner = NativeSessions(args.container, database, args.evidence)

    def save():
        (args.evidence / 'result.json').write_text(json.dumps(report, indent=2) + '\n')

    def check(value, label):
        if not value:
            raise AssertionError(label)
        report['checks'].append(label)
        save()
        print('ok - ' + label, flush=True)

    def apply(name, source):
        run = subprocess.run(['docker', 'exec', '-i', args.container, 'psql', '-X', '-qAt',
            '-h', '/tmp', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1',
            '-v', 'VERBOSITY=verbose'], input=source, text=True, capture_output=True, timeout=90)
        (args.evidence / (name + '.log')).write_text(run.stdout + run.stderr)
        check(run.returncode == 0, name + ' applied')

    def run():
        inspection = json.loads(subprocess.check_output(['docker', 'inspect', args.container], text=True))[0]
        check(inspection['Image'] == args.image and inspection['State']['Running']
              and inspection['HostConfig']['NetworkMode'] == 'none' and not inspection['Mounts']
              and not inspection['HostConfig']['PortBindings'] and not inspection['NetworkSettings']['Ports'],
              'exact retained PostgreSQL container has no network, ports or host mounts')
        prepared = json.loads(args.preparation_manifest.read_text())
        keys = [name for name in prepared['sourceSHA256'] if name.startswith('supabase/migrations/')]
        check(keys and prepared['passed'] and all(hashlib.sha256((args.repo / name).read_bytes()).hexdigest()
              == prepared['sourceSHA256'][name] for name in keys), 'all template application migration bytes match final source')
        subprocess.run(['docker', 'exec', args.container, 'createdb', '-h', '/tmp', '-U', 'postgres',
                        '--template=' + args.template, database], check=True, capture_output=True, timeout=90)
        observer = owner.session('observer')
        check(observer.scalar('show server_version;') == '17.6', 'native PostgreSQL17.6')
        switches = "select jsonb_object_agg(key,state) from public.platform_money_kill_switches where key in('live_money_enabled','payouts_enabled');"
        check(json.loads(observer.scalar(switches)) == {'live_money_enabled': 'off', 'payouts_enabled': 'off'},
              'live money and payouts remain off')
        report['patches'] = []
        for patch in args.patch:
            report['patches'].append({'path': str(patch), 'sha256': hashlib.sha256(patch.read_bytes()).hexdigest()})
            apply(patch.stem, patch.read_text())
        apply('broadcast-fixture', (args.repo / 'tests/fixtures/event-broadcast-producer-authority.sql').read_text())
        if args.case == 'buyer-replay':
            check(args.expect == 'success', 'buyer-replay case qualifies the final repaired path')
            buyer_replay(owner, observer, args.repo, apply, check, report)
            check(json.loads(observer.scalar(switches)) == {'live_money_enabled': 'off', 'payouts_enabled': 'off'}, 'money switches unchanged')
            report['passed'] = True
            return
        if args.case == 'multi-event':
            multi_event(owner, observer, args.repo, apply, check, report, args.expect)
            check(json.loads(observer.scalar(switches)) == {'live_money_enabled': 'off', 'payouts_enabled': 'off'}, 'money switches unchanged')
            report['passed'] = True
            return
        if args.case in ['wallet-first','lifecycle-first']:
            wallet_event(owner,observer,args.repo,apply,check,report,args.case=='wallet-first')
            check(json.loads(observer.scalar(switches)) == {'live_money_enabled': 'off', 'payouts_enabled': 'off'}, 'money switches unchanged')
            report['passed']=True
            return
        fixture = (args.repo / 'tests/fixtures/event-replay-deadline-policy.sql').read_text()
        terminal = "  perform public.record_creator_event_broadcast_provider(event,host.user_id,host.session_id,(source->>'attemptId')::uuid,'EG_replay_deadline','COMPLETE',\n    source->>'privateOrigin'||'/'||(source->>'outputPrefix')||'/index.m3u8',source->>'outputPrefix'||'/index.m3u8',true,true);"
        check(fixture.count(terminal) == 1, 'fixture has one explicit terminal callback to schedule concurrently')
        apply('live-replay-fixture', fixture.replace(terminal, '  -- Terminal callback is scheduled by the native concurrency harness.'))
        context = json.loads(observer.scalar('select context from event_reservation_fixture.replay_deadline_context;'))
        event, source = context['eventId'], context['source']
        # The app request-save-replay endpoint can save this draft before the
        # terminal provider callback. Seed that reachable state with synthetic
        # ownership/broadcast identity; do not disable RLS or product triggers.
        observer.require("insert into public.creator_replay_library_items(owner_user_id,source_type,source_room_id,party_id,"
            "broadcast_session_id,title,visibility,rights_status,save_status,money_status,playback_record_id) "
            "select a.creator_id::text,'live_stage',a.party_id,a.party_id,a.broadcast_session_id,"
            "'Synthetic saved live replay','draft',a.rights_status,'ready','free',h.id "
            "from private.creator_event_broadcast_attempts a join public.spectator_hls_playback_records h "
            "on h.broadcast_session_id=a.broadcast_session_id where a.id=" + literal(source['attemptId']) + ';')
        replay = observer.scalar("select r.id from public.creator_replay_library_items r join private.creator_event_broadcast_attempts a "
            "on a.broadcast_session_id=r.broadcast_session_id where a.id=" + literal(source['attemptId']) + ';')
        check(replay is not None, 'saved draft belongs to the live provider attempt')
        if args.case == 'worker':
            observer.require("update private.creator_event_broadcast_stop_jobs set due_at=clock_timestamp()-interval '1 second' "
                             'where attempt_id=' + literal(source['attemptId']) + ';')
        gate_condition = ("new.broadcast_status='ended'" if args.case == 'provider-late' else "new.provider_status='COMPLETE'")
        gate_relation = ('after update on public.room_broadcast_sessions' if args.case == 'provider-late' else
                         'after insert on private.creator_event_broadcast_provider_receipts')
        observer.require("create function event_reservation_fixture.pause_terminal_receipt() returns trigger language plpgsql as $$"
            'begin if ' + gate_condition + ' then perform pg_advisory_xact_lock(2147483600,71); end if; return new; end;$$; '
            'create trigger zz_test_terminal_receipt_barrier ' + gate_relation + ' '
            'for each row execute function event_reservation_fixture.pause_terminal_receipt();')
        provider, creator = owner.session('provider'), owner.session('creator')
        observer.require('select pg_advisory_lock(2147483600,71);')
        provider.require('begin;')
        provider.service()
        creator.require('begin;')
        if args.case == 'worker':
            creator.service()
        else:
            creator.claim(context['hostId'], context['hostSession'])
        callback = 'select public.record_creator_event_broadcast_provider(' + ','.join(map(literal, [
            event, context['hostId'], context['hostSession'], source['attemptId'], 'EG_replay_deadline', 'COMPLETE',
            source['privateOrigin'] + '/' + source['outputPrefix'] + '/index.m3u8', source['outputPrefix'] + '/index.m3u8'])) + ',true,true);'
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            complete = pool.submit(provider.execute, callback)
            wait_for(lambda: complete.done() or has_edge(blockers(observer, [provider, creator]), provider, observer), 'terminal receipt barrier')
            check(not complete.done(), 'real provider callback waits at the receipt scheduling barrier')
            competing = ('select public.claim_due_creator_event_broadcast_stops(1);' if args.case == 'worker' else
                         "update public.creator_replay_library_items set visibility='draft' where id=" + literal(replay) + ' returning id;')
            edit = pool.submit(creator.execute, competing)
            wait_for(lambda: edit.done() or has_edge(blockers(observer, [provider, creator]), creator, provider), 'creator edit progress')
            report['observations'].append({'stage': 'receipt_and_creator', 'backends': blockers(observer, [provider, creator])})
            if args.expect == 'deadlock':
                check(not edit.done() and has_edge(report['observations'][-1]['backends'], creator, provider),
                      'competing operation holds its first resource and waits for provider')
                observer.require('select pg_advisory_unlock(2147483600,71);')
                wait_for(lambda: (complete.done() and complete.result()['sqlstate'] == '40P01')
                         or (edit.done() and edit.result()['sqlstate'] == '40P01')
                         or (has_edge(blockers(observer, [provider, creator]), provider, creator)), 'provider replay-row wait')
                report['observations'].append({'stage': 'cycle', 'backends': blockers(observer, [provider, creator])})
                check(has_edge(report['observations'][-1]['backends'], provider, creator)
                      and has_edge(report['observations'][-1]['backends'], creator, provider), 'reciprocal provider/competing-operation lock edges captured')
                wait_for(lambda: (complete.done() and complete.result()['sqlstate'] == '40P01')
                         or (edit.done() and edit.result()['sqlstate'] == '40P01'), 'native deadlock result')
                for future, session in [(complete, provider), (edit, creator)]:
                    if future.done() and future.result()['sqlstate'] == '40P01':
                        session.require('rollback;')
                results = [complete.result(timeout=30), edit.result(timeout=30)]
                check(sorted(r['sqlstate'] for r in results) == ['00000', '40P01'], 'exact native40P01 and successful survivor')
            else:
                if args.case in ['provider','provider-late']:
                    check(not edit.done() and has_edge(report['observations'][-1]['backends'],creator,provider),
                          'creator edit waits for provider replay-row reservation')
                    observer.require('select pg_advisory_unlock(2147483600,71);')
                    provider_result = complete.result(timeout=30)
                    check(provider_result['sqlstate'] == '00000', 'provider completes while creator waits without reciprocal dependency')
                    provider.require('commit;')
                    results = [provider_result, edit.result(timeout=30)]
                else:
                    check(edit.done() and edit.result()['sqlstate'] == '00000', 'competing operation completes without provider lock inversion')
                    if args.case == 'worker':
                        check(json.loads(edit.result()['rows'][-1]) == [], 'worker leaves the provider-owned attempt for safe later processing')
                    creator.require('commit;')
                    observer.require('select pg_advisory_unlock(2147483600,71);')
                    results = [complete.result(timeout=30), edit.result()]
                check(all(r['sqlstate'] == '00000' for r in results), 'provider completion and competing operation both succeed')
            for result, session in zip(results, [provider, creator]):
                if result['sqlstate'] == '00000':
                    session.require('commit;')
            report['outcomes'] = results
        if args.expect == 'success' and args.case == 'worker':
            check(observer.scalar("select state from private.creator_event_broadcast_stop_jobs where attempt_id="
                                  + literal(source['attemptId']) + ';') == 'complete', 'provider completion durably closes the stop job')
        check(json.loads(observer.scalar(switches)) == {'live_money_enabled': 'off', 'payouts_enabled': 'off'}, 'money switches unchanged')
        report['passed'] = True
    try:
        run()
    except Exception as error:
        report['error'] = {'type': type(error).__name__, 'message': str(error)}
        print(json.dumps(report['error']), flush=True)
    finally:
        try:
            owner.close()
        except Exception as error:
            report['passed'] = False
            report['cleanup_error'] = {'type': type(error).__name__, 'message': str(error)}
        changed = [name for name, value in source_hashes.items()
                   if digest(args.repo / name) != value]
        changed.extend(name for name, value in input_hashes.items() if digest(Path(name)) != value)
        report['source_or_input_changes_during_run'] = changed
        if changed:
            report['passed'] = False
        report['completed_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        save()
        manifest = {'schema_version': 1, 'source_head': report['source_head'],
                    'source_sha256': source_hashes, 'input_sha256': input_hashes,
                    'evidence_sha256': {path.name: digest(path) for path in sorted(args.evidence.iterdir())
                                       if path.is_file() and path.name != 'source-evidence-manifest.json'}}
        (args.evidence / 'source-evidence-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'passed': report['passed'], 'checks': len(report['checks']), 'database': database}), flush=True)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
