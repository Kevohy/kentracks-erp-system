import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeNextPath } from "@/lib/auth-redirect";
import { SESSION_COOKIE, validateSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(first(sp.next));

  // Someone who is already signed in has no use for this page.
  let signedIn = false;
  try {
    signedIn = !!(await validateSession((await cookies()).get(SESSION_COOKIE)?.value ?? null));
  } catch {
    /* database unavailable: show the form, sign-in will report the problem */
  }
  if (signedIn) redirect(next);

  const notice = first(sp.expired) === "1" ? "expired" : first(sp.signedout) === "1" ? "signedout" : null;
  return (
    <AuthLayout>
      <LoginForm next={next} notice={notice} />
    </AuthLayout>
  );
}
