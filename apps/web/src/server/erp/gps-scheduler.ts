/**
 * Starts the background GPS refresh (gps-sync.ts) every 10 minutes. A database without the GPS tables yet (migrations
 * not run) is skipped quietly. Started by src/instrumentation.ts; set GPS_AUTO_SYNC=off to keep a server from running it.
 */
/** GPS_SYNC_EVERY_MS shortens the interval for tests (at least 2 seconds). */
const EVERY_MS = Math.max(Number(process.env.GPS_SYNC_EVERY_MS) || 10 * 60_000, 2000);
const g = globalThis as typeof globalThis & { __ktGpsScheduler?: ReturnType<typeof setInterval> };

export function startGpsScheduler() {
  if (g.__ktGpsScheduler || !process.env.DATABASE_URL) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { syncGpsDevices } = await import("./gps-sync");
      await syncGpsDevices();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      // The message never holds a token: platform errors are written without the request URL.
      if (!/gps_platform_accounts|gps_last_seen|does not exist/.test(msg)) console.error("[gps] background refresh failed:", msg.slice(0, 200));
    } finally {
      running = false;
    }
  };
  g.__ktGpsScheduler = setInterval(() => void tick(), EVERY_MS);
  g.__ktGpsScheduler.unref?.();
  setTimeout(() => void tick(), Math.min(45_000, EVERY_MS)).unref?.();
}
