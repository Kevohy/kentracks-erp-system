import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { validateBrand, type BrandErrors } from "@/lib/brand-validation";
import { BRAND_PROFILE_FIELDS, MAX_BRAND_IMAGE_BYTES, defaultBrandNames, type Brand, type BrandImageKind, type BrandProfile } from "@/lib/brands";
import { requireAdmin, type AuthContext } from "./auth";
import { getDb } from "./db";
import { ApiError, isUuid, uniqueViolation } from "./http";
import { brandImages, brands } from "./schema";

type Db = ReturnType<typeof getDb>;
type Row = typeof brands.$inferSelect;
const DUPLICATE = "A brand with this name already exists";
const KINDS: readonly BrandImageKind[] = ["logo", "signature"];
export const isBrandImageKind = (v: string): v is BrandImageKind => (KINDS as readonly string[]).includes(v);

const imageUrl = (brandId: string, kind: BrandImageKind, at: Date | undefined) =>
  at ? `/api/settings/brands/${brandId}/images/${kind}?v=${at.getTime()}` : null;

const toBrand = (r: Row, images: Map<string, Date>): Brand => ({
  id: r.id,
  name: r.name,
  tagline: r.tagline,
  phone: r.phone,
  email: r.email,
  website: r.website,
  location: r.location,
  directorName: r.directorName,
  logoUrl: imageUrl(r.id, "logo", images.get(`${r.id}:logo`)),
  signatureUrl: imageUrl(r.id, "signature", images.get(`${r.id}:signature`)),
});

const select = (db: Db, tenantId: string) =>
  db.select().from(brands).where(eq(brands.tenantId, tenantId)).orderBy(asc(brands.createdAt), asc(brands.name)).limit(200);

/** When each brand image of this company last changed (no image data is read). */
async function imageVersions(db: Db, tenantId: string): Promise<Map<string, Date>> {
  const rows = await db.select({ brandId: brandImages.brandId, kind: brandImages.kind, at: brandImages.updatedAt }).from(brandImages)
    .where(eq(brandImages.tenantId, tenantId));
  return new Map(rows.map((r) => [`${r.brandId}:${r.kind}`, r.at]));
}

/** This company's brands. A company with none yet gets the defaults (Protrack, Kentracks) the first time they are listed. */
export async function loadBrands(db: Db, tenantId: string): Promise<Brand[]> {
  let rows = await select(db, tenantId);
  if (rows.length === 0) {
    // Distinct timestamps keep them in this order (Protrack first) in every list.
    const now = Date.now();
    await db
      .insert(brands)
      .values(defaultBrandNames.map((name, i) => ({ tenantId, name, createdAt: new Date(now + i) })))
      .onConflictDoNothing();
    rows = await select(db, tenantId);
  }
  const images = await imageVersions(db, tenantId);
  return rows.map((r) => toBrand(r, images));
}

export const listBrands = (ctx: AuthContext) => loadBrands(getDb(), ctx.tenantId);

const invalid = (errors: Record<string, string>): never => {
  throw new ApiError(422, "Please correct the highlighted fields", errors);
};

/** Reads the profile fields from a request body. Only these fields are accepted, each as text. */
function readProfile(body: Record<string, unknown>): Partial<BrandProfile> {
  const allowed = BRAND_PROFILE_FIELDS as readonly string[];
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length) invalid(Object.fromEntries(extra.map((k) => [k, "This field is not accepted"])));
  const out: Partial<BrandProfile> = {};
  const wrong: Record<string, string> = {};
  for (const k of BRAND_PROFILE_FIELDS) {
    if (body[k] === undefined) continue;
    if (typeof body[k] !== "string") wrong[k] = "Must be text";
    else out[k] = body[k] as string;
  }
  if (Object.keys(wrong).length) invalid(wrong);
  return out;
}

const check = (errors: BrandErrors) => {
  if (Object.keys(errors).length) invalid(errors as Record<string, string>);
};

export async function createBrand(ctx: AuthContext, body: Record<string, unknown>): Promise<Brand> {
  requireAdmin(ctx, "add or change brands");
  const input = readProfile(body);
  const db = getDb();
  const { errors, value } = validateBrand({ ...input, name: input.name ?? "" }, await loadBrands(db, ctx.tenantId));
  check(errors);
  try {
    const [row] = await db.insert(brands).values({ tenantId: ctx.tenantId, ...value }).returning();
    return toBrand(row, new Map());
  } catch (e) {
    if (uniqueViolation(e) === "brands_tenant_name_uq") invalid({ name: DUPLICATE });
    throw e;
  }
}

