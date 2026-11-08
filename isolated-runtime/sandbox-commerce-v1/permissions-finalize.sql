-- LAST file in the same explicit install transaction, BEFORE COMMIT.
-- PG17 source contract; target owner/role/version compatibility is not attested.
-- Restrict temporary privileges on NEW objects/roles only. The deliberate
-- postgres-owned authority reader retains unfiltered reads only if the existing
-- platform owner has the independently qualified shared-table capabilities.
set local role sbx_v1_core_owner;
grant select,maintain on sandbox_commerce_v1.declarations to postgres;
revoke create on schema sandbox_commerce_v1 from postgres;
reset role;

-- CREATEROLE automatically retains ADMIN grants on freshly created roles.
-- Disable effective runtime inheritance/SET, retaining that administrative
-- capability for a later separately authorized provisioning action. Do not
-- self-GRANT ADMIN TRUE: PostgreSQL rejects that grantor cycle. Do not claim
-- these roles have no memberships or that this removes installer administration.
grant sbx_v1_core_owner,sbx_v1_authority_owner,sbx_v1_operator to postgres
  with inherit false,set false;

-- No operator SET/login is enabled, no provider route is populated, and the
-- lifecycle remains disabled. Administration is not product activation.
