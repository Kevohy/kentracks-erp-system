export { formatKes, formatMinor, paymentState } from "./purchases";

import { formatKes } from "./purchases";

/** An amount that may be negative (a loss), e.g. -150000 -> "-KES 1,500.00". */
export const formatSigned = (minor: number) => (minor < 0 ? `-${formatKes(-minor)}` : formatKes(minor));

/** Plain number text for putting an amount back into an input, e.g. 550000 -> "5500". */
export function minorToInputValue(minor: number): string {
  const cents = minor % 100;
  const whole = Math.floor(minor / 100).toString();
  return cents ? `${whole}.${cents.toString().padStart(2, "0")}` : whole;
}
