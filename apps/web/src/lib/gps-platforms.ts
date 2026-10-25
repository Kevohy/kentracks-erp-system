/**
 * GPS platforms the ERP connects to (Communication → GPS Platform). More platforms will be added to this list.
 * Always https: access tokens and device data must not cross the internet unencrypted. If a provider has no https,
 * the server can be allowed to fall back to http with GPS_ALLOW_HTTP=1 (see gpsFetch in src/server/erp/gps-auth.ts).
 */
/*
 * Kentracks: api.kentracksgps.com is a name for the Protrack365 API server (CNAME localapi.protrack365.com, the same
 * address as api.protrack365.com) and has no https certificate of its own, so the ERP uses api.protrack365.com, whose
 * https certificate is valid. Same server, same accounts, encrypted.
 */
export const GPS_PLATFORMS = [
  { id: "kentracks", name: "Kentracks", url: "https://api.protrack365.com" },
  { id: "itrack", name: "iTrack", url: "https://api.itrack.top" },
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
