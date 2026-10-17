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
  placeholder: string;
  /** Spans both columns on wide screens. */
  wide?: boolean;
};

const account: FieldDef = { name: "account", label: "Account", type: "text", placeholder: "e.g. ACC-1001" };
const phone: FieldDef = { name: "phone", label: "Phone Number", type: "tel", placeholder: "+254 7XX XXX XXX" };
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

/** Placeholder rows to demonstrate the list. Not real data. */
export const sampleCustomers: Customer[] = [
  { id: "c1", type: "Company", name: "Savanna Logistics Ltd", account: "ACC-3001", phone: "+254 700 000 101", email: "accounts@savanna-logistics.example", location: "Industrial Area, Nairobi", pin: "P000000001A" },
  { id: "c2", type: "End User", name: "Wanjiru Mwangi", account: "ACC-1001", phone: "+254 700 000 102", email: "wanjiru.mwangi@example.com", location: "Kilimani, Nairobi" },
  { id: "c3", type: "Distributor", name: "Otieno Ochieng", account: "ACC-2001", phone: "+254 700 000 103", email: "otieno.ochieng@example.com", location: "Kisumu" },
  { id: "c4", type: "Company", name: "Rift Valley Haulage Ltd", account: "ACC-3002", phone: "+254 700 000 104", email: "info@riftvalley-haulage.example", location: "Nakuru", pin: "P000000002B" },
  { id: "c5", type: "End User", name: "Brian Kiptoo", account: "ACC-1002", phone: "+254 700 000 105", email: "brian.kiptoo@example.com", location: "Eldoret" },
  { id: "c6", type: "Distributor", name: "Fatuma Hassan", account: "ACC-2002", phone: "+254 700 000 106", email: "fatuma.hassan@example.com", location: "Mombasa" },
  { id: "c7", type: "Company", name: "Lakeview Transport", account: "ACC-3003", phone: "+254 700 000 107", email: "office@lakeview-transport.example", location: "Kisumu", pin: "P000000003C" },
  { id: "c8", type: "End User", name: "Grace Njeri", account: "ACC-1003", phone: "+254 700 000 108", email: "grace.njeri@example.com", location: "Thika" },
];
