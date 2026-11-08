"""Actual local Auth/PostgREST/Edge + signed synthetic object HTTP fixture."""
import argparse,hashlib,http.client,json,os,re,secrets,select,socket,subprocess,sys,threading,time,traceback,urllib.error,urllib.request,uuid
from contextlib import contextmanager
from pathlib import Path
import runtime as f
from stack import Stack
HERE=Path(__file__).resolve().parent.parent
LOCAL=json.loads((HERE/'local-runtime.json').read_text())
PROCESS=LOG=None
FLAGS=['--cached-only','--no-remote','--deny-import','--no-config','--lock='+str(HERE/'deno.lock'),'--frozen','--node-modules-dir=none','--no-prompt']
@contextmanager
def held_sql(statement,commit=True):
    """Actual owned-db transaction; exact stdout readiness, bounded cleanup."""
    f.STACK.validate_resources();marker='held_'+uuid.uuid4().hex
    child=subprocess.Popen(f.DOCKER_ARGS+['exec','-i',f.DB,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],
      stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=f.STACK.env)
    ready=b'';diagnostics=b'';streams=[child.stdout,child.stderr]
    try:
        child.stdin.write(('begin;set local idle_in_transaction_session_timeout=\'15s\';'+statement+'\n\\echo '+marker+'\n').encode());child.stdin.flush()
        started=time.monotonic()
        while marker.encode() not in ready:
            for stream in select.select(streams,[],[],.1)[0]:
                chunk=os.read(stream.fileno(),65536)
                if not chunk:streams.remove(stream)
                elif stream is child.stdout:ready+=chunk
                else:diagnostics=(diagnostics+chunk)[-8192:]
            assert len(ready)<1048576
            if marker.encode() not in ready and (time.monotonic()-started>=10 or child.poll() is not None):
                raise AssertionError('Owned held transaction failed before readiness: '+f.STACK.redact(diagnostics.decode(errors='replace')))
        yield ready.decode()
        child.stdin.write(b'commit;\n' if commit else b'rollback;\n');child.stdin.close();child.stdin=None
        stdout,stderr=child.communicate(timeout=10);assert child.returncode==0,f.STACK.redact(stderr.decode())
    finally:
        if child.poll() is None:
            try:child.stdin.write(b'rollback;\n');child.stdin.close();child.stdin=None;child.communicate(timeout=3)
            except Exception:child.kill();child.communicate(timeout=3)
        assert child.poll() is not None,'Owned held SQL process did not stop'
def raw_put_response(path,headers,raw,port=59432):
    """One loopback PUT; an early rejection is proved by its actual response.

    urllib discards the connection if the peer rejects before the body finishes.
    Retain that same connection to read its response, never retry the mutation.
    """
    assert isinstance(raw,bytes) and len(raw)<=16777216
    assert path.startswith('/functions/v1/isolated-paid-video-') and '\r' not in path and '\n' not in path
    connection=http.client.HTTPConnection('127.0.0.1',port,timeout=8)
    timer=None
    try:
        connection.connect();transport=connection.sock
        def expire():
            try:transport.shutdown(socket.SHUT_RDWR)
            except OSError:pass
        timer=threading.Timer(8,expire);timer.daemon=True;timer.start()
        connection.putrequest('PUT',path)
        for name,value in headers.items():connection.putheader(name,value)
        connection.endheaders()
        try:connection.send(raw)
        except (BrokenPipeError,ConnectionResetError):pass
        # A write error supplies no status. Missing/malformed responses still fail.
        response=connection.getresponse()
        with response:
            body=response.read(1048577)
            if len(body)>1048576:raise AssertionError('Local Edge response exceeds limit')
            if response.length not in (None,0):raise http.client.IncompleteRead(body,response.length)
            return response.status,body,dict(response.headers.items())
    finally:
        if timer:timer.cancel()
        connection.close()
def edge(path,account=None,payload=None,method='POST',headers=None,raw=None):
    assert path.startswith(('/functions/v1/isolated-paid-video-','/__'))
    h={'apikey':f.CREDENTIALS['anonKey'],'content-type':'application/json'}
    if account:h['authorization']='Bearer '+account['token']
    h.update(headers or {})
    request=urllib.request.Request('http://127.0.0.1:59432'+path,data=raw if raw is not None else json.dumps(payload).encode() if payload is not None else None,headers=h,method=method)
    started=time.monotonic()
    if method=='PUT' and raw is not None:
        status,body,response_headers=raw_put_response(path,h,raw)
    else:
        try:
            response=f.OPENER.open(request,timeout=8);status,body,response_headers=response.status,response.read(),dict(response.headers.items())
        except urllib.error.HTTPError as error:status,body,response_headers=error.code,error.read(),dict(error.headers.items())
    parsed={'byteLength':len(body),'sha256':hashlib.sha256(body).hexdigest(),'headers':{key.lower():value for key,value in response_headers.items()}} if status==206 else json.loads(body)
    return status,parsed,round(time.monotonic()-started,4)
def stop():
    global PROCESS,LOG
    if PROCESS:
        pid=PROCESS.pid
        if PROCESS.poll() is None:
            PROCESS.terminate()
            try:PROCESS.wait(timeout=10)
            except subprocess.TimeoutExpired:PROCESS.kill();PROCESS.wait(timeout=5)
        f.STACK.write_public('edge-cleanup-proof.json',{'processId':pid,'processStopped':PROCESS.poll() is not None,'exitCode':PROCESS.returncode})
        PROCESS=None
    if LOG:
        LOG.flush();LOG.seek(0);body=LOG.read()[-14000:];file=Path(LOG.name);LOG.close();LOG=None
        f.STACK.write_public('edge-process-log.json',{'log':body});file.unlink()
