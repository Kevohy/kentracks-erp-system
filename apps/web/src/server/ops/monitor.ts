import "server-only";
import os from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";
import v8 from "node:v8";
import { sql } from "drizzle-orm";
import type { Monitoring } from "@/lib/monitoring";
import { requireAdmin, type AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { billingDevices } from "../erp/billing";
import { jobRuns, lastHour, startedAt } from "./metrics";
import { bucketConfig, bucketStats } from "./token-bucket";

const g = globalThis as typeof globalThis & { __ktLoopDelay?: ReturnType<typeof monitorEventLoopDelay> };
/** Measures how late the event loop runs (started on the first look at this page, reset every minute). */
function loopDelay() {
  if (!g.__ktLoopDelay) {
    g.__ktLoopDelay = monitorEventLoopDelay({ resolution: 20 });
    g.__ktLoopDelay.enable();
    setInterval(() => g.__ktLoopDelay?.reset(), 60_000).unref?.();
  }
  const ms = g.__ktLoopDelay.mean / 1e6;
  return Number.isFinite(ms) ? Math.round(ms * 10) / 10 : 0;
}

const sum = (list: { requests: number; limited: number; errors: number }[]) =>
  list.reduce((a, m) => ({ requests: a.requests + m.requests, limited: a.limited + m.limited, errors: a.errors + m.errors }), { requests: 0, limited: 0, errors: 0 });

/** GET /api/settings/monitoring — administrators only. */
export async function getMonitoring(ctx: AuthContext): Promise<Monitoring> {
  requireAdmin(ctx, "see server monitoring");
  const db = getDb();

  let database: Monitoring["database"] = { ok: false, latencyMs: null, sizeBytes: null, connections: null, migrations: null };
  try {
    const t0 = performance.now();
    await db.execute(sql`select 1`);
    const latencyMs = Math.round((performance.now() - t0) * 10) / 10;
    const [info] = (await db.execute<{ size: string; conns: number }>(sql`
      SELECT pg_database_size(current_database())::text AS size,
             (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS conns`)).rows;
    let migrations: number | null = null;
    try {
      migrations = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)).rows[0]?.n ?? null;
    } catch {
      migrations = null; // the migration table is elsewhere or not readable: just not shown
    }
    database = { ok: true, latencyMs, sizeBytes: Number(info.size), connections: info.conns, migrations };
  } catch {
    database = { ok: false, latencyMs: null, sizeBytes: null, connections: null, migrations: null };
  }

  let rls: Monitoring["rls"] = { active: false, tables: 0, role: null };
  if (database.ok) {
    try {
      const [x] = (await db.execute<{ role: string; skips: boolean; tables: number }>(sql`
        SELECT current_user AS role, (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS skips,
               (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND c.relforcerowsecurity) AS tables`)).rows;
      rls = { active: !x.skips && x.tables > 0, tables: x.tables, role: x.role };
    } catch {
      rls = { active: false, tables: 0, role: null };
    }
  }

  let gps: Monitoring["gps"] = { accounts: 0, devices: 0, statusCheckedAt: null };
  if (database.ok) {
    const [x] = (await db.execute<{ accounts: number; devices: number; checked: Date | string | null }>(sql`
      SELECT (SELECT count(*)::int FROM gps_platform_accounts WHERE tenant_id = ${ctx.tenantId}) AS accounts,
             count(*)::int AS devices, max(GREATEST(v.gps_status_at, v.gps_synced_at)) AS checked
      FROM (${billingDevices(ctx.tenantId)}) v`)).rows;
    gps = { accounts: x.accounts, devices: x.devices, statusCheckedAt: x.checked ? new Date(x.checked).toISOString() : null };
  }

  const minutes = lastHour();
  const cfg = bucketConfig();
  const buckets = bucketStats(cfg);
  const mem = process.memoryUsage();
  const [load1, load5] = os.loadavg();
  const jobs = jobRuns().sort((a, b) => a.name.localeCompare(b.name));
  const lastFive = sum(minutes.slice(-5));
  const overall: Monitoring["overall"] = !database.ok ? "down"
    : !rls.active || lastFive.errors > 0 || jobs.some((j) => !j.ok) || (database.latencyMs ?? 0) > 500 ? "warning" : "ok";

  return {
    asOf: new Date().toISOString(),
    overall,
    app: {
      uptimeSeconds: Math.round((Date.now() - startedAt()) / 1000),
      node: process.version,
      environment: process.env.NODE_ENV === "production" ? "Production" : "Development",
      // Measured against the most the heap may grow to (V8's limit), not its current size, which is always nearly full.
      memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, heapTotalBytes: v8.getHeapStatistics().heap_size_limit },
      system: { cpus: os.cpus().length, load1: Math.round(load1 * 100) / 100, load5: Math.round(load5 * 100) / 100, totalMemBytes: os.totalmem(), freeMemBytes: os.freemem() },
      eventLoopDelayMs: loopDelay(),
    },
    database,
    rls,
    requests: {
      perMinute: minutes.map((m) => ({ minute: new Date(m.minute * 60_000).toISOString(), requests: m.requests, limited: m.limited, errors: m.errors })),
      lastHour: sum(minutes),
      lastFiveMinutes: lastFive,
    },
    rateLimit: { capacity: cfg.capacity, perSecond: cfg.perSecond, clients: buckets.clients, limitedNow: buckets.limited },
    jobs,
    gps,
  };
}
