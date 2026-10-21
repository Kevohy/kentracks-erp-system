import { putRoute } from "@/server/crm/routes";
import { updateRenewalFee } from "@/server/erp/billing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT /api/billing/renewal-fee/{saleId} { renewalFee } */
export const { PUT } = putRoute(updateRenewalFee);
