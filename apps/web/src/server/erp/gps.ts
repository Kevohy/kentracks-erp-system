import "server-only";
import { createMockGpsClient, type GpsPlatformClient, type VerifyOutcome } from "@/lib/gps-platform";
import { isLocalDatabaseUrl } from "../crm/db";
import { GPS_PLATFORMS } from "@/lib/gps-platforms";
import { platformAccounts } from "./gps-auth";
import { verifyImeis } from "./gps-devices";

/**
 * Server-side IMEI verification. The server checks the IMEI itself and never trusts device details sent by the
 * browser. A company with Kentracks or iTrack API accounts (Settings → GPS Platforms) is verified against the real
 * platform APIs (src/server/erp/gps-devices.ts). Without any account, the development MOCK is used only when GPS_MOCK=1 is set
 * on a machine whose database is local; anywhere else verification fails closed with a clear message, so a sale
 * cannot be recorded with an unverified device.
 */
const devGateOpen = () => process.env.GPS_MOCK === "1" && isLocalDatabaseUrl(process.env.DATABASE_URL);
const mockClient: GpsPlatformClient = createMockGpsClient(devGateOpen, 0);
const mockIfAllowed = () => (devGateOpen() ? mockClient : null);

export const verifyImeiOnServer = async (tenantId: string, imei: string): Promise<VerifyOutcome> =>
  (await verifyImeis(tenantId, [imei], mockIfAllowed())).values().next().value!;

/** Many IMEIs at once (Billing): each platform is asked 100 IMEIs per request. Keyed by IMEI. */
export const verifyImeisOnServer = (tenantId: string, imeis: string[]) => verifyImeis(tenantId, imeis, mockIfAllowed(), false);

export type GpsMode = {
  /** "live": verified on the GPS platforms the company has accounts on; "mock": development test data; "none": not possible. */
  mode: "live" | "mock" | "none";
  accounts: number;
  /** Names of the platforms with at least one account, e.g. ["Kentracks", "iTrack"]. */
  platforms: string[];
};

/** Which verification a company gets now, for the sale form's notice. */
export async function gpsMode(tenantId: string): Promise<GpsMode> {
  const counts = await Promise.all(GPS_PLATFORMS.map(async (p) => ({ name: p.name, n: (await platformAccounts(tenantId, p.id)).length })));
  const accounts = counts.reduce((a, c) => a + c.n, 0);
  return { mode: accounts ? "live" : devGateOpen() ? "mock" : "none", accounts, platforms: counts.filter((c) => c.n > 0).map((c) => c.name) };
}
