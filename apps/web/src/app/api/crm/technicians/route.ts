import { collectionRoutes } from "@/server/crm/routes";
import { createTechnician, listTechnicians } from "@/server/crm/technicians";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes({ list: listTechnicians, create: createTechnician });
