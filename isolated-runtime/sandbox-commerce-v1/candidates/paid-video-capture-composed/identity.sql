-- Generated installation witness. Source digest covers every other ordered SQL
-- input in source-manifest.json. This module is excluded from its own preimage.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.test_store_v3_capture_identity (
 singleton boolean primary key default true check(singleton),
 installation_id uuid not null unique default gen_random_uuid(),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$')
);
alter table sandbox_commerce_v1.test_store_v3_capture_identity enable row level security;
alter table sandbox_commerce_v1.test_store_v3_capture_identity force row level security;
create policy core_owner on sandbox_commerce_v1.test_store_v3_capture_identity to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.test_store_v3_capture_identity from public,anon,authenticated,service_role,sbx_v1_operator;
insert into sandbox_commerce_v1.test_store_v3_capture_identity(source_sha256) values('5b4eee14864d5e039114ae8c605407f7b3f9baaca90511172267d31b4fd1356e');
create trigger immutable before update or delete on sandbox_commerce_v1.test_store_v3_capture_identity for each row execute function sandbox_commerce_v1.test_store_v3_immutable();
create trigger no_truncate before truncate on sandbox_commerce_v1.test_store_v3_capture_identity for each statement execute function sandbox_commerce_v1.test_store_v3_immutable();
reset role;
