"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CircleAlert, Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { validateLogin, type LoginErrors } from "@/lib/auth-validation";
import { cn } from "@/lib/cn";

type Notice = "expired" | "signedout" | null;

const NOTICES: Record<Exclude<Notice, null>, string> = {
  expired: "Your session has ended. Sign in again to continue.",
  signedout: "You have been signed out.",
};

export function LoginForm({ next, notice }: { next: string; notice: Notice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const refocusPassword = useRef(false);

  // The inputs are disabled while a request is in flight, so focus can only return to the password once they are enabled again.
  useEffect(() => {
    if (!busy && refocusPassword.current) {
      refocusPassword.current = false;
      passwordRef.current?.focus();
    }
  }, [busy]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    setFormError("");
    const found = validateLogin(email, password);
    setErrors(found);
    if (found.email || found.password) {
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, remember, next }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; errors?: LoginErrors; redirectTo?: string } | null;
      if (res.ok && data?.redirectTo) {
        // A full navigation, so the app starts fresh with the new session. The form stays disabled until the page changes.
        window.location.assign(data.redirectTo);
        return;
      }
      if (res.status === 422 && data?.errors) {
        setErrors(data.errors);
      } else if (res.status === 401) {
        setFormError(data?.error ?? "Incorrect email or password.");
        setPassword("");
        refocusPassword.current = true;
      } else if (res.status === 429) {
        setFormError(data?.error ?? "Too many sign-in attempts. Please try again later.");
      } else if (res.status >= 500) {
        setFormError("We could not sign you in right now. Please try again in a moment.");
      } else {
        setFormError(data?.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    }
    submitting.current = false;
    setBusy(false);
  }

  const input = (hasError: boolean) =>
    cn(
      "min-h-12 w-full rounded-xl border bg-white px-3.5 text-[16px] text-ink placeholder:text-muted/70 disabled:bg-canvas disabled:text-muted",
      hasError ? "border-[#C62828]" : "border-line hover:border-[#c5ced7]",
    );

  return (
    <div>
      <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.2px]">Sign in</h1>
      <p className="mt-1.5 text-[16px] text-muted">Welcome back. Enter your details to continue.</p>

      {notice && !formError && (
        <p role="status" className="mt-6 flex items-start gap-2.5 rounded-xl bg-tint px-3.5 py-3 text-[14.5px] text-navy">
          <Info size={18} aria-hidden="true" className="mt-px shrink-0" />
          {NOTICES[notice]}
        </p>
      )}
      <div aria-live="assertive">
        {formError && (
          <p role="alert" className="mt-6 flex items-start gap-2.5 rounded-xl border border-[#f1c4c4] bg-[#fdf0f0] px-3.5 py-3 text-[14.5px] text-[#9f1f1f]">
            <CircleAlert size={18} aria-hidden="true" className="mt-px shrink-0" />
            {formError}
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-email" className="text-[14px] font-medium">Email address</label>
          <input
            id="login-email"
            ref={emailRef}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="you@company.com"
            value={email}
            disabled={busy}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
            }}
            onBlur={() => email && setErrors((x) => ({ ...x, email: validateLogin(email, "x").email }))}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "login-email-err" : undefined}
            className={input(!!errors.email)}
          />
          {errors.email && <p id="login-email-err" className="text-[13.5px] text-[#C62828]">{errors.email}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-password" className="text-[14px] font-medium">Password</label>
          <div className="relative">
            <input
              id="login-password"
              ref={passwordRef}
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              disabled={busy}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((x) => ({ ...x, password: undefined }));
              }}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "login-password-err" : undefined}
              className={cn(input(!!errors.password), "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              aria-pressed={show}
              disabled={busy}
              className="absolute right-1 top-1 grid size-10 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
            >
              {show ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
            </button>
          </div>
          {errors.password && <p id="login-password-err" className="text-[13.5px] text-[#C62828]">{errors.password}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14.5px]">
            <input
              type="checkbox"
              checked={remember}
              disabled={busy}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-[18px] rounded accent-navy"
            />
            Remember me
          </label>
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-[14.5px] font-medium text-navy hover:underline">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[16px] font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-80"
        >
          {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
