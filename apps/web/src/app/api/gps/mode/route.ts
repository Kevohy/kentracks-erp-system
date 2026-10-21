import { getList } from "@/server/erp/iot-routes";
import { gpsMode } from "@/server/erp/gps";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/gps/mode — how IMEIs are verified for this company: its GPS platforms (Kentracks, iTrack), the development mock, or not at all. */
export const GET = getList((c) => gpsMode(c.tenantId));
