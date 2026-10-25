/**
 * Runs once when a server starts. On the Node.js server it starts the automatic monthly airtime reminder job
 * (Communication → Bulk SMS → SMS Reminders). Set SMS_AUTO_REMINDERS=off to keep a server from running it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SMS_AUTO_REMINDERS !== "off") {
    const { startSmsScheduler } = await import("./server/erp/sms-scheduler");
    startSmsScheduler();
  }
}
