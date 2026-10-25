import { writeById } from "@/server/erp/iot-routes";
import { setReminderBlock } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { blocked } — block or unblock this customer from reminders. */
export const POST = writeById((c, id, b) => setReminderBlock(c, id, b));
