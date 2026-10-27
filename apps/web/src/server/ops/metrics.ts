/**
 * In-memory server metrics for Settings → Server monitoring: API requests per minute (with how many were held back by
 * the rate limit and how many failed with a server error), and the last run of each background job. Kept on
 * globalThis so the proxy, the API handlers and the background jobs of this server process share them. Nothing here
 * holds personal data or secrets; a restart starts the figures again.
 */

const MINUTES = 60;

type Minute = { minute: number; requests: number; limited: number; errors: number };
export type JobRun = { name: string; lastRunAt: string; durationMs: number; ok: boolean; summary: string; runs: number; failures: number };

type Store = { startedAt: number; minutes: Minute[]; jobs: Map<string, JobRun> };
const g = globalThis as typeof globalThis & { __ktMetrics?: Store };
const store: Store = (g.__ktMetrics ??= { startedAt: Date.now(), minutes: [], jobs: new Map() });

function current(now = Date.now()): Minute {
  const minute = Math.floor(now / 60_000);
  let m = store.minutes.at(-1);
  if (!m || m.minute !== minute) {
    m = { minute, requests: 0, limited: 0, errors: 0 };
    store.minutes.push(m);
    while (store.minutes.length > MINUTES) store.minutes.shift();
  }
  return m;
}

/** One API request reached the server; `limited` when the rate limit turned it away. */
export function countRequest(limited = false) {
  const m = current();
  m.requests++;
  if (limited) m.limited++;
}

/** An API request failed with an unexpected server error (500). */
export function countError() {
  current().errors++;
}

/** The last hour, one entry per minute (oldest first), minutes without requests included. */
export function lastHour(now = Date.now()): Minute[] {
  const end = Math.floor(now / 60_000);
  const byMinute = new Map(store.minutes.map((m) => [m.minute, m]));
  return Array.from({ length: MINUTES }, (_, i) => byMinute.get(end - (MINUTES - 1) + i) ?? { minute: end - (MINUTES - 1) + i, requests: 0, limited: 0, errors: 0 });
}

export const startedAt = () => store.startedAt;

/** Records a background job run (time taken, whether it worked, a one-line summary without secrets). */
export function recordJob(name: string, startedMs: number, ok: boolean, summary: string) {
  const prev = store.jobs.get(name);
  store.jobs.set(name, {
    name,
    lastRunAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    ok,
    summary: summary.slice(0, 160),
    runs: (prev?.runs ?? 0) + 1,
    failures: (prev?.failures ?? 0) + (ok ? 0 : 1),
  });
}

export const jobRuns = () => [...store.jobs.values()];
