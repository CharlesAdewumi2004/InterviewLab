import { useCallback, useEffect, useState } from 'react';

// One-shot GET for the bank/progress panes, with the resilience the raw
// mount-only fetch lacked. Three panes had the same shape and the same three
// bugs: a failure latched forever (the error was never cleared and nothing
// retried), an in-flight request was never aborted, and a server that accepted
// the socket but never replied left the pane on "Loading…" with no way out.
//
// The dev server restarts on every source edit (tsx watch), so a sub-second
// window where the Vite proxy answers 502 is routine — it must not disable a
// pane for the rest of the page's life.

const TIMEOUT_MS = 8_000;

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-run the request; also clears any latched error. */
  retry: () => void;
}

/**
 * @param url     endpoint to GET
 * @param epoch   bump to refetch — pass the session epoch, which only advances
 *                when the server has provably come back. Do NOT pass a
 *                `connected` flag: it also fires on the true→false edge, which
 *                would refetch straight into a refused port and mint a fresh
 *                error at the exact moment the server goes down.
 */
export function useApi<T>(url: string, epoch = 0): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    // Guard BOTH the success and failure paths, not just the failure one: a
    // superseded request that succeeds late would otherwise render its data
    // alongside a newer attempt's error banner.
    let live = true;
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    setError(null);
    setLoading(true);

    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (!live) return;
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setLoading(false);
        setError(
          controller.signal.aborted
            ? 'Timed out'
            : err instanceof Error
              ? err.message
              : String(err),
        );
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      live = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [url, epoch, attempt]);

  return { data, error, loading, retry };
}