def start(config):
    global PROCESS,LOG
    env={'PATH':os.environ['PATH'],'HOME':os.environ['HOME'],'DENO_NO_PACKAGE_JSON':'1',
      'SUPABASE_URL':f.API,'SUPABASE_ANON_KEY':f.CREDENTIALS['anonKey'],'SUPABASE_SERVICE_ROLE_KEY':f.CREDENTIALS['serviceRoleKey'],
      'PAID_VIDEO_GATEWAY_V2_ENABLED':'true','PAID_VIDEO_S3_ROUTE_ID':config['routeId'],'PAID_VIDEO_S3_BUCKET':'synthetic-local-video',
      'PAID_VIDEO_S3_REGION':'us-east-1','PAID_VIDEO_S3_ACCESS_KEY_ID':config['accessKeyId'],'PAID_VIDEO_S3_SECRET_ACCESS_KEY':config['originSecret'],
      'PAID_VIDEO_UPLOAD_VERIFIER_ID':config['verifierId'],'PAID_VIDEO_UPLOAD_VERIFIER_KEY_HEX':config['verifierKey']}
    LOG=open(f.ROOT/'edge-process.private.log','w+');os.chmod(LOG.name,0o600)
    args=[LOCAL['denoBinary'],'run',*FLAGS,'--allow-net=127.0.0.1:59431,127.0.0.1:59432,127.0.0.1:59433',
      '--allow-env='+','.join(k for k in env if k.startswith(('SUPABASE_','PAID_VIDEO_'))),str(HERE/'listener.ts')]
    PROCESS=subprocess.Popen(args,env=env,stdout=LOG,stderr=LOG,text=True)
    for attempt in range(40):
        if PROCESS.poll() is not None:raise RuntimeError('Actual Edge process exited before readiness; retained redacted log')
        try:
            ready=edge('/__ready',method='GET')
            if ready[0]==200:break
        except(ConnectionError,urllib.error.URLError,TimeoutError):pass
        if attempt==39:raise RuntimeError('Actual Edge readiness timeout')
        time.sleep(.2)
    bindings=subprocess.check_output(['lsof','-nP','-a','-p',str(PROCESS.pid),'-iTCP','-sTCP:LISTEN','-Fn'],text=True,timeout=10)
    addresses=sorted(line[1:]for line in bindings.splitlines()if line.startswith('n'))
    assert addresses==['127.0.0.1:59432','127.0.0.1:59433'],addresses
    assert ready[1]['permissions']['api']=='granted'
    assert all(ready[1]['permissions'][key]!='granted'for key in ['external','run','write'])
    f.STACK.write_public('edge-listener-proof.json',{'addresses':addresses,'permissions':ready[1]['permissions'],
      'entryImports':'four exact captured production entries','objectOrigin':'synthetic local SigV4/private conditional-put/version fixture',
      'externalNetworkAllowed':False,'permissionPromptsDisabled':True})
