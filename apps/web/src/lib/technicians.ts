export type Technician = {
  id: string;
  name: string;
  phone: string;
  /** Optional. Empty string when not provided. */
  email: string;
  location: string;
};

export type TechnicianFieldName = "name" | "phone" | "email" | "location";

export type TechnicianFieldDef = {
  name: TechnicianFieldName;
  label: string;
  type: "text" | "tel" | "email";
  placeholder: string;
  wide?: boolean;
};

/** Form fields in display order. Email is the only optional one. */
export const technicianFields: TechnicianFieldDef[] = [
  { name: "name", label: "Name", type: "text", placeholder: "Enter name", wide: true },
  { name: "phone", label: "Phone Number", type: "tel", placeholder: "e.g. 0712345678" },
  { name: "email", label: "Email (optional)", type: "email", placeholder: "name@example.com" },
  { name: "location", label: "Location", type: "text", placeholder: "e.g. Westlands, Nairobi", wide: true },
];

