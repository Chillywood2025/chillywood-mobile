begin read only;
set local statement_timeout='4s';
set local transaction_timeout='5s';
set local lock_timeout='500ms';
set local jit=off;
set local work_mem='1MB';
set local max_parallel_workers_per_gather=0;
set local search_path='';
select 'relation'::text kind,pg_catalog.to_jsonb(r) metadata from (with wanted(name) as(values ('provider_events'),('revenuecat_webhook_ingress_events'),('revenuecat_premium_transaction_authority'),('revenuecat_consumable_transaction_intents'),('revenuecat_unbound_initial_authority'),('revenuecat_unbound_terminal_authority'),('money_purchase_intents'),('monetization_product_store_mappings'),('monetization_products'),('revenuecat_provider_reconciliation_obligations')) select w.name,c.oid,c.relkind,c.relowner::regrole::text owner,c.relacl::text acl,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relpersistence from wanted w left join pg_catalog.pg_namespace n on n.nspname='public' left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=w.name order by w.name) r
union all
select 'column'::text kind,pg_catalog.to_jsonb(r) metadata from (select c.relname,a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) type,a.attnotnull,a.attacl::text acl,a.attidentity,a.attgenerated,pg_catalog.pg_get_expr(d.adbin,d.adrelid) default_expression from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname='public' and c.relname in('provider_events','revenuecat_webhook_ingress_events','revenuecat_premium_transaction_authority','revenuecat_consumable_transaction_intents','revenuecat_unbound_initial_authority','revenuecat_unbound_terminal_authority','money_purchase_intents','monetization_product_store_mappings','monetization_products','revenuecat_provider_reconciliation_obligations') and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum) r;
rollback;
