import { itemRoutes } from "@/server/crm/routes";
import { deleteTechnician, getTechnician, updateTechnician } from "@/server/crm/technicians";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, PUT, DELETE } = itemRoutes({ get: getTechnician, update: updateTechnician, remove: deleteTechnician });
