/**
 * Runs once when a server starts. On the Node.js server it starts:
 *  - the automatic monthly airtime reminder job (Communication → Bulk SMS → SMS Reminders); SMS_AUTO_REMINDERS=off stops it;
 *  - the background GPS refresh of device status and dates (src/server/erp/gps-sync.ts); GPS_AUTO_SYNC=off stops it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SMS_AUTO_REMINDERS !== "off") {
    const { startSmsScheduler } = await import("./server/erp/sms-scheduler");
    startSmsScheduler();
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.GPS_AUTO_SYNC !== "off") {
    const { startGpsScheduler } = await import("./server/erp/gps-scheduler");
    startGpsScheduler();
  }
}
