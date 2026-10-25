# Kentracks ERP System

ERP for Kentracks GPS: customers, stock, sales of GPS trackers and packages, renewals and billing,
IoT SIMs, airtime, SMS and the GPS tracking platforms, for one or more companies.

Live at **pos.kentracksgps.com** (the `production` branch, deployed with Dokploy).

## Features

| Area | What it does |
| --- | --- |
| Dashboard | Live sales, profit, customers, outstanding balances, revenue chart and upcoming renewals |
| CRM | Customers (End User / Distributor / Company), Suppliers, Technicians |
| Inventory | Products and categories, SIM cards, Platforms (New / Annual / Lifelong card licences), Purchases; stock is updated by purchases and sales |
| Sales | Package, Hosting and Retailer sales; IMEI verification on the GPS platforms; payments and balances; SIM airtime / SMS reminder service per sale |
| Billing | Customer vehicles with expiry and renewal fees; IoT SIM groups, renewals, suspensions and bills |
| Communication → Bulk SMS | Send SMS through TextSMS to customers; templates with fields; history and delivery reports; monthly SMS reminders sent automatically on each vehicle's day; per-customer reminder blocks |
| Communication → Airtime | Airtime through Africa's Talking: manual, monthly and top-up sends; approval of automatic airtime plans; suspend, resume and remove, with history |
| Communication → GPS Platform | Each company's API accounts on Kentracks and iTrack (add, test, edit, remove) |
| Settings | Packages, Brands, Africa's Talking status |

Menu items without a page (Finance, Renewal Center, Documents, Booking) show a "not designed yet" placeholder.

## Tech stack

- [Next.js](https://nextjs.org/) 16 (App Router), React 19, TypeScript
- PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/) (SQL migrations in `apps/web/drizzle`)
- Tailwind CSS v4, lucide-react icons, self-hosted Jost font
- pnpm workspace, Node.js 22
- Docker image for Dokploy; GitHub Actions CI

## Getting started (local)

