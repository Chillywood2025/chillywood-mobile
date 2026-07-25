export const TRIAGE_STATEMENTS = Object.freeze({
  triageDetection: Object.freeze({
    arity: 18,
    text: `select cognitive_runtime.product_quality_triage_detection(
      $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,
      $8::text,$9::text[],$10::text,$11::numeric,$12::text,
      $13::text,$14::text,$15::text,$16::text,$17::text,$18::text
    ) as result`,
  }),
  triageResolution: Object.freeze({
    arity: 7,
    text: `select cognitive_runtime.product_quality_triage_resolution(
      $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,$7::text
    ) as result`,
  }),
  triageNoFinding: Object.freeze({
    arity: 5,
    text: `select cognitive_runtime.product_quality_triage_no_finding(
      $1::uuid,$2::uuid,$3::text,$4::text,$5::text
    ) as result`,
  }),
});
