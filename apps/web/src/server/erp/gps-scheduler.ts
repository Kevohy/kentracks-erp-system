import { recordJob } from "../ops/metrics";

/**
 * Starts the background GPS refresh (gps-sync.ts), in two passes:
 *  - live status (Track API) of every tracked device, every minute: keeps the Dashboard's device counts and
 *    Billing's Online / Offline / Expired totals live;
 *  - device details (model and dates, which a newly added device gets after a while), every 10 minutes.
 * A database without the GPS tables yet (migrations not run) is skipped quietly. Started by src/instrumentation.ts;
 * set GPS_AUTO_SYNC=off to keep a server from running it.
 */
/** GPS_SYNC_EVERY_MS / GPS_STATUS_EVERY_MS shorten the intervals for tests (at least 2 seconds). */
const DETAILS_EVERY_MS = Math.max(Number(process.env.GPS_SYNC_EVERY_MS) || 10 * 60_000, 2000);
const STATUS_EVERY_MS = Math.max(Number(process.env.GPS_STATUS_EVERY_MS) || 60_000, 2000);
const g = globalThis as typeof globalThis & { __ktGpsScheduler?: ReturnType<typeof setInterval>[] };

/** "3 companies · 120 checked · 118 answered" from a job's result counts. */
function summaryOf(r: unknown): string {
  if (!r || typeof r !== "object") return "Done";
  return Object.entries(r as Record<string, unknown>).filter(([, v]) => typeof v === "number").map(([k, v]) => `${v} ${k}`).join(" · ") || "Done";
}

const quiet = (msg: string) => /gps_platform_accounts|gps_last_seen|gps_status_at|does not exist/.test(msg);

/** Runs `job` every `every` ms, never two at once. */
function every(every: number, firstAfter: number, name: string, job: () => Promise<unknown>) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    const t0 = Date.now();
    try {
      const r = await job();
      recordJob(`GPS ${name}`, t0, true, summaryOf(r));
    } catch (e) {
      const msg = (e as Error).message ?? "";
      // The message never holds a token: platform errors are written without the request URL.
      if (!quiet(msg)) console.error(`[gps] ${name} failed:`, msg.slice(0, 200));
      recordJob(`GPS ${name}`, t0, false, quiet(msg) ? "Waiting for the database update" : "Failed; see the server log");
    } finally {
      running = false;
    }
  };
  const t = setInterval(() => void tick(), every);
  t.unref?.();
  setTimeout(() => void tick(), Math.min(firstAfter, every)).unref?.();
  return t;
}

export function startGpsScheduler() {
  if (g.__ktGpsScheduler || !process.env.DATABASE_URL) return;
  g.__ktGpsScheduler = [
    every(STATUS_EVERY_MS, 20_000, "live status refresh", async () => {
      const { syncLiveStatus } = await import("./gps-sync");
      // Devices checked within the last interval (less a little slack) are not asked again.
      return syncLiveStatus(Math.max(1, Math.floor(STATUS_EVERY_MS / 1000) - 5));
    }),
    every(DETAILS_EVERY_MS, 45_000, "details refresh", async () => {
      const { syncGpsDevices } = await import("./gps-sync");
      return syncGpsDevices();
    }),
  ];
}
