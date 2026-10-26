import { getAuthContext } from "@/server/crm/auth";
import { handle, json } from "@/server/crm/http";
import { listCertificateCustomers } from "@/server/erp/certificates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — customers with at least one tracked vehicle (Package or Hosting sale). */
export const GET = (req: Request) => handle(async () => json(await listCertificateCustomers(await getAuthContext(req))));
