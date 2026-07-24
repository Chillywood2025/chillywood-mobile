export const RESEARCH_BROKER_STATEMENTS = Object.freeze({
  detectResearchContradiction: Object.freeze({
    arity: 8,
    text: `select public.cognitive_record_public_research_contradiction_detection(
      $1::uuid,$2::uuid,$3::public.cognitive_platform,
      $4::public.cognitive_environment,$5::uuid,$6::uuid,$7::text,$8::text
    ) as result`,
  }),
  expirePublicResearch: Object.freeze({
    arity: 6,
    text: `select public.cognitive_expire_public_research_maintenance(
      $1::uuid,$2::uuid,$3::public.cognitive_platform,
      $4::public.cognitive_environment,$5::integer,$6::text
    ) as result`,
  }),
  recordPublicResearchClaim: Object.freeze({
    arity: 12,
    text: `select cognitive_runtime.record_research_claim_with_readback(
      $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,
      $8::numeric,$9::timestamptz,$10::text,$11::uuid[],$12::text
    ) as result`,
  }),
  recordPublicResearchSource: Object.freeze({
    arity: 21,
    text: `select public.cognitive_record_public_research_source_v2(
      $1::uuid,$2::uuid,$3::public.cognitive_platform,
      $4::public.cognitive_environment,$5::text,$6::text,$7::text,$8::text,
      $9::text,$10::text,$11::text,$12::text,$13::timestamptz,$14::jsonb,
      $15::timestamptz,$16::timestamptz,$17::boolean,$18::text,$19::jsonb,
      $20::text[],$21::text
    ) as result`,
  }),
});
