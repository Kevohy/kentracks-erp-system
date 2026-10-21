import { getById, writeById } from "@/server/erp/iot-routes";
import { removeGpsAccount, updateGpsAccount } from "@/server/erp/gps-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT { account, password } — change an account (an empty password keeps the saved one). DELETE — remove it. */
export const PUT = writeById(updateGpsAccount);
export const DELETE = getById((c, id) => removeGpsAccount(c, id));
