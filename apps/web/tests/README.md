# API integration tests

These run against a live server and a **local** PostgreSQL database that has the migrations applied.
Never point them at production. The CRM and authentication suites clean up after themselves; the ERP suite does not (see below).

Every request now needs a real session, so the suites sign in through `/api/auth/login` first. Create one user per company
with the administrator script (the password goes in through stdin, never on the command line):

```bash
export DATABASE_URL=postgres://crm_app:...@localhost:5432/kentracks_erp_test
pnpm --filter web db:migrate
A=$(pnpm --filter web --silent db:dev-tenant "Tenant A")
B=$(pnpm --filter web --silent db:dev-tenant "Tenant B")
printf 'a long test password A1' | pnpm --filter web auth:user create --email alice@tenant-a.test --name "Alice Anderson" --tenant-id $A --password-stdin
printf 'a long test password B1' | pnpm --filter web auth:user create --email bob@tenant-b.test   --name "Bob Baker"     --tenant-id $B --password-stdin
pnpm --filter web build

GPS_MOCK=1 pnpm --filter web exec next start -p 3101 &   # the app (GPS_MOCK=1 lets the ERP suite verify IMEIs with the built-in mock)
pnpm --filter web exec next start -p 3102 &              # a second instance (the company comes from the session, not the server)
pnpm --filter web exec next start -p 3103 &              # a server that is never given a session (must answer 401)

export CRM_TEST_BASE_URL=http://127.0.0.1:3101 CRM_TEST_OTHER_URL=http://127.0.0.1:3102 CRM_TEST_UNAUTH_URL=http://127.0.0.1:3103
export CRM_TEST_EMAIL=alice@tenant-a.test CRM_TEST_PASSWORD='a long test password A1'
export CRM_TEST_OTHER_EMAIL=bob@tenant-b.test CRM_TEST_OTHER_PASSWORD='a long test password B1'
pnpm --filter web test:crm
```
Optional `CRM_TEST_BROKEN_DB_URL`: a server started with a `DATABASE_URL` that cannot be reached. A session cannot be checked
without the database, so these requests get a well-formed but unknown cookie and must answer with a generic error.

## Authentication (`pnpm --filter web test:auth`)

Needs `CRM_TEST_BASE_URL` and `DATABASE_URL` (the same database the server uses). It creates its own throwaway companies and
users and removes them afterwards. Optional: `CRM_TEST_BYPASS_URL` (a server started with the *old* `CRM_DEV_AUTH=1` /
`CRM_DEV_TENANT_ID` variables, which must now be ignored) and `CRM_TEST_BROKEN_DB_URL`.

It checks: every page redirects to `/login` with the page remembered; every API endpoint answers 401 without a session
(and with forged, malformed or wrong-name cookies); sign-in validation, CSRF (Origin / Sec-Fetch-Site), the identical
answer for a wrong password, an unknown email and a disabled account; the session cookie's flags (HttpOnly, SameSite=Lax,
Secure behind HTTPS, session vs 30-day Remember me); only a hash of the token being stored; the open-redirect guard on `next`;
session replacement on sign-in; password-hash upgrade; the company coming only from the session (tenant hints in headers,
query and body are ignored); logout invalidating the session on the server; absolute and idle expiry (4 h / 14 days) and
sliding last-seen; disabled users; `scripts/user.mts` (create, set-password, disable, enable); rate limiting (8 failures per
account per 15 minutes, parallel bursts counted, no difference between real and unknown accounts); and failing closed when
the database is down.

## Inventory, Purchases, Sales and Packages (`pnpm --filter web test:erp`)

Same servers and environment variables as the CRM suite. The suite creates its own suppliers, customers, technicians,
inventory, packages, purchases and sales.

**Purchases and sales cannot be deleted through the API** (the app has no delete for them, by design), so unlike the CRM
tests this suite leaves its records behind. Use a throwaway database, never one with real data. It can be run repeatedly.

It checks: sign-in is required everywhere; request hygiene (content type, malformed JSON, body size, unknown ids); every
form rule through the API with the forms' own messages; totals, costs and profit computed by the server (client-sent
values are rejected); latest-buying-price and received-only stock rules; SIM deduction, including that two simultaneous
sales cannot take the last SIM; repeated submits with the same request key saving one record; IMEI re-verification;
automatic customer links being confirmed by the server; tenant isolation; delete protection for CRM records in use.
