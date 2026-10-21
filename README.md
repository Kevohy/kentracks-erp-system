# Kentracks ERP System

ERP platform for Kentracks GPS.

> **Status: in development.** The web interface now runs on a PostgreSQL backend
> (CRM, Inventory, Purchases, Sales, Packages) behind real sign-in. Dashboard figures
> are still sample data, and menu items without a page are placeholders.

## What exists today

| Area | State |
| --- | --- |
| Dashboard | Layout and sample figures only |
| CRM → Customers | List, add (End User / Distributor / Company), view and edit |
| CRM → Suppliers | List and add (Individual / Company) |
| CRM → Technicians | List and add |
| Inventory → Dashboard | Links to the Inventory pages |
| Inventory → Products | Product list, product categories, add product and add category |
| Inventory → SIM Cards | List and add (name and type) |
| Inventory → Platforms | List and add; each platform gets New, Annual and Lifelong card licence types automatically |
| Inventory → Purchases | List and add (Pending or Received; multiple items; amount paid and balance); received purchases update Inventory quantities for the session |
| All other menu items | Navigation entries with a "not designed yet" placeholder page |

Form input is validated and sanitised in the browser (names, accounts, Kenyan-default
phone numbers normalised to E.164 with `libphonenumber-js`, emails, KRA PIN).
This is a usability layer, not a security boundary: **the backend must repeat every
rule** when it exists. The shared rules live in
[`apps/web/src/lib/validation.ts`](apps/web/src/lib/validation.ts).

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) with React and TypeScript
- [Tailwind CSS](https://tailwindcss.com/) v4
- [lucide-react](https://lucide.dev/) icons, self-hosted Jost font
- ESLint with `eslint-config-next`
- pnpm workspace

## Prerequisites

- Node.js 22 or newer
- pnpm 10 (the exact version is pinned in `package.json`; `corepack enable` will pick it up)

## Getting started

```bash
pnpm install
pnpm dev
```

Then open <http://localhost:3000>. If `localhost` does not load on your machine,
use <http://127.0.0.1:3000> instead.

## Commands

Run from the repository root.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` | Production build |
| `pnpm --filter web start` | Serve the production build (run `pnpm build` first) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript type check (`tsc --noEmit`) |

Lint, type check and build are what CI runs. The API integration suites
(`pnpm --filter web test:auth`, `test:crm`, `test:erp`) need a running server and a
**local** database, so CI does not run them; see
[`apps/web/tests/README.md`](apps/web/tests/README.md).

## Environment configuration

Copy [`apps/web/.env.example`](apps/web/.env.example) to `apps/web/.env.local`. The
only required value is `DATABASE_URL`; `GPS_MOCK` and `AUTH_TRUST_PROXY` are optional and
explained in that file. Real values must never be committed (`.env*` is ignored).

```bash
pnpm --filter web db:migrate                       # apply the migrations to DATABASE_URL (use a local database for development)
pnpm --filter web db:dev-tenant "My company"       # local development only: creates a company row and prints its id
pnpm --filter web auth:user create --email you@company.com --name "Your Name" --tenant-id <id>
pnpm dev
```

## Authentication

- **Sign-in** at `/login` checks email and password against the `users` table. Passwords
  are stored only as salted scrypt hashes.
- **Sessions** are random tokens in an HttpOnly, SameSite=Lax cookie (`Secure` over HTTPS).
  Only a hash of the token is stored, so logout and expiry really end the session on the
  server. Lifetimes: 12 hours (4 hours idle), or 30 days (14 days idle) with *Remember me*.
- **Company isolation**: every API request takes its company (tenant) from the signed-in
  user's session. Nothing the browser sends can choose or override it.
- **Route protection**: `src/proxy.ts` sends signed-out visitors to `/login` and returns
  them to the page they wanted; every API route also checks the session itself and answers
  401 without one.
- **Rate limiting**: 8 failed attempts per account in 15 minutes lock sign-in for that account.
- **Accounts** are created by an administrator with `pnpm --filter web auth:user`
  (`create`, `set-password`, `disable`, `enable`, `list`). There is no public sign-up, no
  default account and no self-service password reset: "Forgot password" tells the user to
  ask an administrator, who runs `set-password` (this also signs the user out everywhere).
- There is **no development authentication bypass**. Roles and permissions are not
  implemented yet: every signed-in user of a company can use every feature.

## Project structure

```text
apps/web/
  src/
    app/            Routes (Next.js App Router); [...slug] serves the placeholder pages
    components/
      shell/        App frame: sidebar, top bar, page header
      dashboard/    Dashboard widgets and shared Card/Panel
      customers/    Customers list, dialogs and form pieces
      suppliers/    Suppliers list and add dialog
      technicians/  Technicians list and add dialog
      inventory/    Inventory pages, shared add-form dialog and the session data provider
      purchases/    Purchases list and add-purchase dialog
      auth/         Sign-in page pieces
    server/         Server only: auth/ (users, sessions, hashing, rate limit), crm/ and erp/ (schema, API logic)
    proxy.ts        Route protection (redirects signed-out visitors to /login)
    config/         Navigation menu definition (single source of truth for the sidebar)
    lib/            Data types and sample data per module, plus validation
.github/workflows/  CI
```

Each CRM module follows the same pattern: a `lib/<module>.ts` (types, field
definitions, sample rows), a `lib/<module>-validation.ts` (rules specific to that
form), and a `components/<module>/` folder. Shared validation primitives are in
`lib/validation.ts`.

To mark a menu item as built, add its page under `src/app/` and set `built: true` on
its entry in `src/config/navigation.ts` so the placeholder route no longer covers it.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: install with a frozen
lockfile, lint, type check and build (Node 22). It has read-only repository permissions.

## Before this can hold real data

Still not done:

- Role-based authorisation (all signed-in users of a company have full access)
- Multi-factor sign-in, an emailed password-reset flow, a password-change screen and session management screens
- Same-company enforcement by the database itself (isolation is enforced by the application's queries)
- Pagination, search and sorting on the server (lists are capped, not paged)
- Audit logging, security headers/CSP, and the real GPSPlatform integration (only a mock exists)
