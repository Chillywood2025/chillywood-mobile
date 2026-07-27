export const SENTINEL_STATEMENTS = Object.freeze({
  collectSentinelRun: Object.freeze({
    arity: 17,
    text: `select cognitive_runtime.collect_sentinel_run(
      $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,
      $8::text,$9::text,$10::jsonb,$11::text,$12::text,$13::timestamptz,
      $14::timestamptz,$15::timestamptz,$16::text,$17::text
    ) as result`,
  }),
  preflightVisualSentinelCollection: Object.freeze({
    arity: 17,
    text: `select cognitive_runtime.preflight_visual_sentinel_collection(
      $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,
      $8::text,$9::text,$10::jsonb,$11::text,$12::text,$13::timestamptz,
      $14::timestamptz,$15::timestamptz,$16::text,$17::text
    ) as result`,
  }),
});
