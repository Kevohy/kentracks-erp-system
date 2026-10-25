import { writeById } from "@/server/erp/iot-routes";
import { changeSimService } from "@/server/erp/sim-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { service: "None" | "SMS reminder" | "Automatic airtime recharge", reason } — change a sold SIM's airtime service (logged). */
export const POST = writeById((c, id, b) => changeSimService(c, id, b));
