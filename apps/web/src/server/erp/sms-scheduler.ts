/**
 * The automatic monthly airtime reminder job: every 10 minutes it sends the day's reminders for every company that
 * turned them on (and whose send hour has come). A database without the SMS tables (migrations not run yet) is skipped
 * quietly. Started by src/instrumentation.ts.
 */
import { recordJob } from "../ops/metrics";

/** SMS_AUTO_EVERY_MS shortens the interval for tests (at least 2 seconds). */
const EVERY_MS = Math.max(Number(process.env.SMS_AUTO_EVERY_MS) || 10 * 60_000, 2000);
const g = globalThis as typeof globalThis & { __ktSmsScheduler?: ReturnType<typeof setInterval> };

export function startSmsScheduler() {
  if (g.__ktSmsScheduler || !process.env.DATABASE_URL) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    const t0 = Date.now();
    try {
      const { runAutomaticReminders } = await import("./sms");
      await runAutomaticReminders();
      recordJob("SMS monthly reminders", t0, true, "Checked for reminders due");
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!/sms_reminder_settings|does not exist/.test(msg)) console.error("[sms] automatic reminder job failed:", msg.slice(0, 200));
      recordJob("SMS monthly reminders", t0, false, "Failed; see the server log");
    } finally {
      running = false;
    }
  };
  g.__ktSmsScheduler = setInterval(() => void tick(), EVERY_MS);
  g.__ktSmsScheduler.unref?.();
  setTimeout(() => void tick(), Math.min(30_000, EVERY_MS)).unref?.();
}
