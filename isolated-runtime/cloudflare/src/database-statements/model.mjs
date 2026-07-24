export const MODEL_STATEMENTS = Object.freeze({
  recoverModelReservation: Object.freeze({
    arity: 4,
    text: `select cognitive_runtime.cognitive_model_router_recover_expired(
      $1::uuid,$2::integer,$3::text,$4::text
    ) as result`,
  }),
  recordModelProviderOverrun: Object.freeze({
    arity: 9,
    text:
      `select cognitive_runtime.cognitive_model_router_record_provider_overrun(
        $1::uuid,$2::bigint,$3::numeric,$4::text,$5::text,$6::text,$7::text,
        $8::integer,$9::text
      ) as result`,
  }),
  reserveModelInvocation: Object.freeze({
    arity: 21,
    text: `select cognitive_runtime.cognitive_model_router_reserve(
      $1::uuid,$2::uuid,$3::uuid,$4::text,
      $5::text,$6::text,$7::text,$8::text,$9::text,
      $10::text,$11::text,$12::text,$13::text,$14::text,$15::text,$16::text,
      $17::text,$18::text,$19::bigint,$20::numeric,$21::text
    ) as result`,
  }),
  settleModelInvocation: Object.freeze({
    arity: 13,
    text: `select cognitive_runtime.cognitive_model_router_settle(
      $1::uuid,$2::text,$3::bigint,$4::numeric,$5::text,$6::text,$7::text,
      $8::text,$9::text,$10::text,$11::text,$12::integer,$13::text
    ) as result`,
  }),
});
