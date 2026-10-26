import { getRoute } from "@/server/crm/routes";
import { getCertificate } from "@/server/erp/certificates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET } = getRoute(getCertificate);
