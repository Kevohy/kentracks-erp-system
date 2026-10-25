import { getAuthContext } from "@/server/crm/auth";
import { BRAND_IMAGE_BODY_BYTES, getBrandImage, isBrandImageKind, removeBrandImage, setBrandImage } from "@/server/crm/brands";
import { ApiError, handle, json, readJsonObject } from "@/server/crm/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; kind: string }> };

async function target(params: Ctx["params"]) {
  const { id, kind } = await params;
  if (!isBrandImageKind(kind)) throw new ApiError(404, "Record not found");
  return { id, kind };
}

/** GET — the brand's logo or director's signature (signed-in users of that company only). */
export const GET = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    const { id, kind } = await target(params);
    const img = await getBrandImage(ctx, id, kind);
    if (!img) throw new ApiError(404, "Record not found");
    // The URL carries the image's version (?v=), so a matching request can be cached; anything else is revalidated.
    const current = new URL(req.url).searchParams.get("v") === String(img.at.getTime());
    return new Response(new Uint8Array(img.data), {
      headers: {
        "Content-Type": img.mime,
        "Content-Length": String(img.data.length),
        "Content-Disposition": `inline; filename="${kind}.${img.mime.split("/")[1]}"`,
        "Cache-Control": current ? "private, max-age=31536000, immutable" : "private, no-cache",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

/** PUT { image: "data:image/png;base64,…" } — set it (administrators). */
export const PUT = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    const { id, kind } = await target(params);
    const r = await setBrandImage(ctx, id, kind, await readJsonObject(req, BRAND_IMAGE_BODY_BYTES));
    if (!r) throw new ApiError(404, "Record not found");
    return json(r);
  });

/** DELETE — remove it (administrators). */
export const DELETE = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    const { id, kind } = await target(params);
    const r = await removeBrandImage(ctx, id, kind);
    if (!r) throw new ApiError(404, "Record not found");
    return json(r);
  });
