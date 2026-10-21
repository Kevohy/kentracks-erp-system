import { getList } from "@/server/erp/iot-routes";
import { listGpsPlatforms } from "@/server/erp/gps-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — every GPS platform with this company's accounts on it (never passwords, hashes or tokens). */
export const GET = getList((c) => listGpsPlatforms(c));
