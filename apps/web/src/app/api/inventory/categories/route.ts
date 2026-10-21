import { collectionRoutes } from "@/server/crm/routes";
import { createCategory, listCategories } from "@/server/erp/inventory";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes({ list: listCategories, create: createCategory });
