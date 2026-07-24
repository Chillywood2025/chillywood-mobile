export const assertInvocationActive = async ({
  assertActive,
  signal,
} = {}) => {
  signal?.throwIfAborted();
  if (typeof assertActive === "function") await assertActive();
  signal?.throwIfAborted();
};

export const providerSignal = (signal, timeoutMs) => {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;
};
