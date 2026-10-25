import { getList } from "@/server/erp/iot-routes";
import { listAirtimeHistory } from "@/server/erp/airtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the latest airtime sends with every line and its result. */
export const GET = getList((c) => listAirtimeHistory(c));
