import { getById, writeById } from "@/server/erp/iot-routes";
import { listGroupBills, recordGroupBill } from "@/server/erp/iot-sims";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET the bills of a group; POST { period, amount, note } records (or replaces) one month. */
export const GET = getById((c, id) => listGroupBills(c, id));
export const POST = writeById(recordGroupBill);
