import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";

export const metadata: Metadata = { title: "Forgot password" };

/**
 * There is deliberately no "email me a reset link" here: that needs outgoing email and single-use reset tokens, which
 * this system does not have yet. Until it does, an administrator sets a new password with `scripts/user.mts set-password`.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <div className="grid size-12 place-items-center rounded-2xl bg-tint text-navy">
        <KeyRound size={24} aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-[30px] font-semibold leading-tight tracking-[-0.2px]">Forgot your password?</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">
        Passwords are reset by your Kentracks administrator. Ask them to set a new password for your account, then sign in with it.
      </p>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">
        For your security, changing a password signs that account out everywhere.
      </p>
      <Link href="/login" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl border border-line px-4 text-[15px] font-semibold text-navy hover:bg-canvas">
        <ArrowLeft size={18} aria-hidden="true" />
        Back to sign in
      </Link>
    </AuthLayout>
  );
}
