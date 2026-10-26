// Persistent test-only psql transport into the already validated disposable
// Unix-socket fixture. No ports, host mounts, credentials or app dependency.
import {randomUUID} from 'node:crypto';
import {brandNativeSpawn} from './brand-reference-native-target.mjs';
import {quoteLiteral} from '../../scripts/brand-reference-index-installer.mjs';

export function createInstallerPsqlAdapter({container,database,onQuery,afterQuery}) {
  const sessions=new Set();
  const adapter={
    remainingLifetimeMs:()=>Infinity,
    async connect({purpose,applicationName}){
      const args=['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-h','/tmp','-U','postgres','-d',database];
      const child=brandNativeSpawn(args,{stdio:['pipe','pipe','pipe']});
      let pending='',stderr='',active,closed=false;
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdin.on('error',()=>{});
      child.stderr.on('data',s=>{stderr+=s;});
      child.stdout.on('data',chunk=>{
        pending+=chunk;const lines=pending.split('\n');pending=lines.pop();
        for(const line of lines){
          if(!active)continue;
          if(line===active.marker){const done=active;active=undefined;clearTimeout(done.timer);try{done.resolve({rows:done.lines.filter(Boolean).map(line=>JSON.parse(line))});}catch{done.reject(new Error('PSQL_RESULT_INVALID'));}}
          else active.lines.push(line);
        }
      });
      const exited=new Promise(resolve=>{
        const finish=()=>{closed=true;if(active){clearTimeout(active.timer);const error=new Error('DATABASE_QUERY_FAILED');error.sqlstate=/ERROR:\s+([A-Z0-9]{5})/.exec(stderr)?.[1];active.reject(error);active=undefined;}resolve();};
        child.on('error',finish);child.on('close',finish);
      });
      const session={
        async query(sql){
          if(closed||active)throw new Error('PSQL_SESSION_UNAVAILABLE');
          await onQuery?.({purpose,sql,session});
          const statement=sql.trim().replace(/;\s*$/,'');
          const wrapped=/^select\b/i.test(statement)?`select row_to_json(result) from (${statement}) result;`:statement+';';
          const result=await new Promise((resolve,reject)=>{
            const marker='BRAND_DONE_'+randomUUID().replaceAll('-','');
            active={resolve,reject,marker,lines:[],timer:setTimeout(()=>{child.kill('SIGTERM');},125000)};
            child.stdin.write(wrapped+'\n\\echo '+marker+'\n');
          });
          await afterQuery?.({purpose,sql,session,result});return result;
        },
        async end(){if(!closed){child.stdin.end('\\q\n');const timer=setTimeout(()=>child.kill('SIGTERM'),2000);await exited;clearTimeout(timer);}sessions.delete(session);},
      };
      sessions.add(session);
      await session.query(`set application_name=${quoteLiteral(applicationName)};`);
      const {rows}=await session.query("select pg_backend_pid() as pid,(select backend_start::text from pg_stat_activity where pid=pg_backend_pid()) as \"backendStart\",current_setting('application_name') as \"applicationName\";");
      session.identity=rows[0];session.purpose=purpose;return session;
    },
    async cancel(identity){
      if(![...sessions].some(s=>s.purpose==='builder'&&JSON.stringify(s.identity)===JSON.stringify(identity)))throw new Error('UNKNOWN_BUILDER');
      const control=await adapter.connect({purpose:'control',applicationName:'brand_installer_cancel'});
      try{return await control.query(`select pg_cancel_backend(pid) as cancelled from pg_stat_activity where pid=${identity.pid}
        and backend_start=${quoteLiteral(identity.backendStart)}::timestamptz and application_name=${quoteLiteral(identity.applicationName)} and datname=current_database();`);}
      finally{await control.end();}
    },
    async closeAll(){await Promise.all([...sessions].map(s=>s.end()));},
  };
  return adapter;
}
