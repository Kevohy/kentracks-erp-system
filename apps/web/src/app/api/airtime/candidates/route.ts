import { getList } from "@/server/erp/iot-routes";
import { listAirtimeCandidates } from "@/server/erp/airtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — tracker lines that can take airtime but are not on automatic airtime recharge yet. */
export const GET = getList((c) => listAirtimeCandidates(c));
