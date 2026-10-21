/** GPS platforms the ERP connects to (Settings → GPS Platforms). More platforms will be added to this list. */
export const GPS_PLATFORMS = [
  { id: "kentracks", name: "Kentracks", url: "http://api.kentracksgps.com" },
  { id: "itrack", name: "iTrack", url: "http://api.itrack.top" },
] as const;
export type GpsPlatformId = (typeof GPS_PLATFORMS)[number]["id"];
export const isGpsPlatformId = (v: string): v is GpsPlatformId => GPS_PLATFORMS.some((p) => p.id === v);

/** One saved API account and its access-token state. Never includes the password, its hash, or the token. */
export type GpsAccountStatus = {
  id: string;
  platform: GpsPlatformId;
  account: string;
  connected: boolean;
  obtainedAt: string | null;
  refreshAt: string | null;
  expiresAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
  updatedAt: string;
};

export type GpsPlatformInfo = { id: GpsPlatformId; name: string; server: string; accounts: GpsAccountStatus[] };
