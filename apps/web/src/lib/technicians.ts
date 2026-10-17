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

/** Placeholder rows to demonstrate the list. Not real data. */
export const sampleTechnicians: Technician[] = [
  { id: "t1", name: "Samuel Kiprono", phone: "+254712000301", email: "samuel.kiprono@example.com", location: "Westlands, Nairobi" },
  { id: "t2", name: "Mercy Atieno", phone: "+254722000302", email: "mercy.atieno@example.com", location: "Kisumu" },
  { id: "t3", name: "Hassan Abdi", phone: "+254733000303", email: "", location: "Mombasa" },
  { id: "t4", name: "Joyce Wambui-Kamau", phone: "+254745000304", email: "joyce.wambui@example.com", location: "Thika" },
  { id: "t5", name: "Peter O'Connor", phone: "+254711000305", email: "", location: "Nakuru" },
];
