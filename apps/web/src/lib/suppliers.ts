export const supplierTypes = ["Individual", "Company"] as const;
export type SupplierType = (typeof supplierTypes)[number];

export type Supplier = {
  id: string;
  type: SupplierType;
  /** Full name for individuals, company name for companies. */
  name: string;
  /** Companies only. */
  contactPerson?: string;
  /** Individuals: their own. Companies: the contact person's. */
  phone: string;
  email: string;
  location: string;
  /** Companies only, optional. */
  kraPin?: string;
  /** Companies only. */
  department?: string;
};

export type SupplierFieldName =
  | "fullName"
  | "phone"
  | "email"
  | "location"
  | "companyName"
  | "kraPin"
  | "contactName"
  | "contactEmail"
  | "contactPhone"
  | "contactDepartment";

export type SupplierFieldDef = {
  name: SupplierFieldName;
  label: string;
  type: "text" | "tel" | "email";
  placeholder: string;
  wide?: boolean;
  /** Fields inside the Contact Person section. */
  group?: "contact";
};

const phone: SupplierFieldDef = { name: "phone", label: "Phone Number", type: "tel", placeholder: "e.g. 0712345678" };

/** Form fields for each supplier type, in display order. */
export const supplierFields: Record<SupplierType, SupplierFieldDef[]> = {
  Individual: [
    { name: "fullName", label: "Full Name", type: "text", placeholder: "Enter full name", wide: true },
    phone,
    { name: "email", label: "Email", type: "email", placeholder: "name@example.com" },
    { name: "location", label: "Location", type: "text", placeholder: "e.g. Westlands, Nairobi", wide: true },
  ],
  Company: [
    { name: "companyName", label: "Company Name", type: "text", placeholder: "Enter company name", wide: true },
    { name: "kraPin", label: "KRA PIN (optional)", type: "text", placeholder: "e.g. P051234567A" },
    { name: "location", label: "Location", type: "text", placeholder: "e.g. Industrial Area, Nairobi" },
    { name: "contactName", label: "Name", type: "text", placeholder: "Enter contact name", group: "contact" },
    { name: "contactEmail", label: "Email", type: "email", placeholder: "name@example.com", group: "contact" },
    { name: "contactPhone", label: "Phone Number", type: "tel", placeholder: "e.g. 0712345678", group: "contact" },
    { name: "contactDepartment", label: "Department", type: "text", placeholder: "e.g. Sales", group: "contact" },
  ],
};

export function fromSupplierValues(id: string, type: SupplierType, v: Partial<Record<SupplierFieldName, string>>): Supplier {
  const get = (n: SupplierFieldName) => v[n] ?? "";
  if (type === "Individual") {
    return { id, type, name: get("fullName"), phone: get("phone"), email: get("email"), location: get("location") };
  }
  return {
    id,
    type,
    name: get("companyName"),
    contactPerson: get("contactName"),
    phone: get("contactPhone"),
    email: get("contactEmail"),
    location: get("location"),
    department: get("contactDepartment"),
    ...(get("kraPin") ? { kraPin: get("kraPin") } : {}),
  };
}

