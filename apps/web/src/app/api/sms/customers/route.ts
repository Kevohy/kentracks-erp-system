import { getList } from "@/server/erp/iot-routes";
import { listSmsCustomers } from "@/server/erp/sms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — every customer with their phone, device counts and last SMS. */
export const GET = getList((c) => listSmsCustomers(c));
