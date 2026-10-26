import { getRoute, putRoute } from "@/server/crm/routes";
import { getInvoice, setInvoiceStatus } from "@/server/erp/invoices";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — one invoice with its lines. PUT { status } — mark it Paid or Unpaid. */
export const { GET } = getRoute(getInvoice);
export const { PUT } = putRoute(setInvoiceStatus);
