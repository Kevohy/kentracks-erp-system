/** Mock data and types for the Inventory module. Frontend only; nothing is persisted. */

export type ProductCategory = { id: string; name: string };
export type Product = { id: string; categoryId: string; model: string };

export const simCardTypes = ["International IoT", "Local IoT", "Prepaid", "Postpaid"] as const;
export type SimCardType = (typeof simCardTypes)[number];
export type SimCard = { id: string; name: string; type: SimCardType };

/** Every platform gets these three licence types automatically. */
export const platformLicenceTypes = ["New Card", "Annual Card", "Lifelong Card"] as const;
export type Platform = { id: string; name: string; licenceTypes: readonly string[] };

export function newPlatform(id: string, name: string): Platform {
  return { id, name, licenceTypes: platformLicenceTypes };
}

export const sampleCategories: ProductCategory[] = [
  { id: "c1", name: "GPS Trackers" },
  { id: "c2", name: "Fuel Sensors" },
  { id: "c3", name: "Cameras" },
];

export const sampleProducts: Product[] = [
  { id: "p1", categoryId: "c1", model: "FMB920" },
  { id: "p2", categoryId: "c1", model: "TK-103 (2G)" },
  { id: "p3", categoryId: "c2", model: "LLS-AF 20160" },
  { id: "p4", categoryId: "c3", model: "DC-02 Dashcam" },
];

export const sampleSimCards: SimCard[] = [
  { id: "s1", name: "Safaricom", type: "Local IoT" },
  { id: "s2", name: "Airtel", type: "International IoT" },
  { id: "s3", name: "MTN", type: "Prepaid" },
];

export const samplePlatforms: Platform[] = [
  newPlatform("pl1", "Wialon"),
  newPlatform("pl2", "Gurtam Track"),
];
