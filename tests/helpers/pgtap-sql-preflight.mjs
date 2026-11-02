// Assertion adapter only, NOT native pgTAP qualification. Every application
// table, trigger, policy, grant and RPC remains the real full-schema definition.
// Native Required Validation separately runs these files with actual pgTAP.
export const pgtapSQLPreflight = `
create function extensions.no_plan() returns text language sql as $$select 'preflight no_plan'::text$$;
create function extensions.plan(expected integer) returns text language sql as $$select 'preflight plan '||expected$$;
create function extensions.pass(description text) returns text language sql as $$select 'ok '||description$$;
create function extensions.ok(value boolean,description text) returns text language plpgsql as $$
begin if value is distinct from true then raise exception 'assertion failed: %',description;end if;return 'ok '||description;end$$;
create function extensions."is"(actual anyelement,expected anyelement,description text) returns text language plpgsql as $$
begin if actual is distinct from expected then raise exception 'assertion failed: % (actual %, expected %)',description,actual,expected;end if;return 'ok '||description;end$$;
create function extensions.lives_ok(statement text,description text) returns text language plpgsql as $$
begin execute statement;return 'ok '||description;exception when others then raise exception 'assertion failed: %: %',description,sqlerrm;end$$;
create function extensions.throws_ok(statement text,expected_message text,description text) returns text language plpgsql as $$
declare failed boolean:=false;message text;
begin begin execute statement;exception when others then failed:=true;message:=sqlerrm;end;
if not failed or (expected_message is not null and message is distinct from expected_message) then raise exception 'assertion failed: % (error %, expected %)',description,message,expected_message;end if;return 'ok '||description;end$$;
create function extensions.throws_ok(statement text,expected_code text,expected_message text,description text) returns text language plpgsql as $$
declare failed boolean:=false;message text;code text;
begin begin execute statement;exception when others then failed:=true;message:=sqlerrm;code:=sqlstate;end;
if not failed or (expected_message is not null and message is distinct from expected_message) or (expected_code is not null and code is distinct from expected_code) then raise exception 'assertion failed: % (error % %, expected % %)',description,code,message,expected_code,expected_message;end if;return 'ok '||description;end$$;
create function extensions.has_column(schema_name text,table_name text,column_name text,description text) returns text language sql as $$
select extensions.ok(exists(select 1 from pg_attribute where attrelid=to_regclass(format('%I.%I',$1,$2)) and attname=$3 and not attisdropped),$4)$$;
create function extensions.has_function(schema_name text,function_name text,arguments text[],description text) returns text language sql as $$
select extensions.ok(to_regprocedure(format('%I.%I(%s)',$1,$2,array_to_string($3,','))) is not null,$4)$$;
create function extensions.has_trigger(schema_name text,table_name text,trigger_name text,description text) returns text language sql as $$
select extensions.ok(exists(select 1 from pg_trigger where tgrelid=to_regclass(format('%I.%I',$1,$2)) and tgname=$3),$4)$$;
create function extensions.finish() returns setof text language sql as $$select 'SQL preflight assertions passed; native pgTAP still required'::text$$;
`;
