import { collectionRoutes } from "@/server/crm/routes";
import { createSupplier, listSuppliers } from "@/server/crm/suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes({ list: listSuppliers, create: createSupplier });
