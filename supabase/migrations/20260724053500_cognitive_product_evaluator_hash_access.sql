-- Forward-only read-only evaluator support.
--
-- The independent product evaluator must derive the exact same deterministic
-- finding assessment hash later consumed by triage. These immutable helpers
-- expose hashing only; they perform no write, issue no capability, and grant no
-- product, provider, approval, merge, release, or switch authority.

grant execute on function public.product_quality_detection_assessment_hash(
  uuid,text,text,text,text,text,text[],text,numeric,text,text,text,text,text
) to service_role;

comment on function public.product_quality_detection_assessment_hash(
  uuid,text,text,text,text,text,text[],text,numeric,text,text,text,text,text
) is
  'Immutable evaluator/triage assessment hash. Service access is read-only; finding persistence still requires a separate unexpired evaluator proof and triage capability.';
