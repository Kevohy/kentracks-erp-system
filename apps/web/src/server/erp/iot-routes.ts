import "server-only";
import { getAuthContext, type AuthContext } from "../crm/auth";
import { ApiError, handle, json, readJsonObject } from "../crm/http";
import type { Body } from "./body";

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => new ApiError(404, "Record not found");

/** GET with the request URL (paging, search). */
export const getList = <T>(fn: (c: AuthContext, url: URL) => Promise<T>) => (req: Request) =>
  handle(async () => json(await fn(await getAuthContext(req), new URL(req.url))));

/** GET one record (or list) under an id; null means 404. */
export const getById = <T>(fn: (c: AuthContext, id: string, url: URL) => Promise<T | null>) => (req: Request, { params }: Ctx) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    const r = await fn(ctx, (await params).id, new URL(req.url));
    if (r === null) throw notFound();
    return json(r);
  });

/** PUT/POST with a JSON body under an id; null means 404. Authenticates before reading the body. */
export const writeById = <T>(fn: (c: AuthContext, id: string, b: Body) => Promise<T | null>) => (req: Request, { params }: Ctx) =>
  handle(async () => {
    const ctx = await getAuthContext(req);
    const { id } = await params;
    const r = await fn(ctx, id, await readJsonObject(req));
    if (r === null) throw notFound();
    return json(r);
  });
