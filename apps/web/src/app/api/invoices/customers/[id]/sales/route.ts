import { getRoute } from "@/server/crm/routes";
import { listCustomerSales } from "@/server/erp/invoices";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the customer's sales, each with the invoice lines it would add. */
export const { GET } = getRoute(listCustomerSales);
