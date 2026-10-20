import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {loadStubbed} from './customer-experience-adversarial-helpers.mjs';

// Execute both actual production modules through the repository's Node 20
// TypeScript loader. Only transport is supplied by the database harness below.
const exactSubjectAuthority=loadStubbed('supabase/functions/_shared/exact-subject-authority.ts');
const {PERMISSION_TEMPLATES, mutatePermissionTemplate, readPermissionTemplateTarget}=
  loadStubbed('supabase/functions/_shared/staff-permission-templates.ts',{
    './exact-subject-authority.ts':exactSubjectAuthority,
  });

const uid=n=>`a7100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sid=n=>`a7200000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const email=n=>`template-${n}@example.test`;
const source=readFileSync('supabase/functions/admin-owner-controls/index.ts','utf8');
const syntax=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
function declaration(name) {
  for(const statement of syntax.statements) if(ts.isVariableStatement(statement)) {
    for(const item of statement.declarationList.declarations) if(item.name.getText(syntax)===name) return item.initializer.getText(syntax);
  }
  throw new Error(`Missing production declaration ${name}`);
}
const edgeNames=['CORS_HEADERS','JSON_HEADERS','toText','isRecord','json','normalizeEmail','redactText','requireReason',
  'hasAnyPermission','resolveAdminReason','resolveExpiresAt','templateApply','templateRevoke'];
