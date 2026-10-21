import { getRoute } from "@/server/crm/routes";
import { getSale } from "@/server/erp/sales";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET } = getRoute(getSale);
