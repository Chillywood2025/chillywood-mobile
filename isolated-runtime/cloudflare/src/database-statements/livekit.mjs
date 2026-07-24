export const LIVEKIT_STATEMENTS = Object.freeze({
  collectLiveKitSentinelRun: Object.freeze({
    arity: 16,
    text: `select cognitive_runtime.collect_livekit_sentinel_run(
      $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,
      $8::text,$9::jsonb,$10::text,$11::text,$12::timestamptz,
      $13::timestamptz,$14::timestamptz,$15::text,$16::text
    ) as result`,
  }),
});
