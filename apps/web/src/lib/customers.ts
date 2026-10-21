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

const account: FieldDef = { name: "account", label: "Account", type: "text", placeholder: "e.g. ACC-1001 (no spaces)" };
// A customer may keep one of these private: give a phone number, an email, or both.
const phone: FieldDef = { name: "phone", label: "Phone Number", type: "tel", placeholder: "0712345678 or +254712345678", hint: "Optional if an email is given" };
const email: FieldDef = { name: "email", label: "Email", type: "email", placeholder: "name@example.com", hint: "Optional if a phone number is given" };
const location: FieldDef = { name: "location", label: "Location", type: "text", placeholder: "e.g. Westlands, Nairobi" };

const person: FieldDef[] = [
  { name: "firstName", label: "First Name", type: "text", placeholder: "Enter first name" },
  { name: "lastName", label: "Last Name", type: "text", placeholder: "Enter last name" },
  account,
  phone,
  email,
  location,
];

/** The form fields for each customer type, in display order. */
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


/** Current values of a customer as form field values. */
export function toFormValues(c: Customer): Partial<Record<FieldName, string>> {
  if (c.type === "Company") {
    return { companyName: c.name, account: c.account, phone: c.phone, email: c.email, pin: c.pin ?? "", location: c.location, brandId: c.brandId ?? "" };
  }
  const [first, ...rest] = c.name.split(" ");
  return {
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
