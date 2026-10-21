import { collectionRoutes } from "@/server/crm/routes";
import { createPackage, listPackages } from "@/server/erp/packages";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes({ list: listPackages, create: createPackage });
