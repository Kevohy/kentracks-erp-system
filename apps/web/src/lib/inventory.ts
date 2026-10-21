/** Types for the Inventory module. Records are saved by the server (src/server/erp). */

export type ProductCategory = { id: string; name: string };
export type Product = { id: string; categoryId: string; model: string };

export const simCardTypes = ["International IoT", "Local IoT", "Prepaid", "Postpaid"] as const;
export type SimCardType = (typeof simCardTypes)[number];
export type SimCard = { id: string; name: string; type: SimCardType };

/** Every platform gets these three licence types automatically. */
export const platformLicenceTypes = ["New Card", "Annual Card", "Lifelong Card"] as const;
export type PlatformCardType = (typeof platformLicenceTypes)[number];
/** How a SIM card is named wherever it is picked or listed, e.g. "Safaricom Prepaid". */
export const simLabel = (name: string, type: string) => `${name} ${type}`;
export type Platform = { id: string; name: string; licenceTypes: readonly string[] };

export function newPlatform(id: string, name: string): Platform {
  return { id, name, licenceTypes: platformLicenceTypes };
}




