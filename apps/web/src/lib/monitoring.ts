/** Settings → Server monitoring: what the server reports about itself. No secrets, addresses or personal data. */

export type MonitorJob = { name: string; lastRunAt: string; durationMs: number; ok: boolean; summary: string; runs: number; failures: number };

export type Monitoring = {
  asOf: string;
  overall: "ok" | "warning" | "down";
  app: {
    uptimeSeconds: number;
    node: string;
    environment: string;
    /** heapTotalBytes: the most the app's heap may grow to. */
    memory: { rssBytes: number; heapUsedBytes: number; heapTotalBytes: number };
    system: { cpus: number; load1: number; load5: number; totalMemBytes: number; freeMemBytes: number };
    /** Average delay of the server's event loop over the last minute (ms): high means it is overloaded. */
    eventLoopDelayMs: number;
  };
  database: { ok: boolean; latencyMs: number | null; sizeBytes: number | null; connections: number | null; migrations: number | null };
  /** Row-level security on the app's own database connections: active only when the role in use cannot skip it. */
  rls: { active: boolean; tables: number; role: string | null };
  requests: {
    perMinute: { minute: string; requests: number; limited: number; errors: number }[];
    lastHour: { requests: number; limited: number; errors: number };
    lastFiveMinutes: { requests: number; limited: number; errors: number };
  };
  rateLimit: { capacity: number; perSecond: number; clients: number; limitedNow: number };
  jobs: MonitorJob[];
  gps: { accounts: number; devices: number; statusCheckedAt: string | null };
};

export const MONITOR_REFRESH_SECONDS = 10;

/** 1536 → "1.5 KB", 5_400_000 → "5.1 MB". */
export function bytes(n: number | null): string {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** 93784 → "1 d 2 h", 3720 → "1 h 2 min", 45 → "45 s". */
export function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${Math.floor(seconds)} s`;
}
