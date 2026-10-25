import { getList } from "@/server/erp/iot-routes";
import { listAirtimeLines } from "@/server/erp/airtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — tracker SIM lines that can get airtime, with their last airtime. */
export const GET = getList((c) => listAirtimeLines(c));