const edgeCode=ts.transpileModule(edgeNames.map(name=>`const ${name}=${declaration(name)};`).join('\n')+
  '\nObject.assign(exports,{templateApply,templateRevoke});',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;

test('production Edge templates execute atomic PostgreSQL grants and required audits', {timeout:240_000}, async()=>{
  const {db,replayReport}=await createDatabase({applyRepair:true,includeHeldStudio:true});
  let calls=0;
  const claims=async(n,session=sid(n))=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid(n),email:email(n),role:'authenticated',session_id:session})]);
  };
  const rpc=async(n,args)=>{
    await claims(n);
    await db.exec('set role authenticated');
    try { return (await db.query('select public.admin_mutate_staff_permission_template($1,$2,$3,$4,$5,$6,$7) as result',args)).rows[0].result; }
    finally {await db.exec('reset role');}
  };
  const args=(operation='apply',target=3,key='moderator',expiry=null)=>[operation,email(target),uid(target),key,'Synthetic template reason',expiry,null];
  const grants=async(target=3)=>(await db.query('select * from public.platform_staff_permission_grants where target_user_id=$1 order by id',[uid(target)])).rows;
  const snapshot=async()=> (await db.query(`select jsonb_build_object(
    'grants',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]') from public.platform_staff_permission_grants g),
    'audits',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.platform_admin_audit_logs a),
    'breakGlass',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.platform_break_glass_audit a)) as result`)).rows[0].result;
  const grant=async(n,key,expiry=null)=>db.query(`insert into public.platform_staff_permission_grants
    (target_user_id,target_email,permission_key,status,reason,expires_at) values($1,$2,$3,'active','Synthetic scope', $4)`,[uid(n),email(n),key,expiry]);
  // Real production Edge declarations and helper imports, with database-backed
  // transport only. Service-client writes throw, so bypassing the RPC fails.
  const admin={
    auth:{admin:{getUserById:async(id)=>({data:{user:(await db.query('select * from auth.users where id=$1',[id])).rows[0]},error:null})}},
    from(table){
      assert.equal(table,'platform_role_memberships');
      const filters=[];const params=[];
      return {
        select(){return this;},
        eq(column,value){assert.ok(['role','status'].includes(column));params.push(value);filters.push(`${column}=$${params.length}`);return this;},
        ilike(column,value){assert.equal(column,'email');params.push(value);filters.push(`email ilike $${params.length}`);return this;},
        async limit(){return {data:(await db.query(`select * from public.platform_role_memberships where ${filters.join(' and ')}`,params)).rows,error:null};},
      };
    },
  };
  const scope={exports:{},Response,Date,Set,PERMISSION_TEMPLATES,readPermissionTemplateTarget,mutatePermissionTemplate,
    normalizePermission:value=>value,writePlatformAudit:async()=>{throw new Error('Unexpected Edge success audit');}};
  vm.runInNewContext(edgeCode,scope);
  const edge=async(n,operation='apply',target=3,key='moderator',expiry=null)=>{
    const actor={rpc:async(name,parameters)=>{
      calls++; assert.equal(name,'admin_mutate_staff_permission_template');
      try {return {data:await rpc(n,[parameters.p_operation,parameters.p_target_email,parameters.p_target_user_id,parameters.p_template_key,
        parameters.p_reason,parameters.p_expires_at,parameters.p_security_context_id]),error:null};}
      catch(error){return {data:null,error};}
    }};
    return scope.exports[operation==='apply'?'templateApply':'templateRevoke'](admin,actor,
      {id:uid(n),email:email(n),role:n===1?'owner':'operator',permissions:new Set(['staff_permission_templates']),activeBreakGlassSessionId:null},
      {targetEmail:email(target),templateKey:key,reason:'Synthetic template reason',expiresAt:expiry});
  };
  try {
    assert.ok(replayReport.files.length>300,'full repository migration dependency graph replayed');
    for(const n of [1,2,3,4,5,6,7,8]) {
      await db.query('insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,$2,now(),false,false)',[uid(n),email(n)]);
      await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')",[sid(n),uid(n)]);
    }
    await db.exec(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,
      role_key,capability,session_generation,authority_source)
      select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,
        coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,s.id::text,'service_reconciliation'
      from auth.sessions s left join public.user_profiles p on p.user_id=s.user_id::text
      cross join public.wave1_legal_document_versions d where s.id::text like 'a7200000-%'
        and d.active and d.market='UNITED_STATES' and d.capability='account';`);
    for(const [n,role] of [[1,'owner'],[2,'operator'],[3,'moderator'],[4,'operator'],[6,'operator'],[7,'operator'],[8,'moderator']]) {
      await db.query("insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by) values($1,$2,$3,'active','Synthetic template fixture','test')",[role,uid(n),email(n)]);
    }
    await grant(2,'staff_permission_templates');
    await grant(6,'admin_grants');
    await grant(3,'evidence_export');
    const context=uid(501);
    await db.query(`insert into public.security_request_context(id,user_id,session_id,ip_hash,source,capture_status,metadata)
      values($1,$2,$3,$3,'admin-owner-controls:template_apply','unavailable','{"network_proof_state":"missing"}')`,
    [context,uid(2),'a'.repeat(64)]);
    const contextArgs=args('apply',4);contextArgs[6]=context;
    await rpc(2,contextArgs);
    const linked=(await db.query('select security_context_id,metadata from public.platform_admin_audit_logs where security_context_id=$1',[context])).rows;
    assert.equal(linked.length,1,'captured peppered session hash context remains supported');
    assert.equal(linked[0].metadata.security_context_id,context);
    const forged=args();forged[6]=context;
    await assert.rejects(()=>rpc(6,forged),/security_context_subject_mismatch/,'foreign actor security context is rejected');
    const unrelated=(await grants()).find(row=>row.permission_key==='evidence_export');
    const rolesBefore=(await db.query('select * from public.platform_role_memberships order by id')).rows;
    const expiry=new Date(Date.now()+3_600_000).toISOString();
    for(const invalidExpiry of ['not-a-date',new Date(Date.now()-1000).toISOString()]) {
      const beforeCalls=calls;
      assert.equal((await edge(2,'apply',3,'moderator',invalidExpiry)).status,400,'invalid expiry cannot silently become permanent');
      assert.equal(calls,beforeCalls,'invalid expiry never invokes mutation');
    }
    for(const key of ['moderator','senior_moderator','moderator_support']) {
      const applied=await edge(2,'apply',3,key,expiry);
      assert.equal(applied.status,200); const body=await applied.json();
      assert.equal(body.permissions.length,PERMISSION_TEMPLATES[key].permissions.length);
      assert.ok(body.permissions.every(row=>row.target_user_id===uid(3)&&Date.parse(row.expires_at)===Date.parse(expiry)));
      assert.equal((await edge(2,'revoke',3,key)).status,200);
    }
    assert.deepEqual((await grants()).find(row=>row.id===unrelated.id),unrelated,'unrelated grant unchanged byte for byte');
    assert.deepEqual((await db.query('select * from public.platform_role_memberships order by id')).rows,rolesBefore,'templates never create/change roles');
    assert.equal((await edge(2,'apply',3,'legal_operator')).status,409,'non-Moderator workflow retains operator-only scope');
    for(const [key,template] of Object.entries(PERMISSION_TEMPLATES)) {
      assert.deepEqual((await db.query('select private.staff_permission_template($1) as result',[key])).rows[0].result,template,'SQL/Edge catalog parity');
      assert.equal((await edge(6,'apply',4,key)).status,200,'admin_grants retains scoped authority');
      assert.equal((await edge(6,'revoke',4,key)).status,200,'operator compatibility');
    }
    const ownerBefore=await snapshot();
    await edge(1,'apply',3);await edge(1,'revoke',3);
    const ownerAfter=await snapshot();
    assert.deepEqual(ownerAfter.audits,ownerBefore.audits,'Owner normal suppresses application audit');
    assert.deepEqual(ownerAfter.breakGlass,ownerBefore.breakGlass,'Owner normal suppresses Break Glass audit');
    await assert.rejects(()=>rpc(7,args()),/staff_permission_templates_required/);
    await assert.rejects(()=>rpc(2,args('apply',2)),/self_denied/);
    await assert.rejects(()=>rpc(2,args('revoke',2)),/self_denied/);
    await assert.rejects(()=>rpc(2,args('apply',5)),/target_admin_required/);
    await assert.rejects(()=>rpc(2,[...args().slice(0,2),uid(4),...args().slice(3)]),/subject_changed/);
    await assert.rejects(()=>rpc(2,args('apply',3,'moderator',new Date(Date.now()-1000).toISOString())),/expiry_invalid/);
    await db.query("update public.platform_staff_permission_grants set status='revoked' where target_user_id=$1",[uid(2)]);
    await assert.rejects(()=>edge(2),/staff_permission_templates_required/,'stale Edge permissions cannot authorize SQL');
    await grant(2,'staff_permission_templates');
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sid(2)]);
    await assert.rejects(()=>rpc(2,args()),/auth_required/);
    await db.query("update auth.sessions set not_after=now()+interval '1 day' where id=$1",[sid(2)]);
    await db.query('update auth.users set email=$2 where id=$1',[uid(3),'new-template-address@example.test']);
    await assert.rejects(()=>rpc(2,args()),/exact_confirmed_subject_required/);
    await db.query('update auth.users set email=$2 where id=$1',[uid(3),email(3)]);
    await db.query('update auth.users set is_sso_user=true,email=$2 where id=$1',[uid(8),email(3)]);
    await assert.rejects(()=>rpc(2,args()),/exact_confirmed_subject_required/,'duplicate confirmed auth email fails closed');
    await db.query('update auth.users set email=$2 where id=$1',[uid(8),email(8)]);
    await db.query(`insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason)
      values($1,$2,'admin.content.hide','active','Historical subject grant')`,[uid(7),email(4)]);
    await assert.rejects(()=>rpc(2,args('apply',4)),/subject_conflict/,'recycled email never rebinds historical permission');
    await db.query("update public.platform_staff_permission_grants set status='revoked' where target_user_id=$1",[uid(7)]);
    await db.query("update public.platform_role_memberships set status='revoked' where user_id=$1",[uid(8)]);
    await assert.rejects(()=>rpc(2,args('apply',8)),/target_admin_required/);

    // Failure after earlier permissions have changed must undo all of them.
    await db.exec(`create function public.fixture_template_fail() returns trigger language plpgsql as $$begin
      if new.permission_key='admin.comment.moderate' then raise exception 'synthetic_permission_failure';end if;return new;end$$;
      create trigger fixture_template_fail before insert or update on public.platform_staff_permission_grants for each row execute function public.fixture_template_fail();`);
    let before=await snapshot();
    await assert.rejects(()=>edge(2),/synthetic_permission_failure/);
    assert.deepEqual(await snapshot(),before,'later grant failure rolls back whole template');
    await db.exec('drop trigger fixture_template_fail on public.platform_staff_permission_grants;drop function public.fixture_template_fail();');
    await db.exec(`create function public.fixture_template_fail_audit() returns trigger language plpgsql as $$begin
      raise exception 'synthetic_audit_failure';end$$;
      create trigger fixture_template_fail_audit before insert on public.platform_admin_audit_logs for each row execute function public.fixture_template_fail_audit();`);
    before=await snapshot();await assert.rejects(()=>edge(2),/synthetic_audit_failure/);
    assert.deepEqual(await snapshot(),before,'required audit failure rolls back apply');
    await db.exec('drop trigger fixture_template_fail_audit on public.platform_admin_audit_logs;');
    // Actual delayed PostgreSQL audit execution, not a concurrency simulation:
    // force authority to expire after initial authorization in this transaction.
    for(const [label,mutation,pattern] of [
      ['session',`update auth.sessions set not_after=clock_timestamp()+interval '50 milliseconds' where id='${sid(2)}';`,/auth_required/],
      ['manager',`update public.platform_staff_permission_grants set expires_at=clock_timestamp()+interval '50 milliseconds' where target_user_id='${uid(2)}' and status='active';`,/templates_required/],
      ['actor role',`update public.platform_role_memberships set expires_at=clock_timestamp()+interval '50 milliseconds' where user_id='${uid(2)}' and status='active';`,/templates_required/],
      ['target role',`update public.platform_role_memberships set expires_at=clock_timestamp()+interval '50 milliseconds' where user_id='${uid(3)}' and status='active';`,/target_admin_required/],
    ]) {
      await db.exec(`create function public.fixture_template_delay() returns trigger language plpgsql as $$begin ${mutation}
        perform pg_sleep(0.1);return new;end$$;
        create trigger fixture_template_delay before insert on public.platform_admin_audit_logs for each row execute function public.fixture_template_delay();`);
      before=await snapshot();await assert.rejects(()=>edge(2),pattern);
      assert.deepEqual(await snapshot(),before,`${label} expiry during actual audit rolls back grants and audit`);
      await db.exec('drop trigger fixture_template_delay on public.platform_admin_audit_logs;drop function public.fixture_template_delay();');
    }
    await edge(2);
    await db.exec('create trigger fixture_template_fail_audit before insert on public.platform_admin_audit_logs for each row execute function public.fixture_template_fail_audit();');
    before=await snapshot();await assert.rejects(()=>edge(2,'revoke'),/synthetic_audit_failure/);
    assert.deepEqual(await snapshot(),before,'required audit failure rolls back revoke');
    await db.exec('drop trigger fixture_template_fail_audit on public.platform_admin_audit_logs;');
    await db.exec(`insert into public.platform_first_owner_authority(owner_membership_id,owner_user_id,owner_email,established_by,established_reason)
      select id,user_id,email,'test','Synthetic template fixture' from public.platform_role_memberships where user_id='${uid(1)}';
      insert into public.platform_break_glass_sessions(actor_user_id,actor_email,actor_role,status,reason,expires_at)
      values('${uid(1)}','${email(1)}','owner','active','Synthetic emergency',now()+interval '1 hour');`);
    await edge(1);
    assert.equal((await db.query("select count(*)::int as n from public.platform_break_glass_audit where actor_user_id=$1 and action='owner_action'",[uid(1)])).rows[0].n,1);
    await db.exec(`create function public.fixture_template_break_glass_expiry() returns trigger language plpgsql as $$begin
      update public.platform_break_glass_sessions set expires_at=clock_timestamp()+interval '50 milliseconds'
        where actor_user_id='${uid(1)}' and status='active';
      perform pg_sleep(0.1);return new;end$$;
      create trigger fixture_template_break_glass_expiry before insert on public.platform_admin_audit_logs
        for each row execute function public.fixture_template_break_glass_expiry();`);
    before=await snapshot();await assert.rejects(()=>edge(1,'revoke'),/authority_changed/);
    assert.deepEqual(await snapshot(),before,'Break Glass expiry during audit cannot silently become unaudited Owner action');
    await db.exec('drop trigger fixture_template_break_glass_expiry on public.platform_admin_audit_logs;drop function public.fixture_template_break_glass_expiry();');
    await db.exec('create trigger fixture_template_fail_audit before insert on public.platform_break_glass_audit for each row execute function public.fixture_template_fail_audit();');
    before=await snapshot();await assert.rejects(()=>edge(1,'revoke'),/synthetic_audit_failure/);
    assert.deepEqual(await snapshot(),before,'Break Glass audit failure rolls back grants and earlier application audit');
    await db.exec('drop trigger fixture_template_fail_audit on public.platform_break_glass_audit;drop function public.fixture_template_fail_audit();');
    const signature='public.admin_mutate_staff_permission_template(text,text,uuid,text,text,timestamptz,uuid)';
    for(const role of ['anon','service_role']) assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') as allowed',[role,signature])).rows[0].allowed,false);
    for(const table of ['platform_staff_permission_grants','platform_admin_audit_logs','platform_break_glass_audit']) {
      assert.equal((await db.query("select relrowsecurity from pg_class where oid=$1::regclass",[`public.${table}`])).rows[0].relrowsecurity,true);
    }
    await db.exec('begin isolation level repeatable read');
    await assert.rejects(()=>db.query('select public.admin_mutate_staff_permission_template($1,$2,$3,$4,$5,$6,$7)',args()),/requires_read_committed/);
    await db.exec('rollback');
    assert.ok(calls>=32,'actual Edge handlers used the real PostgreSQL RPC repeatedly');
  } finally {await db.close();}
});

test('transaction transport never retries or accepts an incomplete/wrong-target receipt',async()=>{
  const valid={ok:true,permissions:PERMISSION_TEMPLATES.moderator.permissions.map((key,n)=>({
    id:uid(100+n),target_user_id:uid(3),permission_key:key,status:'active',expires_at:null,
  })),template:{key:'moderator',...PERMISSION_TEMPLATES.moderator}};
  for(const data of [null,{},false,[],{ok:true},{ok:true,permissions:[],template:{key:'moderator'}},
    {...valid,error:'denied'},{...valid,success:false},
    {...valid,permissions:valid.permissions.map(row=>({...row,target_user_id:uid(4)}))},
    {...valid,permissions:valid.permissions.slice(1)},
    {...valid,permissions:valid.permissions.map(row=>({...row,id:'not-a-uuid'}))},
    {...valid,permissions:[valid.permissions[0],...valid.permissions.slice(0,-1)]},
    {...valid,template:{...valid.template,permissions:['admin_grants']}}]) {
    let calls=0;
    await assert.rejects(()=>mutatePermissionTemplate({rpc:async()=>{calls++;return {data,error:null};}},
      {operation:'apply',targetEmail:email(3),targetUserId:uid(3),templateKey:'moderator',reason:'Synthetic reason'}),{code:'owner_control_outcome_unverified'});
    assert.equal(calls,1);
  }
  let calls=0;
  await assert.rejects(()=>mutatePermissionTemplate({rpc:async()=>{calls++;throw new Error('network failed');}},
    {operation:'revoke',targetEmail:email(3),targetUserId:uid(3),templateKey:'moderator',reason:'Synthetic reason'}),{code:'owner_control_outcome_unverified'});
  assert.equal(calls,1);
  for(const error of [{message:'fetch failed'},{code:'08007',message:'transaction resolution unknown'},
    {code:'40003',message:'statement completion unknown'},{code:'57P01',message:'connection terminated'}]) {
    let attempts=0;
    await assert.rejects(()=>mutatePermissionTemplate({rpc:async()=>{attempts++;return {data:null,error};}},
      {operation:'revoke',targetEmail:email(3),targetUserId:uid(3),templateKey:'moderator',reason:'Synthetic reason'}),{code:'owner_control_outcome_unverified'});
    assert.equal(attempts,1);
  }
});

test('production HTTP dispatch uses the actor client and reports unknown receipt as 503',async()=>{
  const serve=syntax.statements.find(statement=>ts.isExpressionStatement(statement)&&ts.isCallExpression(statement.expression)
    &&statement.expression.expression.getText(syntax)==='Deno.serve').expression.arguments[0];
  const handlerCode=ts.transpileModule(`exports.handler=${serve.getText(syntax)};`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText;
  const user={id:uid(2),email:email(2),role:'operator',permissions:new Set(['staff_permission_templates']),activeBreakGlassSessionId:null};
  const clients=[];let rpcCalls=0;
  const admin={from:()=>{throw new Error('Template attempted service-client mutation');}};
  const actor={rpc:async()=>{rpcCalls++;return {data:{ok:true},error:null};}};
  const scope={exports:{},Response,Date,Set,PERMISSION_TEMPLATES,mutatePermissionTemplate,
    normalizePermission:value=>value,readPermissionTemplateTarget:async()=>({email:email(3),userId:uid(3)}),
    writePlatformAudit:async()=>{throw new Error('Unexpected success audit');},
    console:{error:()=>{}},readRequiredEnv:name=>name,
    createClient:(url,key,options)=>{clients.push({url,key,options});return key==='SUPABASE_SERVICE_ROLE_KEY'?admin:options.global?actor:{};},
    authenticate:async()=>({user}),expireStaleGrants:async()=>{},captureSecurityRequestContext:async()=>null};
  vm.runInNewContext(edgeCode+'\n'+handlerCode,scope);
  for(const action of ['template_apply','template_revoke']) {
    const response=await scope.exports.handler(new Request('https://example.test/admin-owner-controls',{
      method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({action,targetEmail:email(3),templateKey:'moderator',reason:'Synthetic reason'}),
    }));
    assert.equal(response.status,503);
    assert.equal((await response.json()).error,'owner_control_outcome_unverified');
  }
  assert.equal(rpcCalls,2,'one RPC per request without retry');
  assert.ok(clients.filter(client=>client.options.global).every(client=>client.options.global.headers.Authorization==='Bearer synthetic'));
});
