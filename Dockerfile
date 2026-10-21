#
# Kentracks ERP — production image (used by Dokploy; build context = repository root).
#
#   Start:  applies database migrations (apps/web/drizzle), then starts the app on port 3000.
#   Needs:  DATABASE_URL (PostgreSQL). Nothing secret is baked into the image.
#   Health: GET /api/health -> 200 {"status":"ok"} when the app and its database answer.
#
# Admin (first user, password resets), from Dokploy's terminal for this app:
#   node tools/scripts/user.mts create --email you@company.com --name "Full Name" --tenant-name "Company" --create-tenant --allow-remote

ARG NODE_IMAGE=node:22-alpine

# ---- dependencies (cached until the lockfile changes)
FROM ${NODE_IMAGE} AS deps
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ---- build
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_STANDALONE=1
RUN pnpm --filter web build
# The migration and admin tools need only pg and drizzle-orm, at the same versions the app uses.
RUN mkdir /tools && cd /tools && echo '{"private":true}' > package.json \
 && npm install --omit=dev --no-audit --no-fund \
      "drizzle-orm@$(node -p "require('/repo/apps/web/node_modules/drizzle-orm/package.json').version")" \
      "pg@$(node -p "require('/repo/apps/web/node_modules/pg/package.json').version")"

# ---- run
FROM ${NODE_IMAGE} AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S -G app app

# The app: Next.js standalone server and its static files.
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static

# Tools: migrations (run on every start) and the user admin script.
COPY --from=build --chown=app:app /tools/node_modules ./tools/node_modules
COPY --chown=app:app apps/web/drizzle ./tools/drizzle
COPY --chown=app:app apps/web/scripts/migrate.mjs apps/web/scripts/user.mts ./tools/scripts/
COPY --chown=app:app apps/web/src/server/auth/password.ts ./tools/src/server/auth/password.ts
COPY --chown=app:app apps/web/src/lib/auth-validation.ts ./tools/src/lib/auth-validation.ts

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
# Migrations first; the app starts only if they succeed.
CMD ["sh", "-c", "node tools/scripts/migrate.mjs && exec node apps/web/server.js"]
