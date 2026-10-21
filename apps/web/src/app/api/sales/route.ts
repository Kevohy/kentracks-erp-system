import { collectionRoutes } from "@/server/crm/routes";
import { createSale, listSales, SALE_BODY_BYTES } from "@/server/erp/sales";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes({ list: listSales, create: createSale, maxBodyBytes: SALE_BODY_BYTES });
