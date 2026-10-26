import { cleanText } from "./validation";

/** Documents → Certificates: vehicle tracking certificates (proof of tracker installation). */

/** Contract lengths offered on a certificate: 1 to 5 years, or Lifetime (null). */
export const CONTRACT_OPTIONS = [
  { value: "1", label: "1 year" },
  { value: "2", label: "2 years" },
  { value: "3", label: "3 years" },
  { value: "4", label: "4 years" },
  { value: "5", label: "5 years" },
  { value: "lifetime", label: "Lifetime" },
] as const;
export type ContractValue = (typeof CONTRACT_OPTIONS)[number]["value"];
export const contractLabel = (years: number | null) => (years === null ? "Lifetime" : `${years} year${years === 1 ? "" : "s"}`);

/** A tracked vehicle of a customer: the latest Package or Hosting sale of each IMEI. */
export type CustomerVehicle = {
  saleId: string;
  imei: string;
  vehiclePlate: string;
  deviceModel: string;
  simNumber: string;
  technicianName: string;
  packageName: string;
  platformName: string;
  simName: string;
  /** YYYY-MM-DD: the GPS platform's activation date, else the day it was sold. */
  installedOn: string;
  /** Certificates already issued for this sale. */
  certificates: number;
};

/** A customer with the brand a certificate would be issued under. */
export type CertificateCustomer = { id: string; name: string; account: string; phone: string; email: string; location: string; brandId: string | null; vehicles: number };

/** What the public verification page (/verify/{code}) shows: enough to confirm the certificate, no contact details. */
export type CertificateCheck = {
  verifyCode: string;
  number: string;
  status: "Valid" | "Expired";
  ownerName: string;
  vehicleReg: string;
  makeModel: string;
  year: number;
  /** The IMEI with its last four digits hidden, exactly as printed on the certificate. */
  imeiMasked: string;
  installedOn: string;
  validUntil: string | null;
  contractYears: number | null;
  brandName: string;
  brandWebsite: string;
  brandPhone: string;
  issuedAt: string;
};

export type CertificateDraft = {
  customerId: string;
  saleId: string;
  vehicleReg: string;
  make: string;
  model: string;
  year: string;
  chassis: string;
  contract: string;
  brandId: string;
};
export type CertificateField = Exclude<keyof CertificateDraft, "customerId" | "saleId"> | "customerId" | "saleId";
export type CertificateErrors = Partial<Record<CertificateField, string>>;

export type Certificate = {
  id: string;
  number: string;
  saleId: string;
  customerId: string;
  brandId: string;
  customerName: string;
  customerPhone: string;
  customerAccount: string;
  customerEmail: string;
  customerLocation: string;
  /** Printed on the certificate and in its QR code: /verify/{verifyCode} confirms it publicly. */
  verifyCode: string;
  platformName: string;
  simName: string;
  imei: string;
  deviceModel: string;
  simNumber: string;
  technicianName: string;
  vehicleReg: string;
  make: string;
  model: string;
  year: number;
  chassis: string;
  contractYears: number | null;
  installedOn: string;
  validUntil: string | null;
  brand: {
    name: string; tagline: string; phone: string; email: string; website: string; location: string; directorName: string;
    /** The brand's current images (same-origin URLs), or null. */
    logoUrl: string | null; iconUrl: string | null; signatureUrl: string | null;
    /** The brand's current colour (#RRGGBB), or "" for the default red. */
    color: string;
  };
  issuedAt: string;
  issuedByName: string | null;
};

const PLATE = /^[A-Z0-9][A-Z0-9 -]{0,18}[A-Z0-9]$|^[A-Z0-9]$/;
const CHASSIS = /^[A-Z0-9-]{3,30}$/;
const MAKE = /^[\p{L}\p{N}][\p{L}\p{N} .&'/-]{0,39}$/u;

/** Upper-cases and tidies a registration ("kcd 123a" → "KCD 123A"). */
export const normalisePlate = (raw: string) => cleanText(raw).toUpperCase().replace(/\s+/g, " ");
export const normaliseChassis = (raw: string) => cleanText(raw).toUpperCase().replace(/\s+/g, "");

/** Validates the certificate form. The same rules run in the browser and on the server. */
export function validateCertificate(d: CertificateDraft, now = new Date()): { errors: CertificateErrors; value: { vehicleReg: string; make: string; model: string; year: number; chassis: string; contractYears: number | null } } {
  const errors: CertificateErrors = {};
  if (!d.customerId) errors.customerId = "Select a customer";
  if (!d.saleId) errors.saleId = "Select a vehicle";
  if (!d.brandId) errors.brandId = "Select a brand";

  const vehicleReg = normalisePlate(d.vehicleReg);
  if (!vehicleReg) errors.vehicleReg = "Enter the vehicle registration";
  else if (vehicleReg.length > 20 || !PLATE.test(vehicleReg)) errors.vehicleReg = "Use letters, numbers and spaces only, e.g. KCD 123A";

  const make = cleanText(d.make);
  if (!make) errors.make = "Enter the car make, e.g. Toyota";
  else if (!MAKE.test(make)) errors.make = "Up to 40 letters, numbers and spaces";

  const model = cleanText(d.model);
  if (!model) errors.model = "Enter the car model, e.g. Hilux";
  else if (!MAKE.test(model)) errors.model = "Up to 40 letters, numbers and spaces";

  const maxYear = now.getFullYear() + 1;
  const yearText = cleanText(d.year);
  const year = Number(yearText);
  if (!yearText) errors.year = "Enter the year of manufacture";
  else if (!/^\d{4}$/.test(yearText) || year < 1950 || year > maxYear) errors.year = `Enter a year from 1950 to ${maxYear}`;

  const chassis = normaliseChassis(d.chassis);
  if (!chassis) errors.chassis = "Enter the chassis number";
  else if (!CHASSIS.test(chassis)) errors.chassis = "3 to 30 letters and numbers";

  const option = CONTRACT_OPTIONS.find((o) => o.value === d.contract);
  if (!option) errors.contract = "Choose the contract type";
  const contractYears = !option || option.value === "lifetime" ? null : Number(option.value);

  return { errors, value: { vehicleReg, make, model, year, chassis, contractYears } };
}

/** installedOn (YYYY-MM-DD) plus whole years; null for Lifetime. 29 February moves to 28 February. */
export function validUntilOf(installedOn: string, years: number | null): string | null {
  if (years === null) return null;
  const [y, m, d] = installedOn.split("-").map(Number);
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${y + years}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** "2026-10-25" → "25 October 2026". A full timestamp is shown as its date in Nairobi. */
export const longDate = (iso: string) =>
  iso.length > 10
    ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" })
    : new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-03-05T12:25:00Z" → "Mar 5, 2026, 3:25 PM" (Nairobi). */
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Africa/Nairobi" });

/** "2026-03-04" → "Mar 04, 2026". A full timestamp is shown as its date in Nairobi. */
export const shortDate = (iso: string) =>
  new Date(iso.length > 10 ? iso : `${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: iso.length > 10 ? "Africa/Nairobi" : "UTC" });
