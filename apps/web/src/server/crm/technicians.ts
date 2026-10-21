import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { technicianFields, type Technician, type TechnicianFieldName } from "@/lib/technicians";
import { validateTechnicianField } from "@/lib/technician-validation";
import { getDb } from "./db";
import { parseFields } from "./parse";
import { technicians } from "./schema";
import type { AuthContext } from "./auth";

type Row = typeof technicians.$inferSelect;

export const toTechnician = (r: Row): Technician => ({ id: r.id, name: r.name, phone: r.phone, email: r.email ?? "", location: r.location });

function parse(body: Record<string, unknown>) {
  const clean = parseFields<TechnicianFieldName>(body, technicianFields.map((f) => f.name), validateTechnicianField);
  return { name: clean.name, phone: clean.phone, email: clean.email || null, location: clean.location };
}

export async function listTechnicians(ctx: AuthContext): Promise<Technician[]> {
  const rows = await getDb().select().from(technicians).where(eq(technicians.tenantId, ctx.tenantId)).orderBy(desc(technicians.createdAt), desc(technicians.id)).limit(5000);
  return rows.map(toTechnician);
}

export async function getTechnician(ctx: AuthContext, id: string): Promise<Technician | null> {
  const [r] = await getDb().select().from(technicians).where(and(eq(technicians.id, id), eq(technicians.tenantId, ctx.tenantId)));
  return r ? toTechnician(r) : null;
}

export async function createTechnician(ctx: AuthContext, body: Record<string, unknown>): Promise<Technician> {
  const [r] = await getDb().insert(technicians).values({ ...parse(body), tenantId: ctx.tenantId }).returning();
  return toTechnician(r);
}

export async function updateTechnician(ctx: AuthContext, id: string, body: Record<string, unknown>): Promise<Technician | null> {
  const [r] = await getDb().update(technicians).set({ ...parse(body), updatedAt: new Date() }).where(and(eq(technicians.id, id), eq(technicians.tenantId, ctx.tenantId))).returning();
  return r ? toTechnician(r) : null;
}

export async function deleteTechnician(ctx: AuthContext, id: string): Promise<boolean> {
  const r = await getDb().delete(technicians).where(and(eq(technicians.id, id), eq(technicians.tenantId, ctx.tenantId))).returning({ id: technicians.id });
  return r.length > 0;
}
