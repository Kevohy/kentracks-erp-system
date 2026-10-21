import { getById, writeById } from "@/server/erp/iot-routes";
import { listSalePayments, recordSalePayment } from "@/server/erp/sale-payments";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the payments recorded for one sale, and what was paid when it was made. */
export const GET = getById((c, id) => listSalePayments(c, id));
/** POST { amount, method, reference, note, paidOn, clientKey } — record money received for a sale not paid in full. */
export const POST = writeById((c, id, b) => recordSalePayment(c, id, b));
