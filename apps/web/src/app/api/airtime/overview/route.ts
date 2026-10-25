import { getList } from "@/server/erp/iot-routes";
import { getAirtimeOverview } from "@/server/erp/airtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the Airtime dashboard: Africa's Talking balance and monthly airtime counts. */
export const GET = getList((c) => getAirtimeOverview(c));
