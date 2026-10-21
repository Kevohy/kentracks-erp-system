import { writeById } from "@/server/erp/iot-routes";
import { suspendIotSim } from "@/server/erp/iot-sims";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/iot-sims/{saleId}/suspend { suspended } */
export const POST = writeById(suspendIotSim);