def qualify():
    accounts=json.loads((f.ROOT/'accounts.private.json').read_text());creator,buyer=accounts['creator'],accounts['buyer']
    q=f.quote;cases=[]
    def record(name,response,statuses=(200,)):
        status,body,elapsed=response;cases.append({'name':name,'httpStatus':status,'elapsedSeconds':elapsed,'response':body})
        f.STACK.write_public('http-qualification-proof.json',{'source':f.MANIFEST['source'],'cases':cases,'limitations':['Synthetic public/provider/native/route facts.','No provider or malware scanner qualification.']})
        assert status in statuses,(name,status,body);return body
    config={'routeId':str(uuid.uuid4()),'workerId':str(uuid.uuid4()),'verifierId':str(uuid.uuid4()),'workerKey':secrets.token_hex(32),'verifierKey':secrets.token_hex(32),
      'accessKeyId':'LOCAL'+secrets.token_hex(8).upper(),'originSecret':secrets.token_hex(32)}
    for key in ['workerKey','verifierKey','accessKeyId','originSecret']:f.STACK.secrets.add(config[key])
    f.private_write('edge.private.json',config)
    seed=subprocess.run(['node',str(HERE/'seed.mjs')],input=json.dumps({**config,'reviewerId':buyer['userId']}),capture_output=True,text=True,timeout=15)
    assert seed.returncode==0,f.STACK.redact(seed.stderr);seed=json.loads(seed.stdout);digest=seed['fixture']['configurationDigest']
    f.sql("grant sbx_v1_operator to postgres with set true;set role sbx_v1_operator;select sandbox_commerce_v1.transition('disabled','active');reset role;grant sbx_v1_operator to postgres with set false;",'postgres')
    source=(f.SOURCE/'tests/premium-authority.fixture.sql').read_text();premium=source.split('begin\n',1)[1].split('end;',1)[0]
    assert 'auth.'not in premium and 'create 'not in premium.lower()
    premium=re.sub(r'\bp_user\b',q(creator['userId'])+'::uuid',premium);f.sql('begin;'+premium+'commit;')
    declaration={'declared18Plus':True,'countryCode':'US','regionCode':'CA','declarationVersion':'adult-us-creator-v1'}
    record('Real creator session declares eligibility',f.rpc(creator,'creator.declare',declaration,'isolated_sandbox_commerce_v1'))
    f.sql(seed['sql']);config['operationsBinding']=seed['operationsBinding']
    config['expectedRecoveryTarget']=json.loads(f.sql(seed['recoveryTargetSql']));start(config)
    def settle(action,**fields):
        # The Stack has verified this exact nonce-owned database and local Unix
        # Docker endpoint; no SQL fixture process receives a remote target.
        f.STACK.validate_resources()
        environment={**f.STACK.env,'NODE_PATH':LOCAL['nodeModulesPath']}
        operation=subprocess.run(['node',str(HERE/'settlement.mjs')],input=json.dumps({'action':action,'database':f.DB,'dockerArgs':f.DOCKER_ARGS,**fields}),
          capture_output=True,text=True,timeout=120,env=environment)
        assert operation.returncode==0,f.STACK.redact(operation.stderr)
        return json.loads(operation.stdout)
    active_creator=creator;active_buyer=buyer
    def author(command,payload=None,account=None,expected=None,request_id=None):
        account=account or active_creator
        return edge('/functions/v1/isolated-paid-video-authoring-v2',account,{'protocol':'isolated-paid-video-v2','command':command,
          'requestId':request_id or str(uuid.uuid4()),'expectedSessionId':expected or account['sessionId'],'configurationDigest':digest,'payload':payload or {}})
    valid={'protocol':'isolated-paid-video-v2','command':'capability.read','requestId':str(uuid.uuid4()),'expectedSessionId':creator['sessionId'],'configurationDigest':digest,'payload':{}}
    record('Actual Auth verification rejects missing bearer',edge('/functions/v1/isolated-paid-video-authoring-v2',payload=valid),(401,))
    record('Expected session mismatch rejects before mutation',author('capability.read',expected=buyer['sessionId']),(401,))
    bad=dict(creator);pieces=bad['token'].split('.');pieces[2]=('A'if pieces[2][0]!='A'else'B')+pieces[2][1:];bad['token']='.'.join(pieces)
    record('Actual Auth rejects tampered JWT',author('capability.read',account=bad),(401,))
    assert record('Exact real creator session sees qualified synthetic route',author('capability.read'))['data']['transferAvailable']
    assert not record('Free buyer remains ineligible despite user_metadata',author('capability.read',account=buyer))['data']['creatorEligible']
    body=bytes([7])*(600*1024);reserve_id=str(uuid.uuid4());payload={'title':'Actual HTTP gateway bytes','expectedSha256':hashlib.sha256(body).hexdigest(),'expectedByteLength':len(body)}
    record('Free buyer cannot reserve',author('upload.reserve',payload,account=buyer),(503,))
    upload=record('Actual Auth/PostgREST reserves server-owned upload',author('upload.reserve',payload,request_id=reserve_id))['data']['upload']
    assert record('Exact original reserve recovers without creating another object',author('upload.recover',{'originalRequestId':reserve_id}))['data']['upload']['id']==upload['id']
    record('Finalize before verified receipt rejected',author('upload.finalize',{'uploadId':upload['id']}),(503,))
    transfer_id=str(uuid.uuid4());path='/functions/v1/isolated-paid-video-upload-v2/'+upload['id']
    def transfer(method='GET',payload=None,raw=None,account=None,request_id=transfer_id):
        account=account or active_creator
        headers={'x-chillywood-auth-session':account['sessionId'],'x-chillywood-request-id':request_id,'x-chillywood-native-configuration':digest}
        if method=='PUT':headers.update({'content-type':'video/mp4','content-length':str(len(body))})
        return edge(path,account,payload,method,headers,raw)
    edge('/__drop-next-put',payload={})
    assert record('Signed conditional PUT reaches real local HTTP origin; lost response stays unknown',transfer('PUT',raw=body))['state']=='unknown'
    assert record('Unknown PUT same identity does not resend',transfer('PUT',raw=body))['state']=='unknown'
    record('New request cannot replace original unknown transfer',transfer('PUT',raw=body,request_id=str(uuid.uuid4())),(503,))
    assert edge('/__state',method='GET')[1]['writes']==1
    descriptor=record('Owner discovers exact original transfer after losing local journal',author('upload.read',{'uploadId':upload['id']}))['data']['transfer']
    assert descriptor=={'requestId':transfer_id,'originalSessionId':creator['sessionId'],'configurationDigest':digest}
    status,session,_=f.http('/auth/v1/token?grant_type=password',data={'email':creator['email'],'password':creator['password']})
    assert status==200 and session.get('access_token');claim=f.claims(session['access_token'])
    assert claim['sub']==creator['userId'] and claim['session_id']!=creator['sessionId']
    active_creator={**creator,'sessionId':claim['session_id'],'token':session['access_token'],'refreshToken':session['refresh_token']}
    accounts['creatorSecond']=active_creator;f.private_write('accounts.private.json',accounts)
    f.sql('insert into public.wave1_legal_acceptances select '+q(creator['userId'])+','+q(active_creator['sessionId'])+",document_key,version,market,capability,'member',null from public.wave1_legal_document_versions;")
    record('New actual Auth session declares current creator eligibility',f.rpc(active_creator,'creator.declare',declaration,'isolated_sandbox_commerce_v1'))
    recovered=record('New actual Auth session recovers original transfer descriptor read-only',author('upload.read',{'uploadId':upload['id']}))
    assert recovered['data']['transfer']==descriptor and not recovered['data']['upload']['transferAvailable']
    probe=record('Read-only GET verifies actual full origin bytes and S3 version',transfer())
    assert probe['state']=='observed';assert f.sql('select count(*)from sandbox_commerce_v1.paid_video_object_receipts;')=='0'
    observation=json.loads(probe['observationRaw']);assert observation['sessionId']==active_creator['sessionId'] and observation['originalSessionId']==creator['sessionId']
    assert observation['originalConfigurationDigest']==digest
    assert not any(term in json.dumps(probe)for term in ['objectKey','bucket','https://','secret'])
    reconcile={'protocol':'scpv-reconcile-v2','observationRaw':probe['observationRaw'],'signature':probe['signature']}
    record('Forged probe signature rejected by actual SQL',transfer('POST',{**reconcile,'signature':'0'*64}),(503,))
    receipt=record('Explicit POST records exact verified object receipt',transfer('POST',reconcile))
    assert receipt['userId']==creator['userId']and receipt['originalSessionId']==creator['sessionId']
    assert record('Repeated exact POST returns durable receipt',transfer('POST',reconcile))==receipt
    reads=edge('/__state',method='GET')[1]['reads'];assert record('GET recovers receipt without another origin read',transfer())==receipt
    assert edge('/__state',method='GET')[1]['reads']==reads
    assert record('Receipt permits finalization to scan pending',author('upload.finalize',{'uploadId':upload['id']}))['data']['upload']['state']=='scan_pending'
    record('Receipt alone cannot publish without clean scan and moderation',author('offer.publish',{'uploadId':upload['id'],'expectedRevision':1,'amountMinor':199,'currency':'usd'}),(503,))
    fake_grant='scv1_grant_'+str(uuid.uuid4())
    record('Actual authenticated range denies missing grant before origin',edge('/functions/v1/isolated-paid-video-range-v1/'+upload['resourceId']+'/'+fake_grant,buyer,method='GET',headers={'x-chillywood-auth-session':buyer['sessionId'],'range':'bytes=0-99'}),(403,503))
    assert edge('/__state',method='GET')[1]['reads']==reads
    binding=seed['operationsBinding'];lease_id=str(uuid.uuid4())
    lease_raw=json.dumps({'protocol':'scpv-operations-request-v1','requestId':lease_id,'command':'lease','binding':binding,'uploadId':upload['id']},separators=(',',':'))
    ops=lambda action,raw:f.http('/rest/v1/rpc/isolated_paid_video_operations_v1',f.CREDENTIALS['serviceRoleKey'],{'p_action':action,'p_raw':raw})
    lease=record('Actual service PostgREST operations obtains exact private scan lease',ops('execute',lease_raw));assert lease['result']['state']=='leased'
    assert record('Actual service PostgREST recovers lease without another ticket',ops('recover',lease_raw))==lease
    signed=settle('sign_scan',upload=upload,receipt=receipt,config=config,ticket=lease['result']['ticket'])
    result_raw=json.dumps({'protocol':'scpv-operations-request-v1','requestId':str(uuid.uuid4()),'command':'result','binding':binding,'leaseRequestId':lease_id,'raw':signed['raw'],'signature':signed['signature']},separators=(',',':'))
    scan_result=record('Actual service PostgREST records explicitly synthetic signed scanner evidence',ops('execute',result_raw))
    assert record('Actual service PostgREST recovers exact scan result read-only',ops('recover',result_raw))==scan_result
    review_base={'protocol':'scpv-review-request-v1','requestId':str(uuid.uuid4()),'reviewerId':buyer['userId'],'sessionId':buyer['sessionId'],'uploadId':upload['id']}
    review=lambda action,body,account=buyer:f.http('/rest/v1/rpc/isolated_paid_video_review_v1',account['token'],{'p_action':action,'p_raw':json.dumps(body,separators=(',',':'))})
    snapshot=record('Real allowed reviewer session inspects exact scanned object',review('inspect',review_base))
    decision={**review_base,'requestId':str(uuid.uuid4()),'snapshot':snapshot,'decision':'clear','evidenceSha256':'8'*64,'reviewedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'humanReviewConfirmed':True}
    record('Real reviewer RPC rejects missing explicit human confirmation',review('decide',{**decision,'humanReviewConfirmed':False}),(400,403))
    accepted=record('Real reviewer RPC accepts explicitly synthetic human review evidence',review('decide',decision));assert accepted['decision']=='clear'
    assert record('Real reviewer RPC recovers exact moderation decision',review('recover',decision))==accepted
    f.STACK.write_public('synthetic-scanner-boundary.json',{'scannerEvidence':'explicitly synthetic signed fixture through actual operations service PostgREST','moderation':'explicitly synthetic human confirmation through actual authenticated reviewer RPC'})
    offer=record('Actual authoring HTTP publishes exact receipt and synthetic scanner evidence',author('offer.publish',{'uploadId':upload['id'],'expectedRevision':1,'amountMinor':199,'currency':'usd'}))['data']['offer']
    def checkout_http(command,values,account=None,expected=None,request_id=None,configuration=None):
        account=account or active_buyer
        return edge('/functions/v1/isolated-paid-video-checkout-v3',account,{'protocol':'isolated-paid-video-checkout-v3','command':command,
          'requestId':request_id or str(uuid.uuid4()),'expectedSessionId':expected or account['sessionId'],'configurationDigest':configuration or digest,'payload':values})
    current=record('Fourth authenticated Edge checkout reads exact verified gateway media',checkout_http('offer',{'offerId':offer['id']}))
    assert current['data']['preparationAllowed'] is True
    intents_before=f.sql('select count(*) from sandbox_commerce_v1.intents;')
    f.sql('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;')
    assert record('Disabled gateway suppresses actual PostgREST offer readiness',checkout_http('offer',{'offerId':offer['id']}))['data']['preparationAllowed'] is False
    record('Disabled gateway refuses authenticated Edge preparation',checkout_http('prepare',{'offerId':offer['id'],'expectedQuote':current['data']['quote']}),(503,))
    f.sql('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true;')
    f.sql('update sandbox_commerce_v1.paid_video_verifiers set active=false where id='+q(config['verifierId'])+';')
    assert record('Retired exact receipt verifier suppresses actual PostgREST offer readiness',checkout_http('offer',{'offerId':offer['id']}))['data']['preparationAllowed'] is False
    record('Retired verifier refuses authenticated Edge preparation',checkout_http('prepare',{'offerId':offer['id'],'expectedQuote':current['data']['quote']}),(503,))
    assert f.sql('select count(*) from sandbox_commerce_v1.intents;')==intents_before
    f.sql('update sandbox_commerce_v1.paid_video_verifiers set active=true where id='+q(config['verifierId'])+';')
    quote=current['data']['quote']
    def prepare_context(name,account=None,customer=None,check_readiness=False):
        account=account or active_buyer;request_id=str(uuid.uuid4())
        prepared=record(name+' prepares through actual Edge',checkout_http('prepare',{'offerId':offer['id'],'expectedQuote':quote},account=account,request_id=request_id))
        recovered=record(name+' recovers exact original HTTP preparation',checkout_http('recover',{'originalRequestId':request_id},account=account))
        assert recovered['data']['originalSessionId']==account['sessionId'] and recovered['data']['intent']['id']==prepared['data']['intent']['id']
        context=settle('allocate',actor={'userId':account['userId'],'sessionId':account['sessionId']},intent=prepared['data']['intent'],quote=quote,customer=customer,checkReadiness=check_readiness)
        context['prepareRequestId']=request_id;return context
    def close_payload(context):
        return {'customerBindingId':context['customer']['id'],'intentId':context['intent']['id'],'dispatchId':context['allocation']['dispatchId'],
          'registrationId':context['allocation']['registration']['id'],'originalSessionId':context['actor']['sessionId'],
          'expectedReservationRevision':context['reservation']['revision'],'expectedQuote':context['quote']}
    record('Fourth Edge rejects mismatched real current session',checkout_http('offer',{'offerId':offer['id']},expected=creator['sessionId']),(401,))
    closure_context=prepare_context('Unclaimed registered closure')
    close_request=str(uuid.uuid4());close_body=close_payload(closure_context)
    assert record('Missing closure recovery is unknown rather than no claim',checkout_http('recover_close_prepared',{'originalRequestId':close_request}))['status']=='unknown'
    closed=record('Authenticated Edge closes exact registered allocation before any claim',checkout_http('close_prepared',close_body,request_id=close_request))
    assert closed['data']['closure']['claimAbsent'] and closed['data']['intent']['receipt'] is None
    assert closed['data']['closure']['releasedReservationRevision']==close_body['expectedReservationRevision']+1
    assert settle('claim',context=closure_context,mustReject=True)=={'rejected':True,'dispatchAttempts':0}
    recovered_close=record('Read-only HTTP closure recovery preserves original request and session',checkout_http('recover_close_prepared',{'originalRequestId':close_request}))
    assert recovered_close['data']['closure']==closed['data']['closure'] and recovered_close['data']['originalPayload']==close_body
    replacement=prepare_context('Replacement reservation',customer=closure_context['customer'])
    reservation_before=f.sql('select row_to_json(r) from sandbox_commerce_v1.test_store_v3_reservations r where customer_id='+q(closure_context['customer']['id'][14:])+';')
    status,session,_=f.http('/auth/v1/token?grant_type=password',data={'email':buyer['email'],'password':buyer['password']})
    assert status==200 and session.get('access_token');claim=f.claims(session['access_token']);assert claim['sub']==buyer['userId'] and claim['session_id']!=buyer['sessionId']
    active_buyer={**buyer,'sessionId':claim['session_id'],'token':session['access_token'],'refreshToken':session['refresh_token']};accounts['buyerSecond']=active_buyer;f.private_write('accounts.private.json',accounts)
    f.sql('insert into public.wave1_legal_acceptances select '+q(buyer['userId'])+','+q(active_buyer['sessionId'])+",document_key,version,market,capability,'member',null from public.wave1_legal_document_versions;")
    new_close_request=str(uuid.uuid4())
    reack=record('New actual buyer session explicitly re-acks immutable original closure',checkout_http('close_prepared',close_body,request_id=new_close_request))
    assert reack['data']['replayed'] and reack['data']['closure']==closed['data']['closure']
    assert f.sql('select row_to_json(r) from sandbox_commerce_v1.test_store_v3_reservations r where customer_id='+q(closure_context['customer']['id'][14:])+';')==reservation_before
    second_recovery=record('New close actor session remains distinct from original allocation session',checkout_http('recover_close_prepared',{'originalRequestId':new_close_request}))
    assert second_recovery['data']['originalSessionId']==active_buyer['sessionId'] and second_recovery['data']['originalPayload']['originalSessionId']==buyer['sessionId']
    record('Same original close request cannot be rebound to a new session',checkout_http('close_prepared',close_body,request_id=close_request),(503,))
    original_recovery=record('Current buyer session reads retained first-session preparation',checkout_http('recover',{'originalRequestId':replacement['prepareRequestId']}))
    assert original_recovery['data']['originalSessionId']==buyer['sessionId']
    claim_values={'intentId':replacement['intent']['id'],'dispatchId':replacement['allocation']['dispatchId'],'registrationId':replacement['allocation']['registration']['id'],'expectedQuote':quote}
    claim_sql="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';select public.isolated_test_store_command_v3("+','.join([q(buyer['userId']),q(buyer['sessionId']),q('claim'),q(str(uuid.uuid4())),q(digest),q(json.dumps(claim_values))+'::jsonb'])+');'
    with held_sql(claim_sql) as ready:
        assert '"dispatchAllowed": true' in ready
        denied=record('Held actual claim transaction makes authenticated HTTP close uncertain',checkout_http('close_prepared',close_payload(replacement)),(503,));assert denied['outcome']=='unknown'
    record('Committed historical claim permanently refuses unclaimed HTTP closure',checkout_http('close_prepared',close_payload(replacement)),(503,))
    assert f.sql('select count(*) from sandbox_commerce_v1.test_store_v3_prepared_closures where intent_id='+q(replacement['intent']['id'][12:])+';')=='0'
    assert f.sql('select count(*) from sandbox_commerce_v1.dispatch_attempts where intent_id='+q(replacement['intent']['id'][12:])+';')=='1'
    purchase_context=prepare_context('First real HTTP purchase intent',check_readiness=True)
    purchase=settle('purchase',context=purchase_context,checkReadiness=True)
    grant=purchase['grantId'];f.private_write('purchase.private.json',purchase)
    f.STACK.write_public('settlement-boundary-proof.json',{'grantId':grant,'quote':purchase['quote'],'provider':purchase['provider'],'rawReceipt':purchase['rawReceipt'],
      'economicReadinessChecks':purchase['economicReadinessChecks']})
    range_path='/functions/v1/isolated-paid-video-range-v1/'+upload['resourceId']+'/'+grant
    def play(account=None,session=None,path=range_path,range_value='bytes=0-0'):
        account=account or active_buyer
        return edge(path,account,method='GET',headers={'x-chillywood-auth-session':session or account['sessionId'],'range':range_value})
    before=int(time.time()*1000)
    played=record('Actual Auth SQL receipt grant and signed HTTP range return exact first-byte metadata',play(),(206,))
    public=played['headers'];assert played['byteLength']==1 and played['sha256']==hashlib.sha256(body[:1]).hexdigest()
    expected={'x-chillywood-media-protocol':'scpv-range-metadata-v2','x-chillywood-resource-id':upload['resourceId'],'x-chillywood-grant-id':grant,
      'x-chillywood-asset-id':upload['assetId'],'x-chillywood-incarnation':upload['incarnation'],'x-chillywood-sha256':payload['expectedSha256'],
      'x-chillywood-byte-length':str(len(body)),'x-chillywood-resource-revision':'1','x-chillywood-profile':'scpv-mp4-h264-aac-v1',
      'content-range':'bytes 0-0/'+str(len(body)),'content-length':'1','content-type':'video/mp4','accept-ranges':'bytes','cache-control':'private, no-store, max-age=0'}
    assert all(public.get(key)==value for key,value in expected.items()),public
    deadline=int(public['x-chillywood-authorized-until-ms']);after=int(time.time()*1000)
    assert after<deadline<=after+5000,{'clientStartedAtMs':before,'clientReceivedAtMs':after,'serverAuthorizedUntilMs':deadline}
    f.STACK.write_public('range-deadline-proof.json',{'clientStartedAtMs':before,'clientReceivedAtMs':after,'serverAuthorizedUntilMs':deadline,
      'remainingMilliseconds':deadline-after,'note':'Server deadline begins after request arrival; client send time is not the server start clock.'})
    assert all(key in public['access-control-expose-headers'].lower() for key in expected if key.startswith('x-chillywood-'))
    assert not any(term in json.dumps(public) for term in ['objectKey','bucket','amazonaws','secret'])
    reads=edge('/__state',method='GET')[1]['reads']
    record('Range rejects other real actor using same grant before origin',play(account=active_creator),(403,503))
    record('Range rejects mismatched current session before origin',play(session=creator['sessionId']),(401,))
    record('Range rejects changed resource identity before origin',play(path='/functions/v1/isolated-paid-video-range-v1/scv1_resource_'+str(uuid.uuid4())+'/'+grant),(403,503))
    record('Range rejects unsatisfiable request before origin',play(range_value='bytes=614400-614410'),(403,))
    assert edge('/__state',method='GET')[1]['reads']==reads
    bounded=record('Oversized range is bounded to exactly 512KiB by actual transport',play(range_value='bytes=0-614399'),(206,))
    assert bounded['byteLength']==524288 and bounded['sha256']==hashlib.sha256(body[:524288]).hexdigest()
    assert bounded['headers']['content-range']=='bytes 0-524287/614400' and bounded['headers']['content-length']=='524288'
    reads=edge('/__state',method='GET')[1]['reads']
    # Expire an existing genuine GoTrue session; never create a synthetic Auth row.
    prior_not_after=f.sql('select coalesce(not_after::text,\'\') from auth.sessions where id='+q(active_buyer['sessionId'])+';')
    f.sql('update auth.sessions set not_after=clock_timestamp()-interval \'1 second\' where id='+q(active_buyer['sessionId'])+';')
    record('Expired genuine Auth session denies current range with unexpired JWT',play(),(401,403))
    assert f.claims(active_buyer['token'])['exp']>time.time()+30 and edge('/__state',method='GET')[1]['reads']==reads
    f.sql('update auth.sessions set not_after='+('null' if not prior_not_after else q(prior_not_after)+'::timestamptz')+' where id='+q(active_buyer['sessionId'])+';')
    assert settle('advance',context=purchase)['status']=='released'
    second_context=prepare_context('Second same-resource purchase',customer=purchase['customer'])
    second_purchase=settle('purchase',context=second_context)
    assert purchase['grantId']!=second_purchase['grantId']
    def resolve(context,name,account=None):
        response=record(name,checkout_http('resolve_playback',{'intentId':context['intent']['id']},account=account))
        assert response['data']['intent']['id']==context['intent']['id'] and response['data']['accessRequiresCurrentAuthorization'] is True
        assert set(response['data'])=={'intent','currentGrantId','accessRequiresCurrentAuthorization'}
        return response['data']
    first_resolution=resolve(purchase,'Actual fourth Edge resolves authoritative grant for first retained receipt')
    second_resolution=resolve(second_purchase,'Second receipt resolves same authoritative current grant')
    selected=first_resolution['currentGrantId'];assert selected==second_resolution['currentGrantId'] and selected in [purchase['grantId'],second_purchase['grantId']]
    chosen,other=(purchase,second_purchase) if selected==purchase['grantId'] else (second_purchase,purchase)
    assert other['grantId']!=selected
    assert resolve(other,'Historical nonselected receipt resolves a different current grant')['intent']['grantId']==other['grantId']
    reads=edge('/__state',method='GET')[1]['reads']
    record('Historical nonselected grant stays denied by unchanged range authority',play(path='/functions/v1/isolated-paid-video-range-v1/'+upload['resourceId']+'/'+other['grantId']),(403,503))
    assert edge('/__state',method='GET')[1]['reads']==reads
    record('Authoritative selected grant reaches actual private origin',play(path='/functions/v1/isolated-paid-video-range-v1/'+upload['resourceId']+'/'+selected),(206,))
    record('Creator cannot resolve another buyer intent',checkout_http('resolve_playback',{'intentId':purchase['intent']['id']},account=active_creator),(503,))
    record('Resolver rejects mismatched current Auth session',checkout_http('resolve_playback',{'intentId':purchase['intent']['id']},expected=creator['sessionId']),(401,))
    for table,column in [('paid_video_gateway_controls','enabled'),('paid_video_verifiers','active')]:
        where='' if table=='paid_video_gateway_controls' else ' where id='+q(config['verifierId'])
        f.sql('update sandbox_commerce_v1.'+table+' set '+column+'=false'+where+';')
        try:assert resolve(purchase,'Current '+table+' loss suppresses resolver selection')['currentGrantId'] is None
        finally:f.sql('update sandbox_commerce_v1.'+table+' set '+column+'=true'+where+';')
    assert settle('refund',event=chosen['event'])=={'state':'refunded'}
    retained=resolve(chosen,'Refunded historical receipt resolves another exact valid owned grant')
    assert retained['intent']['receipt']['state']=='refunded' and retained['currentGrantId']==other['grantId']
    reads=edge('/__state',method='GET')[1]['reads']
    record('Refunded selected grant is denied before origin',play(path='/functions/v1/isolated-paid-video-range-v1/'+upload['resourceId']+'/'+selected),(403,503))
    assert edge('/__state',method='GET')[1]['reads']==reads
    record('Remaining verified grant still reaches private range',play(path='/functions/v1/isolated-paid-video-range-v1/'+upload['resourceId']+'/'+other['grantId']),(206,))
    assert settle('refund',event=other['event'])=={'state':'refunded'}
    assert resolve(purchase,'Both receipts refunded leaves no current grant')['currentGrantId'] is None
    reads=edge('/__state',method='GET')[1]['reads']
    record('All raw refunds suppress original range before origin',play(),(403,503))
    assert edge('/__state',method='GET')[1]['reads']==reads
    target=config['expectedRecoveryTarget']
    def pending(expected=target,limit=16,token=None):
        return f.http('/rest/v1/rpc/isolated_test_store_capture_pending_v3',token or f.CREDENTIALS['serviceRoleKey'],{'p_expected_target':expected,'p_after':None,'p_limit':limit})
    def reconcile_ingress(ingress,expected=target,token=None):
        return f.http('/rest/v1/rpc/isolated_test_store_capture_reconcile_v3',token or f.CREDENTIALS['serviceRoleKey'],{'p_expected_target':expected,'p_ingress_id':ingress})
    assert record('Actual service pending recovery begins empty',pending())['rows']==[]
    record('Authenticated buyer cannot inspect service recovery queue',pending(token=active_buyer['token']),(401,403,404))
    record('Actual service pending recovery rejects unbounded limit',pending(limit=33),(400,))
    bad_target={**target,'installationId':str(uuid.uuid4())}
    record('Actual service queue rejects another installation witness',pending(expected=bad_target),(403,))
    deferred_context=prepare_context('Deferred exact receipt recovery')
    deferred_context=settle('claim',context=deferred_context)
    lock_sql='select project_id from rc_qualification_capture_v1.project_reservations where project_id='+q(target['projectId'])+' for update;'
    with held_sql(lock_sql) as ready:
        assert target['projectId'] in ready
        deferred=settle('ingest',context=deferred_context)
        pending_body=record('Held capture project retains discoverable actual authenticated receipt',pending(limit=1))
        assert pending_body['target']==target and not pending_body['authorityGranted']
        assert len(pending_body['rows'])==1 and pending_body['rows'][0]['ingressId']==deferred['ingressId']
        assert pending_body['nextCursor']==deferred['ingressId']
        still_pending=record('Actual service reconciliation remains deferred while project lock is held',reconcile_ingress(deferred['ingressId']))
        assert still_pending['target']==target and not still_pending['authorityGranted']
        assert f.sql('select count(*) from sandbox_commerce_v1.test_store_v3_effects where ingress_id='+q(deferred['ingressId'])+';')=='0'
    record('Authenticated buyer cannot execute receipt reconciliation',reconcile_ingress(deferred['ingressId'],token=active_buyer['token']),(401,403,404))
    record('Wrong source witness cannot project retained receipt',reconcile_ingress(deferred['ingressId'],expected={**target,'sourceSha256':'0'*64}),(403,))
    assert f.sql('select count(*) from sandbox_commerce_v1.test_store_v3_effects where ingress_id='+q(deferred['ingressId'])+';')=='0'
    projected=record('Actual service recovers retained receipt after exact project lock release',reconcile_ingress(deferred['ingressId']))
    assert projected['target']==target and not projected['authorityGranted']
    deferred_purchase=settle('effect',context=deferred_context,ingressId=deferred['ingressId'],event=deferred['event'])
    record('Repeated actual reconciliation cannot create a second effect',reconcile_ingress(deferred['ingressId']))
    assert f.sql('select count(*) from sandbox_commerce_v1.test_store_v3_effects where ingress_id='+q(deferred['ingressId'])+';')=='1'
    assert f.sql('select count(*) from sandbox_commerce_v1.test_store_v3_capture_deferred where ingress_id='+q(deferred['ingressId'])+';')=='1'
    envelope=f.sql('select envelope::text from sandbox_commerce_v1.test_store_v3_ingress where id='+q(deferred['ingressId'])+';')
    assert hashlib.sha256(envelope.encode()).hexdigest()==deferred['retainedEnvelopeSha256']
    assert record('Resolved recovery queue is empty while immutable evidence remains',pending())['rows']==[]
    assert resolve(deferred_purchase,'Reconciled receipt becomes visible through actual current-grant Edge')['currentGrantId']==deferred_purchase['grantId']
    record('Reconciled current grant reaches unchanged private range gate',play(path='/functions/v1/isolated-paid-video-range-v1/'+upload['resourceId']+'/'+deferred_purchase['grantId']),(206,))
    assert settle('refund',event=deferred_purchase['event'])=={'state':'refunded'}
    assert resolve(deferred_purchase,'Reconciled receipt refund removes current grant')['currentGrantId'] is None
    for name,args in [('isolated_paid_video_v1',{'p_command':'capability.read','p_payload':{},'p_expected_account_id':creator['userId'],'p_expected_session_generation':creator['sessionId']}),
      ('isolated_paid_video_upload_v1',{'p_action':'issue','p_upload_id':upload['id'][12:],'p_user_id':creator['userId'],'p_session_id':creator['sessionId'],'p_request_id':transfer_id}),
      ('isolated_paid_video_access_v3',{'p_user_id':buyer['userId'],'p_session_id':buyer['sessionId'],'p_resource_id':upload['resourceId'][14:],'p_grant_id':fake_grant[11:]})]:
        for role,token in [('authenticated',creator['token']),('service',f.CREDENTIALS['serviceRoleKey'])]:
            record('Old bypass '+name+' denied to '+role,f.http('/rest/v1/rpc/'+name,token,args),(401,403,404))
    generic={'p_user':buyer['userId'],'p_session':buyer['sessionId'],'p_product':upload['resourceId'][14:],'p_product_revision':1,
      'p_target':upload['resourceId'][14:],'p_target_revision':1,'p_action':'play_video'}
    record('Generic delivery has no public PostgREST RPC',f.http('/rest/v1/rpc/authorize_resource_delivery',f.CREDENTIALS['serviceRoleKey'],generic),(404,))
    record('Service cannot expose private generic delivery schema',f.http('/rest/v1/rpc/authorize_resource_delivery',f.CREDENTIALS['serviceRoleKey'],generic,
      extra_headers={'Content-Profile':'sandbox_commerce_v1'}),(406,))
    denied=False
    try:f.sql("set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';select sandbox_commerce_v1.authorize_resource_delivery("+
      ','.join([q(buyer['userId']),q(buyer['sessionId']),q(upload['resourceId'][14:]),'1',q(upload['resourceId'][14:]),'1',q('play_video')])+');')
    except RuntimeError as error:denied='permission denied' in str(error)
    assert denied,'Direct service-role generic delivery must remain private'
    f.STACK.write_public('generic-delivery-isolation-proof.json',{'privateServiceExecutionDenied':True,'publicRpcAbsent':True,'privateSchemaNotExposed':True,
      'coreOwnerStillOwnsPrivateGraph':f.sql("select has_function_privilege('sbx_v1_core_owner','sandbox_commerce_v1.authorize_resource_delivery(uuid,uuid,uuid,bigint,uuid,bigint,text)','EXECUTE');")=='t'})
    logout=f.http('/auth/v1/logout?scope=local',active_creator['token'],method='POST');assert logout[0]in(200,204)
    assert f.claims(active_creator['token'])['exp']>time.time()+30
    record('Revoked but unexpired actual Auth session rejected by gateway',author('capability.read'),(401,))
    record('Revoked session cannot recover upload bytes or receipt',transfer(),(401,))
    assert f.sql('select count(*)from public.user_entitlements where user_id='+q(buyer['userId'])+';')=='0'
    assert f.sql("select bool_and(state='off') from public.platform_money_kill_switches;")=='t'
    f.STACK.write_public('final-gateway-proof.json',{'cases':len(cases),'source':f.MANIFEST['source'],'actualAuth':True,'actualPostgREST':True,
      'actualGatewayEntries':4,'actualLocalOriginHttp':True,'providerOrigin':'synthetic','liveMoneyOff':True,'freeBuyerRemainsFree':True,'originRequests':edge('/__state',method='GET')[1]})
    print(str(len(cases))+' actual HTTP gateway cases passed',flush=True)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--cleanup',type=Path);parser.add_argument('--evidence-root',type=Path);parser.add_argument('--run-id');args=parser.parse_args()
    if args.cleanup:
        if args.evidence_root is not None or args.run_id is not None:parser.error('Cleanup cannot include a new-run identity')
        stack=Stack(args.cleanup)
    else:
        if args.evidence_root is None or args.run_id is None:parser.error('Caller-owned --evidence-root and --run-id are required')
        stack=Stack(evidence_root=args.evidence_root,run_id=args.run_id)
    print('Local gateway evidence directory: '+str(stack.root),flush=True)
    if args.cleanup:stack.cleanup();return 0
    failure=None;clean=False
    try:
        stack.prepare();f.configure(stack);stack.start_database();f.configure_services();stack.start_services();f.verify();f.install();f.accounts();qualify();stop();f.close_sessions();stack.assert_harness_source()
    except Exception as error:
        failure=stack.redact(str(error) or type(error).__name__);stack.write_public('failure.json',{'error':failure,'type':type(error).__name__,'traceback':stack.redact(traceback.format_exc())})
        try:stack.capture_failure_logs()
        except Exception:pass
    finally:
        try:stop()
        except Exception as error:failure=failure or stack.redact(str(error))
        try:clean=stack.cleanup()
        except Exception as error:failure=failure or stack.redact(str(error))
    result={'status':'passed'if failure is None and clean else'failed','evidenceDirectory':str(stack.root),'runId':stack.run_id,'cleanupVerified':clean,'error':failure}
    stack.write_public('summary.json',result);print(json.dumps(result),flush=True);return 0 if result['status']=='passed'else 1
if __name__=='__main__':sys.exit(main())
