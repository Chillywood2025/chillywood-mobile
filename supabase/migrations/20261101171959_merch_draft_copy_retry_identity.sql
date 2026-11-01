-- A lost response to an explicit copy never allocates duplicate inventory.
create table private.merch_live_draft_copies(
 source_product_id uuid not null references public.merch_products(id),source_revision bigint not null,
 creator_id uuid not null,copied_product_id uuid not null unique references public.merch_products(id),
 created_at timestamptz not null default clock_timestamp(),primary key(source_product_id,source_revision)
);
alter table private.merch_live_draft_copies enable row level security;
alter table private.merch_live_draft_copies force row level security;
revoke all on private.merch_live_draft_copies from public,anon,authenticated,service_role;
create trigger merch_live_draft_copies_immutable before update or delete on private.merch_live_draft_copies for each row execute function private.platform_brand_retention_immutable();
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.copy_creator_merch_live_draft(uuid,timestamptz)'::regprocedure);
 needle:='result:=public.save_creator_merch_product_with_tracking(fresh';
 if position(needle in definition)=0 then raise exception 'merch_copy_writer_changed';end if;
 definition:=replace(definition,needle,$patch$
 select public.merch_product_projection_internal(copied) into result
 from private.merch_live_draft_copies receipt join public.merch_products copied on copied.id=receipt.copied_product_id
 where receipt.source_product_id=p.id and receipt.source_revision=p.publication_revision and receipt.creator_id=auth.uid();
 if result is not null then return result;end if;
 result:=public.save_creator_merch_product_with_tracking(fresh$patch$);
 needle:='return result;';
 -- Replace only the final standalone return, not the early retry acknowledgement.
 needle:=chr(10)||' return result;';
 if position(needle in definition)=0 then raise exception 'merch_copy_return_changed';end if;
 definition:=replace(definition,needle,chr(10)||' insert into private.merch_live_draft_copies(source_product_id,source_revision,creator_id,copied_product_id) values(p.id,p.publication_revision,auth.uid(),fresh);'||needle);
 execute definition;
end $$;
