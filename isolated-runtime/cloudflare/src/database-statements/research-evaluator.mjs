export const RESEARCH_EVALUATOR_STATEMENTS = Object.freeze({
  derivePublicResearchEvaluation: Object.freeze({
    arity: 7,
    text: `select cognitive_runtime.derive_research_evaluation_with_readback(
      $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::uuid,$7::text
    ) as result`,
  }),
  researchEvaluatorSnapshot: Object.freeze({
    arity: 5,
    text: `select cognitive_runtime.research_evaluator_snapshot(
      $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text
    ) as result`,
  }),
  resolvePublicResearchContradiction: Object.freeze({
    arity: 8,
    text: `select cognitive_runtime.cognitive_resolve_public_research_contradiction(
      $1::uuid,$2::uuid,$3::text,
      $4::text,$5::uuid,$6::uuid,$7::text,$8::text
    ) as result`,
  }),
});
