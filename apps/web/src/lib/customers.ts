export const customerTypes = ["End user", "Distributor", "Company"] as const;
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
  /** Companies only. */
  pin?: string;
};

export type FieldName =
  | "firstName"
  | "lastName"
  | "companyName"
  | "account"
  | "phone"
  | "email"
  | "pin"
  | "location";

export type FieldDef = {
  name: FieldName;
  label: string;
  type: "text" | "tel" | "email";
  autoComplete?: string;
  /** Spans both columns on wide screens. */
  wide?: boolean;
};

const account: FieldDef = { name: "account", label: "Account", type: "text" };
const phone: FieldDef = { name: "phone", label: "Phone number", type: "tel", autoComplete: "off" };
const email: FieldDef = { name: "email", label: "Email", type: "email", autoComplete: "off", wide: true };
const location: FieldDef = { name: "location", label: "Location", type: "text", wide: true };

const person: FieldDef[] = [
  { name: "firstName", label: "First name", type: "text" },
  { name: "lastName", label: "Last name", type: "text" },
  account,
  phone,
  email,
  location,
];

/** The form fields for each customer type, in display order. */
export const fieldsByType: Record<CustomerType, FieldDef[]> = {
  "End user": person,
  Distributor: person,
  Company: [
    { name: "companyName", label: "Company name", type: "text", wide: true },
    account,
    phone,
    email,
    { name: "pin", label: "PIN", type: "text" },
    { name: "location", label: "Location", type: "text" },
  ],
};

/** Placeholder rows to demonstrate the list. Not real data. */
export const sampleCustomers: Customer[] = [
  { id: "c1", type: "Company", name: "Savanna Logistics Ltd", account: "ACC-3001", phone: "+254 700 000 101", email: "accounts@savanna-logistics.example", location: "Industrial Area, Nairobi", pin: "P000000001A" },
  { id: "c2", type: "End user", name: "Wanjiru Mwangi", account: "ACC-1001", phone: "+254 700 000 102", email: "wanjiru.mwangi@example.com", location: "Kilimani, Nairobi" },
  { id: "c3", type: "Distributor", name: "Otieno Ochieng", account: "ACC-2001", phone: "+254 700 000 103", email: "otieno.ochieng@example.com", location: "Kisumu" },
  { id: "c4", type: "Company", name: "Rift Valley Haulage Ltd", account: "ACC-3002", phone: "+254 700 000 104", email: "info@riftvalley-haulage.example", location: "Nakuru", pin: "P000000002B" },
  { id: "c5", type: "End user", name: "Brian Kiptoo", account: "ACC-1002", phone: "+254 700 000 105", email: "brian.kiptoo@example.com", location: "Eldoret" },
  { id: "c6", type: "Distributor", name: "Fatuma Hassan", account: "ACC-2002", phone: "+254 700 000 106", email: "fatuma.hassan@example.com", location: "Mombasa" },
  { id: "c7", type: "Company", name: "Lakeview Transport", account: "ACC-3003", phone: "+254 700 000 107", email: "office@lakeview-transport.example", location: "Kisumu", pin: "P000000003C" },
  { id: "c8", type: "End user", name: "Grace Njeri", account: "ACC-1003", phone: "+254 700 000 108", email: "grace.njeri@example.com", location: "Thika" },
];
