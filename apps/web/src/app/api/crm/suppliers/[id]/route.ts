import { itemRoutes } from "@/server/crm/routes";
import { deleteSupplier, getSupplier, updateSupplier } from "@/server/crm/suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, PUT, DELETE } = itemRoutes({ get: getSupplier, update: updateSupplier, remove: deleteSupplier });
