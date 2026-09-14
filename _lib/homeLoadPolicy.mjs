export const HOME_LOAD_DEADLINE_MS = 15_000;

const normalizeDeadline = (value) => {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate > 0
    ? Math.min(candidate, HOME_LOAD_DEADLINE_MS)
    : HOME_LOAD_DEADLINE_MS;
};

export const settleHomeOperationsWithinDeadline = async (
  operations,
  {
    deadlineMs = HOME_LOAD_DEADLINE_MS,
    cancel = clearTimeout,
    schedule = setTimeout,
  } = {},
) => {
  let deadlineHandle;
  const settled = Promise.allSettled(Array.from(operations ?? []))
    .then(() => ({ timedOut: false }));
  const deadline = new Promise((resolve) => {
    deadlineHandle = schedule(
      () => resolve({ timedOut: true }),
      normalizeDeadline(deadlineMs),
    );
  });
  const result = await Promise.race([settled, deadline]);
  if (!result.timedOut && deadlineHandle !== undefined) cancel(deadlineHandle);
  return result;
};
