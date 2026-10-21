import { collectionRoutes } from "@/server/crm/routes";
import { createCustomer, listCustomers } from "@/server/crm/customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes({ list: listCustomers, create: createCustomer });