/**
 * Changes a brand. Only the fields sent are changed (a body with just `name` renames it); customers tagged with the
 * brand follow a new name.
 */
export async function updateBrand(ctx: AuthContext, id: string, body: Record<string, unknown>): Promise<Brand | null> {
  requireAdmin(ctx, "add or change brands");
  const input = readProfile(body);
  const db = getDb();
  const all = await loadBrands(db, ctx.tenantId);
  const current = all.find((b) => b.id === id);
  if (!current) return null;
  const { errors, value } = validateBrand({ ...current, ...input }, all, id);
  check(errors);
  try {
    const [row] = await db.update(brands).set({ ...value, updatedAt: new Date() })
      .where(and(eq(brands.id, id), eq(brands.tenantId, ctx.tenantId))).returning();
    return row ? toBrand(row, await imageVersions(db, ctx.tenantId)) : null;
  } catch (e) {
    if (uniqueViolation(e) === "brands_tenant_name_uq") invalid({ name: DUPLICATE });
    throw e;
  }
}

// ------------------------------------------------------------------- images (logo, director's signature)

/** The image type from the file's first bytes; the declared type must agree. SVG is not accepted (it can carry script). */
function sniff(b: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const KIND_LABEL: Record<BrandImageKind, string> = { logo: "Logo", signature: "Signature" };

/** Largest request body for an image upload: 500 KB of image as base64, plus a little JSON. */
export const BRAND_IMAGE_BODY_BYTES = Math.ceil(MAX_BRAND_IMAGE_BYTES / 3) * 4 + 1024;

async function ownBrand(db: Db, ctx: AuthContext, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const [r] = await db.select({ id: brands.id }).from(brands).where(and(eq(brands.id, id), eq(brands.tenantId, ctx.tenantId)));
  return !!r;
}

/** PUT …/brands/{id}/images/{kind} { image: "data:image/png;base64,…" } — sets the logo or the director's signature. */
export async function setBrandImage(ctx: AuthContext, id: string, kind: BrandImageKind, body: Record<string, unknown>): Promise<Brand | null> {
  requireAdmin(ctx, "add or change brands");
  const extra = Object.keys(body).filter((k) => k !== "image");
  if (extra.length) invalid(Object.fromEntries(extra.map((k) => [k, "This field is not accepted"])));
  const label = KIND_LABEL[kind];
  const m = typeof body.image === "string" ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.image) : null;
  if (!m) return invalid({ image: `${label} must be a PNG, JPEG or WebP image` });
  const data = Buffer.from(m[2], "base64");
  if (data.length === 0) return invalid({ image: `${label} is empty` });
  if (data.length > MAX_BRAND_IMAGE_BYTES) return invalid({ image: `${label} must be 500 KB or smaller` });
  const mime = sniff(data);
  if (!mime || mime !== m[1]) return invalid({ image: `${label} must be a PNG, JPEG or WebP image` });
  const db = getDb();
  if (!(await ownBrand(db, ctx, id))) return null;
  const now = new Date();
  await db.insert(brandImages).values({ brandId: id, tenantId: ctx.tenantId, kind, mime, bytes: data.length, data, updatedAt: now })
    .onConflictDoUpdate({ target: [brandImages.brandId, brandImages.kind], set: { mime, bytes: data.length, data, updatedAt: now } });
  return (await loadBrands(db, ctx.tenantId)).find((b) => b.id === id) ?? null;
}

/** DELETE …/brands/{id}/images/{kind} — removes the logo or the signature. */
export async function removeBrandImage(ctx: AuthContext, id: string, kind: BrandImageKind): Promise<Brand | null> {
  requireAdmin(ctx, "add or change brands");
  const db = getDb();
  if (!(await ownBrand(db, ctx, id))) return null;
  await db.delete(brandImages).where(and(eq(brandImages.brandId, id), eq(brandImages.kind, kind), eq(brandImages.tenantId, ctx.tenantId)));
  return (await loadBrands(db, ctx.tenantId)).find((b) => b.id === id) ?? null;
}

/** GET …/brands/{id}/images/{kind} — the image itself, for signed-in users of the brand's company only. */
export async function getBrandImage(ctx: AuthContext, id: string, kind: BrandImageKind): Promise<{ mime: string; data: Buffer; at: Date } | null> {
  if (!isUuid(id)) return null;
  const [r] = await getDb().select({ mime: brandImages.mime, data: brandImages.data, at: brandImages.updatedAt }).from(brandImages)
    .where(and(eq(brandImages.brandId, id), eq(brandImages.kind, kind), eq(brandImages.tenantId, ctx.tenantId)));
  return r ?? null;
}
