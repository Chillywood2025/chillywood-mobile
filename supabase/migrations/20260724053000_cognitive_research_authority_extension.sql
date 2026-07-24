-- Forward-only Level 0/1 public-research authority extension.
--
-- These three exact public hosts close the reviewed React Native, Google Play
-- policy, and Chi'llywood public-repository canary gaps. They grant no tool
-- authority and do not permit private data, credentials, redirects to another
-- host, or subdomain widening.

insert into public.cognitive_research_authorities(
  authority_id,
  canonical_host,
  source_type,
  publisher,
  ownership_identity
) values
  -- BEGIN GENERATED RESEARCH AUTHORITIES — config/intelligence/research-authorities.json
  ('chillywood-public-repository','github.com','engineering_practice','Chi''llywood','chillywood'),
  ('google-play-store-policy','support.google.com','store_policy','Google','google'),
  ('react-native-docs','reactnative.dev','official_documentation','React Native','meta');
  -- END GENERATED RESEARCH AUTHORITIES

comment on table public.cognitive_research_authorities is
  'Closed public research authority registry. Hosts and source types are reviewed forward-only; retrieved text remains untrusted data and is never tool authority.';
