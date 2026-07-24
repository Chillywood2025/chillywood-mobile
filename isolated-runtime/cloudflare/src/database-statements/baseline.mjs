export const BASELINE_STATEMENTS = Object.freeze({
  baselineClaim: Object.freeze({
    arity: 19,
    text: `select public.governance_claim_approved_action(
      $1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::uuid,
      $8::uuid,$9::text,$10::text,$11::public.cognitive_platform,
      $12::public.cognitive_environment,$13::text,$14::text,
      $15::text,$16::text,$17::text,$18::text,$19::text
    ) as result`,
  }),
  baselineComplete: Object.freeze({
    arity: 5,
    text: `select public.governance_complete_approved_execution(
      $1::uuid,$2::text,$3::text,$4::text,$5::text
    ) as result`,
  }),
  baselineFail: Object.freeze({
    arity: 4,
    text: `select public.governance_fail_approved_execution(
      $1::uuid,$2::text,$3::text,$4::text
    ) as result`,
  }),
  baselinePersist: Object.freeze({
    arity: 3,
    text: `select public.governance_product_baseline_persist_completed_execution(
      $1::uuid,$2::text,$3::text
    ) as result`,
  }),
  baselineStage: Object.freeze({
    arity: 9,
    text: `select public.governance_stage_product_experience_baseline_v1(
      $1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,
      $8::text,$9::text
    ) as result`,
  }),
  baselineTransition: Object.freeze({
    arity: 4,
    text: `select public.governance_begin_approved_execution(
      $1::uuid,$2::text,$3::text,$4::text
    ) as result`,
  }),
});
