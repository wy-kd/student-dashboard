export const READINESS_TIMEOUT_MS = 60_000;
export const HEALTH_REQUEST_TIMEOUT_MS = 5_000;
export const READINESS_INTERVAL_MS = 1_000;

// Return allowlisted diagnostics only, never response bodies or exception text.
export async function checkHealth(timeoutMs = HEALTH_REQUEST_TIMEOUT_MS) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetch('http://127.0.0.1:3000/api/auth', {
      signal,
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, reason: `non-success HTTP status (${response.status})` };
    }
    try {
      const body = await response.json();
      if (typeof body?.setup === 'boolean' && body.signedIn === false)
        return { ok: true, reason: 'HTTP/database check passed' };
    } catch {
      if (signal.aborted) return { ok: false, reason: 'HTTP timeout' };
    }
    return { ok: false, reason: 'database/application health failure (invalid health response)' };
  } catch (error) {
    if (signal.aborted || ['TimeoutError', 'AbortError'].includes(error.name))
      return { ok: false, reason: 'HTTP timeout' };
    if (error.cause?.code === 'ECONNREFUSED' || error.code === 'ECONNREFUSED')
      return { ok: false, reason: 'connection refused' };
    return { ok: false, reason: 'HTTP connection failure' };
  }
}

export async function waitForReadiness(startProduction, report) {
  const deadline = performance.now() + READINESS_TIMEOUT_MS;
  let initialised = false;
  let startupFailed = false;
  let reportFailure;
  const failure = new Promise((resolve) => {
    reportFailure = resolve;
  });
  // Observe rejection immediately, including while a health request is pending.
  Promise.resolve()
    .then(startProduction)
    .then(
      () => {
        initialised = true;
      },
      () => {
        startupFailed = true;
        reportFailure({ ok: false, reason: 'Next.js startup failed before readiness' });
      },
    );
  let last = { ok: false, reason: 'Next.js initialisation pending' };
  let attempts = 0;
  while (performance.now() < deadline) {
    const remaining = Math.max(1, Math.ceil(deadline - performance.now()));
    last = await Promise.race([
      checkHealth(Math.min(HEALTH_REQUEST_TIMEOUT_MS, remaining)),
      failure,
    ]);
    attempts++;
    if (last.ok && initialised && performance.now() < deadline) return last;
    if (last.ok)
      last = { ok: false, reason: initialised ? 'HTTP timeout' : 'Next.js initialisation pending' };
    report(`Readiness attempt ${attempts}: ${last.reason}.`);
    if (startupFailed) return last;
    const delay = Math.min(READINESS_INTERVAL_MS, Math.max(0, deadline - performance.now()));
    await Promise.race([new Promise((resolve) => setTimeout(resolve, delay)), failure]);
    if (startupFailed) {
      const result = await failure;
      report(`Readiness failed: ${result.reason}.`);
      return result;
    }
  }
  report(
    `Readiness deadline reached after 60 seconds; last failure: ${last.reason} (${attempts} attempts).`,
  );
  return { ok: false, reason: last.reason };
}
