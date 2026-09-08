// One cancellable long poll per visible page. No academic snapshot or per-second DB writes.
export function createTimerSync(options: {
  fetch: typeof fetch;
  visible: () => boolean;
  update: (snapshot: any) => void;
  error: (message: string) => void;
  signedOut: () => void;
}) {
  let stopped = false,
    generation = 0,
    cursor: string | undefined,
    failures = 0;
  let controller: AbortController | undefined, retry: ReturnType<typeof setTimeout> | undefined;
  async function poll(version: number) {
    if (stopped || !options.visible() || version !== generation) return;
    controller = new AbortController();
    const request = controller;
    // Recover if an intermediary holds a connection beyond the server's 25-second budget.
    const timeout = setTimeout(() => request.abort(), 30000);
    try {
      const response = await options.fetch(
        '/api/timer' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
        {
          cache: 'no-store',
          signal: request.signal,
        },
      );
      if (version !== generation || stopped) return;
      if (response.status === 401) {
        stop();
        options.signedOut();
        return;
      }
      if (!response.ok) throw Error('Timer connection unavailable');
      const snapshot = await response.json();
      if (version !== generation || stopped) return;
      cursor = snapshot.cursor;
      failures = 0;
      options.update(snapshot);
      options.error('');
      retry = setTimeout(() => {
        void poll(version);
      }, 0);
    } catch {
      if (version !== generation || stopped) return;
      options.error('Timer reconnecting. Controls need a connection to the laptop.');
      retry = setTimeout(
        () => {
          void poll(version);
        },
        Math.min(15000, 1000 * 2 ** failures++),
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  function refresh() {
    generation++;
    controller?.abort();
    clearTimeout(retry);
    cursor = undefined;
    if (!stopped) void poll(generation);
  }
  function stop() {
    stopped = true;
    generation++;
    controller?.abort();
    clearTimeout(retry);
  }
  return { refresh, stop };
}
