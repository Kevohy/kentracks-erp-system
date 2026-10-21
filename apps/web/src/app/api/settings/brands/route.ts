import { collectionRoutes } from "@/server/crm/routes";
import { createBrand, listBrands } from "@/server/crm/brands";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes({ list: listBrands, create: createBrand });
