import { getRoute } from "@/server/crm/routes";
import { paymentDefaults } from "@/server/erp/invoices";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the payment method and details last used on this brand's invoices. */
export const { GET } = getRoute(paymentDefaults);
