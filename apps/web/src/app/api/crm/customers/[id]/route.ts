import { itemRoutes } from "@/server/crm/routes";
import { deleteCustomer, getCustomer, updateCustomer } from "@/server/crm/customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, PUT, DELETE } = itemRoutes({ get: getCustomer, update: updateCustomer, remove: deleteCustomer });
