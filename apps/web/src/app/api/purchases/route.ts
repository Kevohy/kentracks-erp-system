import { collectionRoutes } from "@/server/crm/routes";
import { createPurchase, listPurchases, PURCHASE_BODY_BYTES } from "@/server/erp/purchases";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes({ list: listPurchases, create: createPurchase, maxBodyBytes: PURCHASE_BODY_BYTES });
