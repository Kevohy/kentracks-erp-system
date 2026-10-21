import { collectionRoutes } from "@/server/crm/routes";
import { createProduct, listProducts } from "@/server/erp/inventory";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes({ list: listProducts, create: createProduct });
