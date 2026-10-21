import "server-only";
import { createMockGpsClient, verifyDevice, type GpsPlatformClient, type VerifyOutcome } from "@/lib/gps-platform";
import { isLocalDatabaseUrl } from "../crm/db";

/**
 * Server-side GPSPlatform client. The server re-verifies the IMEI itself and never trusts device
 * details sent by the browser. Until a real GPSPlatform client exists (it needs credentials that
 * must stay on the server), only the MOCK is available, and only when GPS_MOCK=1 is set explicitly
 * on a machine whose database is local. Anywhere else verification fails closed, so a sale cannot be recorded
 * with an unverified device.
 */
const devGateOpen = () => process.env.GPS_MOCK === "1" && isLocalDatabaseUrl(process.env.DATABASE_URL);

export const serverGpsClient: GpsPlatformClient = createMockGpsClient(devGateOpen, 0);

export const verifyImeiOnServer = (imei: string): Promise<VerifyOutcome> => verifyDevice(serverGpsClient, imei);