Requirements: Node.js 22+, pnpm 10 (`corepack enable`), and a local PostgreSQL (Docker is fine).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local              # then fill in DATABASE_URL (a LOCAL database)
pnpm --filter web db:migrate                               # create the tables
pnpm --filter web db:dev-tenant "My company"               # local only: creates a company and prints its id
pnpm --filter web auth:user create --email you@company.com --name "Your Name" --tenant-id <id> --role admin
pnpm dev                                                   # http://localhost:3000 - reloads on every code change
```

If `localhost` does not load, use <http://127.0.0.1:3000>.

## Commands

Run from the repository root.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server with live reload |
| `pnpm build` | Production build |
| `pnpm --filter web start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript check (`tsc --noEmit`) |
| `pnpm --filter web db:generate` | Create a migration after changing a schema file |
| `pnpm --filter web db:migrate` | Apply migrations to `DATABASE_URL` |
| `pnpm --filter web auth:user …` | Manage users (see [Users and roles](#users-and-roles)) |

CI (`.github/workflows/ci.yml`) runs install (frozen lockfile), lint, type check and build on every push and
pull request. The API integration tests need a running server and a local database and are kept out of the
`main` and `production` branches.

## Environment variables

Copy [`apps/web/.env.example`](apps/web/.env.example) to `apps/web/.env.local` for local work; in production set
them in Dokploy. All are read on the server only. Never commit real values (`.env*` is git-ignored).

| Variable | Needed | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GPS_CREDENTIALS_KEY` | Yes (production) | Encrypts the saved GPS platform logins. 32 random bytes, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep it safe and keep it the same: changing or losing it means re-entering every GPS login |
| `AUTH_TRUST_PROXY` | Production | Which proxy gives the real client address for sign-in limits: `cloudflare` (uses `CF-Connecting-IP`) or `1` (last `X-Forwarded-For` entry). Leave unset if the server is reachable without that proxy |
| `GPS_ALLOW_HTTP` | Production (iTrack) | `1` lets the app fall back to plain http for a GPS platform without https. iTrack has no https |
| `TEXTSMS_API_KEY`, `TEXTSMS_PARTNER_ID`, `TEXTSMS_SENDER_ID` | For SMS | TextSMS account (Bulk SMS and every SMS the system sends) |
| `AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY` | For airtime | Africa's Talking account |
| `SMS_AUTO_REMINDERS` | Optional | `off` stops the automatic monthly reminder job on that server |
| `GPS_MOCK` | Local only | `1` verifies IMEIs with a built-in mock, only when `DATABASE_URL` is local. Never in production |

`GPS_API_URL`, `TEXTSMS_API_URL` and `AFRICASTALKING_API_URL` exist for tests only and must not be set in production.

## GPS platforms

| Platform | Address used | Notes |
| --- | --- | --- |
| Kentracks | `https://api.protrack365.com` | `api.kentracksgps.com` is the same Protrack365 server but has no https certificate, so the app uses the Protrack365 name over https |
| iTrack | `api.itrack.top` | No https: needs `GPS_ALLOW_HTTP=1` |

Each company adds its own API accounts in **Communication → GPS Platform**. Passwords are stored only as the
platform's MD5 form, encrypted with `GPS_CREDENTIALS_KEY` (AES-256-GCM, bound to the company). Access tokens stay
on the server and are refreshed automatically.

## Security

- **Sign-in**: email and password; passwords are salted scrypt hashes. No public sign-up, no default account.
- **Sessions**: random server-side tokens in an HttpOnly, SameSite=Lax cookie (`Secure` over https); only a hash is
  stored. 12 hours (4 idle), or 30 days (14 idle) with *Remember me*. Signing out or disabling a user ends the
  session immediately. No JWT.
- **Company isolation**: every API request takes its company from the signed-in user's session; nothing the browser
  sends can choose it.
- **Roles**: Administrator and Staff. Only administrators can manage GPS platform accounts, brands and packages,
  approve, send, stop, suspend or remove airtime, send bulk SMS and change reminder settings.
- **Sign-in limits**: 8 tries per account and address, 50 per account and 40 per address in 15 minutes. A browser
  that signed in before gets a signed `kt_device` cookie and its own limit, so guessing from elsewhere cannot lock
  it out.
- **CSRF**: API writes from another site are refused (Origin / Sec-Fetch-Site check).
- **Headers**: nonce-based Content Security Policy, HSTS, `X-Frame-Options: DENY`, nosniff, Referrer-Policy,
  Permissions-Policy; pages are not cached.

## Users and roles

Users are created by an administrator from the command line (in production: Dokploy's terminal for the app,
`node tools/scripts/user.mts …` with the same arguments).

```bash
pnpm --filter web auth:user create --email you@company.com --name "Full Name" --tenant-id <id> --role admin
pnpm --filter web auth:user set-role --email someone@company.com --role staff
pnpm --filter web auth:user set-password --email someone@company.com      # also signs them out everywhere
pnpm --filter web auth:user disable --email someone@company.com
pnpm --filter web auth:user list
```

New users are **staff** unless created with `--role admin`. There is no self-service password reset: "Forgot
password" tells the user to ask an administrator.

## Deployment (Dokploy)

- Build: the repository `Dockerfile` (build context = repository root). Nothing secret is baked into the image.
- Start: the container applies database migrations first, then starts the app on port 3000. If a migration fails,
  the app does not start.
- Health check: `GET /api/health` returns `200 {"status":"ok"}` when the app and database answer.
- Release flow: work on `feat/frontend-shell` → pull request into `main` → `production` is released from `main`
  without test files → Dokploy deploys `production`.
- Take a database backup before deploying new migrations.

## Project structure

```text
apps/web/
  drizzle/          SQL migrations (applied in order, all-or-nothing)
  scripts/          migrate.mjs (used by the container), user.mts, dev-tenant.mjs
  src/
    app/            Pages and API routes (Next.js App Router); [...slug] serves the placeholder pages
    components/     UI per module: shell, dashboard, crm, customers, suppliers, technicians, inventory,
                    purchases, sales, billing, iot, communication, settings, auth
    server/         Server only: auth/ (users, sessions, roles, sign-in limits, trusted browsers),
                    crm/ and erp/ (schema and API logic: sales, billing, IoT SIMs, airtime, SMS, GPS platforms),
                    secret-box.ts (encryption of saved GPS logins)
    lib/            Shared types, formatting and validation (browser and server)
    config/         Navigation menu (single source of truth for the sidebar)
    proxy.ts        Route protection, CSRF check and Content Security Policy
    instrumentation.ts  Starts the automatic SMS reminder job
Dockerfile          Production image for Dokploy
.github/workflows/  CI
```

To make a menu item a real page, add it under `src/app/` and set `built: true` on its entry in
`src/config/navigation.ts`.

## Known open items

- Staff can remove an approved automatic-airtime plan through the sale's SIM service change
  (`POST /api/sales/[id]/sim-service`); the dedicated Airtime actions are admin-only. Fix pending.
- iTrack is reached over plain http (no https available from the provider).
- No key rotation for `GPS_CREDENTIALS_KEY`.
- Lists are capped (for example the newest 2,000 sales), not paged.
- Not built yet: Finance, Renewal Center, Documents, Booking; multi-factor sign-in; audit log.
