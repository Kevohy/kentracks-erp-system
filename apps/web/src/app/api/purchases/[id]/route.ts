import { getRoute } from "@/server/crm/routes";
import { getPurchase } from "@/server/erp/purchases";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET } = getRoute(getPurchase);
