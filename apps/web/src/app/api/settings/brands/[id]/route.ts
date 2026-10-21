import { putRoute } from "@/server/crm/routes";
import { updateBrand } from "@/server/crm/brands";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { PUT } = putRoute(updateBrand);
