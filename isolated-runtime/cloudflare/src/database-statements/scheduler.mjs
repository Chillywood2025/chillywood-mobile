export const SCHEDULER_STATEMENTS = Object.freeze({
  issueRecurringChildTask: Object.freeze({
    arity: 12,
    text: `select cognitive_runtime.issue_recurring_child_task(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,
      $7::timestamptz,$8::text,$9::text,$10::text,$11::text,$12::text
    ) as result`,
  }),
  schedulerPrerequisiteSnapshot: Object.freeze({
    arity: 4,
    text: `select cognitive_runtime.scheduler_prerequisite_snapshot(
      $1::uuid,$2::uuid,$3::text,$4::text
    ) as result`,
  }),
});
