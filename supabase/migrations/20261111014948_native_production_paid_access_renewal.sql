-- A paid grant keeps its original immutable receipt/launch qualification.
-- Independently qualified current delivery may support a newer application
-- build without relabeling that historical purchase or creating another one.
alter table private.native_production_checkout_qualifications add column delivery_renewal_root_id uuid
 references private.native_production_checkout_qualifications(id),
 add check(delivery_renewal_root_id is distinct from id);
create index native_production_delivery_renewal on private.native_production_checkout_qualifications(delivery_renewal_root_id,verified_at desc);

create function private.native_production_current_delivery_qualification(p_original uuid) returns uuid
language plpgsql volatile set search_path='' as $$
declare original private.native_production_checkout_qualifications; root private.native_production_checkout_qualifications;
 latest private.native_production_checkout_qualifications; original_scope private.native_production_scope_qualifications; tied integer;
begin
 select * into original from private.native_production_checkout_qualifications where id=p_original;
 if original.id is null then return null; end if;
 select * into root from private.native_production_checkout_qualifications where id=coalesce(original.delivery_renewal_root_id,original.id);
 select * into original_scope from private.native_production_scope_qualifications where id=original.scope_id;
 if root.id is null or root.delivery_renewal_root_id is not null or root.verified_at>original.verified_at
  or row(root.application_id,root.delivery_adapter) is distinct from row(original.application_id,original.delivery_adapter)
  or not private.native_production_scope_equivalent(original.scope_id,root.scope_id) then return null; end if;
 -- Pick latest BEFORE validating lineage. An unlinked or changed current row
 -- in the same application/product namespace vetoes historical delivery.
 select candidate.* into latest from private.native_production_checkout_qualifications candidate
 join private.native_production_scope_qualifications scope on scope.id=candidate.scope_id
 where candidate.id=root.id or candidate.delivery_renewal_root_id=root.id
  or (candidate.application_id=original.application_id and
   row(scope.provider,scope.project_id,scope.app_id,scope.store_account_id,scope.provider_product_id,scope.currency)
   is not distinct from row(original_scope.provider,original_scope.project_id,original_scope.app_id,original_scope.store_account_id,
    original_scope.provider_product_id,original_scope.currency))
 order by candidate.verified_at desc,candidate.id desc limit 1;
 select count(*) into tied from private.native_production_checkout_qualifications candidate
 join private.native_production_scope_qualifications scope on scope.id=candidate.scope_id
 where candidate.verified_at=latest.verified_at and (candidate.id=root.id or candidate.delivery_renewal_root_id=root.id
  or (candidate.application_id=original.application_id and
   row(scope.provider,scope.project_id,scope.app_id,scope.store_account_id,scope.provider_product_id,scope.currency)
   is not distinct from row(original_scope.provider,original_scope.project_id,original_scope.app_id,original_scope.store_account_id,
    original_scope.provider_product_id,original_scope.currency)));
 if tied<>1 or (latest.id<>root.id and latest.delivery_renewal_root_id is distinct from root.id)
  or latest.verified_at<root.verified_at or latest.verified_at>clock_timestamp() or latest.expires_at<=clock_timestamp()
  or row(latest.application_id,latest.delivery_adapter) is distinct from row(original.application_id,original.delivery_adapter)
  or latest.delivery_adapter<>'native-production-etag-range-v1'
  or not private.native_production_scope_equivalent(original.scope_id,latest.scope_id)
  or not private.native_production_scope_current(original.scope_id)
  or exists(select 1 from private.native_production_checkout_revocations where qualification_id in(original.id,root.id,latest.id))
 then return null; end if;
 return latest.id;
end $$;
revoke all on function private.native_production_current_delivery_qualification(uuid) from public,anon,authenticated,service_role;

alter function private.native_production_checkout_current(uuid,boolean) rename to native_production_checkout_current_before_delivery_renewal;
revoke all on function private.native_production_checkout_current_before_delivery_renewal(uuid,boolean) from public,anon,authenticated,service_role;
create function private.native_production_checkout_current(p_qualification uuid,p_access boolean default false) returns boolean
language plpgsql volatile set search_path='' as $$
begin
 if p_access then
  return coalesce((select access_enabled from private.native_production_checkout_controls where singleton),false)
   and private.native_production_current_delivery_qualification(p_qualification) is not null;
 end if;
 -- New charges retain exact native configuration/receipt/SDK qualification.
 return private.native_production_checkout_current_before_delivery_renewal(p_qualification,false);
end $$;
revoke all on function private.native_production_checkout_current(uuid,boolean) from public,anon,authenticated,service_role;

-- Historical grant playback binds the current caller's session, not the old
-- purchase session. Bound the response by current compatible delivery time.
do $$ declare definition text; changed text; begin
 definition:=pg_get_functiondef('public.resolve_native_production_paid_video_origin(uuid,uuid,uuid,uuid)'::regprocedure);
 changed:=replace(definition,'select * into strict q from private.native_production_checkout_qualifications where id=d.qualification_id;',
  'select * into strict q from private.native_production_checkout_qualifications where id=private.native_production_current_delivery_qualification(d.qualification_id);');
 if changed=definition then raise exception 'native_delivery_expiry_anchor_missing'; end if;
 execute changed;
end $$;
