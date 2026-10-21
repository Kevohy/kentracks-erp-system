import { writeById } from "@/server/erp/iot-routes";
import { updateIotGroup } from "@/server/erp/iot-sims";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT /api/iot-sims/groups/{simCardId} { billingPeriod } */
export const PUT = writeById(updateIotGroup);
