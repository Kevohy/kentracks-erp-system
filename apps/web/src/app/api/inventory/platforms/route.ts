import { collectionRoutes } from "@/server/crm/routes";
import { createPlatform, listPlatforms } from "@/server/erp/inventory";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes({ list: listPlatforms, create: createPlatform });
