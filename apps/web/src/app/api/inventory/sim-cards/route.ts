import { collectionRoutes } from "@/server/crm/routes";
import { createSimCard, listSimCards } from "@/server/erp/inventory";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes({ list: listSimCards, create: createSimCard });
