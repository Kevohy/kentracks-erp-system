/** Sign-in form rules, shared by the page (instant feedback) and the server (the real check), so the two cannot drift. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_PASSWORD_LENGTH = 200;

/** The one message for a failed sign-in: it never says which half was wrong. */
export const BAD_CREDENTIALS = "Incorrect email or password.";

export type LoginErrors = { email?: string; password?: string };

export function validateLogin(rawEmail: string, password: string): LoginErrors {
  const errors: LoginErrors = {};
  const email = rawEmail.trim();
  if (!email) errors.email = "Enter your email address.";
  else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Enter your password.";
  else if (password.length > MAX_PASSWORD_LENGTH) errors.password = BAD_CREDENTIALS;
  return errors;
}
