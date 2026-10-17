# Kentracks ERP System

ERP platform for Kentracks GPS.

> **Status: frontend only.** The repository currently contains the web interface
> built on static sample data. There is no backend, database, authentication or
> API yet. Anything you add in the UI lives in browser memory and is lost on
> refresh.

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

There is no automated test suite yet. Lint, type check and build are the quality
checks that exist, and they are what CI runs.

## Environment configuration

The app currently reads no environment variables, so there is no `.env` file or
`.env.example`. When configuration is introduced, document it here and commit only a
placeholder `.env.example`; real values must never be committed (`.env*` is ignored).

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

The frontend alone cannot provide any of the following; they are backend work that has
not been started:

- Authentication and role-based authorisation
- Company-level (multi-tenant) data isolation enforced on the server
- Server-side validation, pagination, search and sorting (the tables currently render
  every row they are given)
- Audit logging and secure handling of integrations
