// Source-only bridge primitives. No connections, credentials, or remote writes.
import {createHash} from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const literal = value => `'${String(value).replaceAll("'", "''")}'`;
export const BRIDGE_PREFIX = "\nbegin\n raise exception 'automatic_commerce_cutover_retry' using errcode='55P03';\n";
export const BRIDGE_SUFFIX = '\nend;\n';
export const UNTERMINATED_BRIDGE_SUFFIX = '\n; -- automatic_commerce_cutover_terminator\nend;\n';
// A multi-statement SQL function cannot be inlined. The first statement always
// fails before the original body. No helper grant or language/volatility change.
export const SQL_BRIDGE_PREFIX = '\nselect 1 / 0; -- automatic_commerce_cutover_retry\n';
export const BRIDGE_TRIGGER = 'aaa_automatic_commerce_cutover_retry';
export const BRIDGE_FUNCTION = 'private.automatic_commerce_cutover_retry()';
export const BRIDGE_FUNCTION_SQL = `create function ${BRIDGE_FUNCTION} returns trigger
language plpgsql security invoker set search_path='' as $cutover$
begin
 raise exception 'automatic_commerce_cutover_retry' using errcode='55P03';
end
$cutover$;
revoke all on function ${BRIDGE_FUNCTION} from public,anon,authenticated,service_role;`;

const check = (ok, code) => {if (!ok) throw Error(code);};
export function definitionParts(definition) {
 check(typeof definition === 'string', 'FUNCTION_DEFINITION_REQUIRED');
 const m = /\nAS (\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$)/u.exec(definition);
 check(m, 'DOLLAR_QUOTED_FUNCTION_REQUIRED');
 const start = m.index + m[0].length, end = definition.indexOf(m[1], start);
 check(end >= start && definition.slice(end + m[1].length).trim() === '', 'FUNCTION_DEFINITION_ENCLOSURE_INVALID');
 const language = /\n LANGUAGE (plpgsql|sql)\n/u.exec(definition)?.[1];
 check(language, 'UNSUPPORTED_FUNCTION_LANGUAGE');
 return {prefix: definition.slice(0, start), body: definition.slice(start, end), suffix: definition.slice(end), language, delimiter:m[1]};
}
export function bridgeDefinition(definition) {
 const p = definitionParts(definition);
 check(!p.body.includes('automatic_commerce_cutover_retry'), 'ALREADY_BRIDGED_OR_MARKER_COLLISION');
 // Exact deployed source inventory ends with END or END;. Do not guess around
 // trailing comments/labels or try a generic PL/pgSQL rewriter.
 if(p.language==='plpgsql')check(/\bend;?\s*$/iu.test(p.body),'UNREVIEWED_PLPGSQL_TERMINATOR');
 const suffix=p.body.trimEnd().endsWith(';')?BRIDGE_SUFFIX:UNTERMINATED_BRIDGE_SUFFIX;
 const body = p.language === 'plpgsql' ? BRIDGE_PREFIX + p.body + suffix : SQL_BRIDGE_PREFIX + p.body;
 return p.prefix + body + p.suffix;
}
export function restoreDefinition(definition) {
 const p = definitionParts(definition);
 let body;
 if (p.language === 'plpgsql') {
  const suffix=p.body.endsWith(UNTERMINATED_BRIDGE_SUFFIX)?UNTERMINATED_BRIDGE_SUFFIX:BRIDGE_SUFFIX;
  check(p.body.startsWith(BRIDGE_PREFIX) && p.body.endsWith(suffix), 'BRIDGE_ENCLOSURE_MISMATCH');
  body = p.body.slice(BRIDGE_PREFIX.length, -suffix.length);
 } else {
  check(p.body.startsWith(SQL_BRIDGE_PREFIX), 'BRIDGE_ENCLOSURE_MISMATCH');
  body = p.body.slice(SQL_BRIDGE_PREFIX.length);
 }
 return p.prefix + body + p.suffix;
}

// pg_locks includes read-only transactions without an assigned permanent XID.
// There is deliberately no backend_type/client-only filter. A readable activity
// row for every lock holder is mandatory; hidden/missing rows are not quiescence.
export const DRAIN_SQL = `
 if not (select rolsuper from pg_roles where rolname=current_user)
    and not pg_has_role(current_user,'pg_read_all_stats','USAGE')
 then raise exception 'cutover_activity_visibility_required'; end if;
 if current_setting('max_prepared_transactions') <> '0'
    or exists(select 1 from pg_prepared_xacts where database=current_database())
 then raise exception 'cutover_prepared_transactions_unsupported'; end if;
 perform pg_stat_clear_snapshot();
 if exists (
  select 1 from pg_locks l left join pg_stat_activity a on a.pid=l.pid
  where l.locktype='virtualxid' and l.mode='ExclusiveLock' and l.granted
   and l.pid is distinct from pg_backend_pid()
   and (a.pid is null or a.datid=(select oid from pg_database where datname=current_database()))
 ) then raise exception 'cutover_transactions_not_drained' using errcode='55P03'; end if;
`;

