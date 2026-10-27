export const customerTypes = ["End User", "Distributor", "Company"] as const;
export type CustomerType = (typeof customerTypes)[number];

export type Customer = {
  id: string;
  type: CustomerType;
  /** Full name for people, company name for companies. */
  name: string;
  account: string;
  phone: string;
  email: string;
  location: string;
  /** People only (End User, Distributor). */
  firstName?: string;
  lastName?: string;
  /** Companies only. */
  pin?: string;
  /** The brand this customer belongs to (Settings → Brands); not set for customers added before brands existed. */
  brandId?: string;
  brandName?: string;
};

export type FieldName =
  | "fullName"
  | "firstName"
  | "lastName"
  | "companyName"
  | "account"
  | "phone"
  | "email"
  | "pin"
  | "location"
  | "brandId";

export type FieldDef = {
  name: FieldName;
  label: string;
  type: "text" | "tel" | "email";
  placeholder: string;
  /** Spans both columns on wide screens. */
  wide?: boolean;
  /** Short note under the label, e.g. that the field is optional. */
  hint?: string;
};

const account: FieldDef = { name: "account", label: "Account", type: "text", placeholder: "e.g. ACC-1001" };
// A customer may keep one of these private: give a phone number, an email, or both.
const phone: FieldDef = { name: "phone", label: "Phone", type: "tel", placeholder: "0712 345 678" };
const email: FieldDef = { name: "email", label: "Email", type: "email", placeholder: "name@example.com" };
const location: FieldDef = { name: "location", label: "Location", type: "text", placeholder: "e.g. Westlands, Nairobi" };

const person: FieldDef[] = [
  { name: "firstName", label: "First Name", type: "text", placeholder: "Enter first name" },
  { name: "lastName", label: "Last Name", type: "text", placeholder: "Enter last name" },
  account,
  phone,
  email,
  location,
];

/**
 * The fields the API takes for each customer type, in order. People are saved with a first and a last name; the form
 * asks for the full name in one box instead (formFieldsByType) and splits it.
 */
export const fieldsByType: Record<CustomerType, FieldDef[]> = {
  "End User": person,
  Distributor: person,
  Company: [
    { name: "companyName", label: "Company Name", type: "text", placeholder: "Enter company name", wide: true },
    account,
    phone,
    email,
    { name: "pin", label: "PIN", type: "text", placeholder: "Enter PIN" },
    { ...location, wide: true },
  ],
};

const fullName: FieldDef = { name: "fullName", label: "Full name", type: "text", placeholder: "e.g. Kelvin Kariuki", wide: true };

/** The form's fields for each customer type, in display order: one box for a person's full name. */
export const formFieldsByType: Record<CustomerType, FieldDef[]> = {
  "End User": [fullName, phone, email, account, location],
  Distributor: [fullName, phone, email, account, location],
  Company: [
    { name: "companyName", label: "Company name", type: "text", placeholder: "e.g. Rose Booker & Sons", wide: true },
    phone,
    email,
    account,
    { name: "pin", label: "KRA PIN", type: "text", placeholder: "e.g. P051234567A" },
    location,
  ],
};

export const isPerson = (t: CustomerType) => t !== "Company";

/** What each type means, shown under its name when choosing one. */
export const customerTypeHints: Record<CustomerType, string> = {
  "End User": "Owns a tracked vehicle",
  Distributor: "Resells trackers",
  Company: "A business or fleet",
};

/** "Kelvin Kariuki" → first "Kelvin", last "Kariuki"; everything after the first word is the last name. */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const [first = "", ...rest] = full.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") };
}

/** Capitalises the first letter of every word as it is typed: "kelvin kariuki" → "Kelvin Kariuki", "mary-jane" → "Mary-Jane". */
export function capitalizeName(raw: string): string {
  return raw.replace(/(^|[\s'’-])(\p{Ll})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase());
}

/** Current values of a customer as form field values. */
export function toFormValues(c: Customer): Partial<Record<FieldName, string>> {
  if (c.type === "Company") {
    return { companyName: c.name, account: c.account, phone: c.phone, email: c.email, pin: c.pin ?? "", location: c.location, brandId: c.brandId ?? "" };
  }
  const [first, ...rest] = c.name.split(" ");
  return {
    fullName: c.firstName !== undefined && c.lastName !== undefined ? `${c.firstName} ${c.lastName}`.trim() : c.name,
    firstName: c.firstName ?? first,
    lastName: c.lastName ?? rest.join(" "),
    account: c.account,
    phone: c.phone,
    email: c.email,
    location: c.location,
    brandId: c.brandId ?? "",
  };
}

/** Builds a customer from already-validated field values. */
export function fromFormValues(id: string, type: CustomerType, v: Partial<Record<FieldName, string>>): Customer {
  const get = (n: FieldName) => v[n] ?? "";
  const base = { id, type, account: get("account"), phone: get("phone"), email: get("email"), location: get("location") };
  if (type === "Company") return { ...base, name: get("companyName"), pin: get("pin") };
  return { ...base, name: `${get("firstName")} ${get("lastName")}`, firstName: get("firstName"), lastName: get("lastName") };
}
