export const EVALUATOR_STATEMENTS = Object.freeze({
  evaluateProductBaseline: Object.freeze({
    arity: 4,
    text: `select public.governance_evaluate_product_experience_baseline_v1(
      $1::uuid,$2::text,$3::text,$4::text
    ) as result`,
  }),
  productQualityDetectionAssessmentHash: Object.freeze({
    arity: 14,
    text: `select public.product_quality_detection_assessment_hash(
      $1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text[],
      $8::text,$9::numeric,$10::text,$11::text,$12::text,$13::text,$14::text
    ) as result`,
  }),
  productQualityEvaluatorSnapshot: Object.freeze({
    arity: 2,
    text: `select cognitive_runtime.product_quality_evaluator_snapshot(
      $1::uuid,$2::uuid
    ) as result`,
  }),
  productQualityRecordEvaluatorProof: Object.freeze({
    arity: 9,
    text: `select public.product_quality_record_sentinel_evaluator_proof(
      $1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,
      $8::text,$9::text
    ) as result`,
  }),
  productQualityResolutionAssessmentHash: Object.freeze({
    arity: 4,
    text: `select public.product_quality_resolution_assessment_hash(
      $1::uuid,$2::uuid,$3::text,$4::text
    ) as result`,
  }),
  resolveActiveProductBaseline: Object.freeze({
    arity: 5,
    text: `select public.product_experience_resolve_current_active_baseline(
      $1::uuid,$2::uuid,$3::public.cognitive_platform,
      $4::public.cognitive_environment,$5::text
    ) as result`,
  }),
});
