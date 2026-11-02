// This runs only after the assertion deadline. Failed/closed browser pages or
// stuck native getStats must not hide the original assertion or hang its report.
export async function collectLegacyFailureTransportDiagnostics(collect, timeoutMs = 1000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(collect).catch(() => ({ error: "transport diagnostics unavailable" })),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ error: "transport diagnostics deadline exceeded" }), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
