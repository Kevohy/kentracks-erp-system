import { getRoute } from "@/server/crm/routes";
import { listCustomerVehicles } from "@/server/erp/certificates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the customer's tracked vehicles: the latest sale of each IMEI. */
export const { GET } = getRoute(listCustomerVehicles);
