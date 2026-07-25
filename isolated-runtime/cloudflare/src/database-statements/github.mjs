export const GITHUB_STATEMENTS = Object.freeze({
  acceptGithubToolResult: Object.freeze({
    arity: 12,
    text: `select cognitive_runtime.cognitive_accept_github_draft_pr_tool_result(
      $1::text,$2::text,$3::text,$4::text,$5::jsonb,$6::text,
      $7::text,$8::text,$9::text,$10::text,$11::text,$12::text
    ) as result`,
  }),
  consumeGithubCapability: Object.freeze({
    arity: 37,
    text: `select cognitive_runtime.cognitive_consume_github_draft_pr_capability(
      $1::text,$2::text,$3::text,$4::text,$5::uuid,$6::uuid,$7::text,
      $8::text,$9::text,
      $10::text,$11::text,$12::text,$13::text,
      $14::uuid,$15::bigint,$16::numeric,$17::text,$18::text,$19::text,
      $20::uuid,$21::text,$22::text,$23::text,$24::text,$25::text,
      $26::text,$27::text,$28::text,$29::text,$30::text,$31::text,
      $32::text,$33::text,$34::text,$35::text,$36::text,$37::text
    ) as result`,
  }),
  recordGithubProviderReadback: Object.freeze({
    arity: 9,
    text: `select cognitive_runtime.cognitive_record_github_draft_pr_provider_readback(
      $1::uuid,$2::uuid,$3::text,
      $4::text,$5::text,$6::text,$7::text,
      $8::timestamptz,$9::text
    ) as result`,
  }),
});
