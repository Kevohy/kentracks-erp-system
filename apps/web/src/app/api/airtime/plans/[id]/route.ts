import { getAuthContext } from "@/server/crm/auth";
import { ApiError, handle, json } from "@/server/crm/http";
import { approveAirtimePlan, stopAirtimePlan } from "@/server/erp/airtime";
import { writeById } from "@/server/erp/iot-routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT { monthlyAmount, renewalPrice, expirySource: "IMEI" | "Custom", customExpiry } — approve or change monthly airtime. */
export const PUT = writeById((c, id, b) => approveAirtimePlan(c, id, b));

/** DELETE — stop monthly airtime for this line (it goes back to waiting for approval). */
export const DELETE = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    const r = await stopAirtimePlan(ctx, (await params).id);
    if (!r) throw new ApiError(404, "Record not found");
    return json(r);
  });
