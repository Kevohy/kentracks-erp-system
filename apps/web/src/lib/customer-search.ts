import { sampleCustomers } from "./customers";

/** Dropdown options for choosing an existing CRM customer. */
export const customerOptions = sampleCustomers.map((c) => ({ value: c.id, label: `${c.name} (${c.account})` }));

/** Phone numbers match however they are typed: 0700…, 254700… or +254700… */
const localDigits = (t: string) => t.replace(/\D/g, "").replace(/^(254|0)/, "");

/** Search text matches a customer's name, account, phone, email or location. `q` is lower-case. */
export function customerMatches(option: { value: string }, q: string): boolean {
  const c = sampleCustomers.find((x) => x.id === option.value);
  if (!c) return false;
  const qPhone = localDigits(q);
  return (
    [c.name, c.account, c.phone, c.email, c.location].some((f) => f.toLowerCase().includes(q)) ||
    (qPhone.length >= 3 && localDigits(c.phone).includes(qPhone))
  );
}
