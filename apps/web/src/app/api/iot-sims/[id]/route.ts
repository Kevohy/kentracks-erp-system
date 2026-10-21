import { writeById } from "@/server/erp/iot-routes";
import { updateIotSim } from "@/server/erp/iot-sims";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT /api/iot-sims/{saleId} { renewalFee, expiryDate } */
export const PUT = writeById(updateIotSim);
