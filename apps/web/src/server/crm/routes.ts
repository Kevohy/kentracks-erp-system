import "server-only";
import { getAuthContext, type AuthContext } from "./auth";
import { ApiError, handle, isUuid, json, noContent, readJsonObject } from "./http";

type Body = Record<string, unknown>;

/** Returned by a create operation when the same request was already processed: answered 200 with the existing record. */
export class Replay<T> {
  constructor(public value: T) {}
}

/** GET (list) and POST (create) for one record type. */
export function collectionRoutes<T>(ops: { list: (c: AuthContext) => Promise<T[]>; create: (c: AuthContext, b: Body) => Promise<T | Replay<T>>; maxBodyBytes?: number }) {
  return {
    GET: (req: Request) => handle(async () => json(await ops.list(await getAuthContext(req)))),
    POST: (req: Request) =>
      handle(async () => {
        const ctx = await getAuthContext(req); // authenticate before reading the body
        const r = await ops.create(ctx, await readJsonObject(req, ops.maxBodyBytes));
        return r instanceof Replay ? json(r.value, 200) : json(r, 201);
      }),
  };
}

type Ctx = { params: Promise<{ id: string }> };

/** GET, PUT (full replace of the form fields) and DELETE for one record. A malformed or foreign id is a plain 404. */
export function itemRoutes<T>(ops: {
  get: (c: AuthContext, id: string) => Promise<T | null>;
  update: (c: AuthContext, id: string, b: Body) => Promise<T | null>;
  remove: (c: AuthContext, id: string) => Promise<boolean>;
}) {
  const notFound = () => new ApiError(404, "Record not found");
  return {
    GET: (req: Request, { params }: Ctx) =>
      handle(async () => {
        const ctx = await getAuthContext(req);
        const { id } = await params;
        const r = isUuid(id) ? await ops.get(ctx, id) : null;
        if (!r) throw notFound();
        return json(r);
      }),
    PUT: (req: Request, { params }: Ctx) =>
      handle(async () => {
        const ctx = await getAuthContext(req);
        const { id } = await params;
        if (!isUuid(id)) throw notFound();
        const r = await ops.update(ctx, id, await readJsonObject(req));
        if (!r) throw notFound();
        return json(r);
      }),
    DELETE: (req: Request, { params }: Ctx) =>
      handle(async () => {
        const ctx = await getAuthContext(req);
        const { id } = await params;
        if (!isUuid(id) || !(await ops.remove(ctx, id))) throw notFound();
        return noContent();
      }),
  };
}

/** GET one record by id (read-only records such as purchases and sales). A malformed or foreign id is a plain 404. */
export function getRoute<T>(get: (c: AuthContext, id: string) => Promise<T | null>) {
  return {
    GET: (req: Request, { params }: Ctx) =>
      handle(async () => {
        const ctx = await getAuthContext(req);
        const { id } = await params;
        const r = isUuid(id) ? await get(ctx, id) : null;
        if (!r) throw new ApiError(404, "Record not found");
        return json(r);
      }),
  };
}

/** PUT (full replace of the form fields) for one record. */
export function putRoute<T>(update: (c: AuthContext, id: string, b: Body) => Promise<T | null>) {
  return {
    PUT: (req: Request, { params }: Ctx) =>
      handle(async () => {
        const ctx = await getAuthContext(req);
        const { id } = await params;
        if (!isUuid(id)) throw new ApiError(404, "Record not found");
        const r = await update(ctx, id, await readJsonObject(req));
        if (!r) throw new ApiError(404, "Record not found");
        return json(r);
      }),
  };
}
