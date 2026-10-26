import { collectionRoutes } from "@/server/crm/routes";
import { createInvoice, listInvoices } from "@/server/erp/invoices";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — invoices (newest first). POST — create one. */
export const { GET, POST } = collectionRoutes({ list: listInvoices, create: createInvoice });
