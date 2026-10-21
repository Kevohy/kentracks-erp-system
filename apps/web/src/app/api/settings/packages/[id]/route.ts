import { putRoute } from "@/server/crm/routes";
import { updatePackage } from "@/server/erp/packages";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { PUT } = putRoute(updatePackage);