export const DRAIN_READBACK_SQL = `select coalesce(jsonb_agg(jsonb_build_object(
 'pid',l.pid,'backendStart',a.backend_start,'virtualTransaction',l.virtualtransaction,
 'virtualXid',l.virtualxid,'backendType',a.backend_type,'state',a.state)
 order by l.pid,l.virtualxid),'[]'::jsonb) transactions
from pg_locks l left join pg_stat_activity a on a.pid=l.pid
where l.locktype='virtualxid' and l.mode='ExclusiveLock' and l.granted
 and l.pid is distinct from pg_backend_pid()
 and (a.pid is null or a.datid=(select oid from pg_database where datname=current_database()));`;

// Execute definitions only after matching the complete expected bytes. Retain
// each existing OID and every attribute/owner/ACL by CREATE OR REPLACE.
export function replacementSQL(functions, from, to, renderText=literal) {
 check(['original', 'bridge'].includes(from) && ['original', 'bridge'].includes(to) && from !== to, 'BRIDGE_DIRECTION_INVALID');
 const rows=functions.map(f => {
  check(f[from]?.sha256 === sha256(f[from].definition) && f[to]?.sha256 === sha256(f[to].definition), 'BRIDGE_DEFINITION_HASH_MISMATCH');
  const p=definitionParts(f[from].definition), q=definitionParts(f[to].definition);
  check(p.prefix===q.prefix&&p.suffix===q.suffix,'BRIDGE_ATTRIBUTES_CHANGED');
  const original=definitionParts(f.original.definition);
  return {signature:f.signature,fromhash:f[from].sha256,tohash:f[to].sha256,delimiter:p.delimiter,language:p.language,suffix:p.suffix,
   bridge_end:original.body.trimEnd().endsWith(';')?BRIDGE_SUFFIX:UNTERMINATED_BRIDGE_SUFFIX};
 });
 // Hash-check both ends of a deterministic body-only transform. Embedding 406
 // full definitions would needlessly multiply a multi-megabyte request. No
 // observed definition is accepted merely because transformation succeeded.
 return `declare f record; d text; b text; result text; at integer; begin
 for f in select * from jsonb_to_recordset(${renderText(JSON.stringify(rows))}::jsonb)
 as x(signature text,fromhash text,tohash text,delimiter text,language text,suffix text,bridge_end text) loop
 d:=pg_get_functiondef(to_regprocedure(f.signature));
 if encode(sha256(convert_to(d,'UTF8')),'hex') is distinct from f.fromhash then raise exception 'cutover_function_changed: %',f.signature;end if;
 at:=strpos(d,E'\\nAS '||f.delimiter)+length(E'\\nAS '||f.delimiter);
 if at<=length(E'\\nAS '||f.delimiter) or right(d,length(f.suffix))<>f.suffix then raise exception 'cutover_function_enclosure_changed';end if;
 b:=substring(d from at for length(d)-length(f.suffix)-at+1);
 ${from==='original'?`b:=case when f.language='plpgsql' then ${literal(BRIDGE_PREFIX)}||b||f.bridge_end else ${literal(SQL_BRIDGE_PREFIX)}||b end;`:
 `if f.language='plpgsql' then
 if left(b,length(${literal(BRIDGE_PREFIX)}))<>${literal(BRIDGE_PREFIX)} or right(b,length(f.bridge_end))<>f.bridge_end then raise exception 'cutover_bridge_enclosure_changed';end if;
 b:=substring(b from length(${literal(BRIDGE_PREFIX)})+1 for length(b)-length(${literal(BRIDGE_PREFIX)})-length(f.bridge_end));
 else
 if left(b,length(${literal(SQL_BRIDGE_PREFIX)}))<>${literal(SQL_BRIDGE_PREFIX)} then raise exception 'cutover_bridge_enclosure_changed';end if;
 b:=substring(b from length(${literal(SQL_BRIDGE_PREFIX)})+1);end if;`}
 result:=left(d,at-1)||b||f.suffix;
 if encode(sha256(convert_to(result,'UTF8')),'hex') is distinct from f.tohash then raise exception 'cutover_transformed_source_changed: %',f.signature;end if;
 execute result;
 end loop;end;`;
}
