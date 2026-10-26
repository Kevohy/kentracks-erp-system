import { collectionRoutes } from "@/server/crm/routes";
import { createCertificate, listCertificates } from "@/server/erp/certificates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — issued certificates (newest first). POST — issue one. */
export const { GET, POST } = collectionRoutes({ list: listCertificates, create: createCertificate });
