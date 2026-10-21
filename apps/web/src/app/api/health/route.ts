import { sql } from "drizzle-orm";
import { getDb } from "@/server/crm/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — for Dokploy's health check and uptime monitors. Public, and says only whether the app and its
 * database answer: 200 {"status":"ok"} or 503 {"status":"unavailable"}. No version, error text or other details.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    return Response.json({ status: "ok" }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
