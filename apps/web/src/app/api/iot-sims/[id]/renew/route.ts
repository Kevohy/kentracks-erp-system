import { writeById } from "@/server/erp/iot-routes";
import { renewIotSim } from "@/server/erp/iot-sims";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/iot-sims/{saleId}/renew { amount, newExpiry, note } */
export const POST = writeById(renewIotSim);
