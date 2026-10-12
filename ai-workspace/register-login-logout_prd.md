Date created: October 12, 2026
Date last modified: October 12, 2026

# Register, Login, and Logout - Technical PRD

## Overview/Problem

Teachers will share a bank of multiple-choice questions, and more than one teacher needs to join and later create questions. Phases 1–4 added D1, hashed accounts, register/login/logout APIs, and shadcn pages so a teacher can create an account and reach a placeholder for the question bank. Creating, editing, and answering questions comes later. Phase 5 is the remaining manual check.

## Hypothesis

We believe that account registration with a hashed password, plus login and logout, will let multiple teachers join the question bank before any question features exist.

## Scope

### In Scope

- A Cloudflare D1 database, added to this project for the first time, with binding `DB`.
- A migration that creates the `users` table.
- A user service that can create, update, and delete a user, and that can look a user up for login.
- HTTP endpoints for register, login, and logout. Register and login are the only endpoints that read or write `users`.
- An error response when registration uses a username that is already taken: 409 `{ "error": "Username or email is already registered." }`. The same response is used when the email is already registered.
- Password hashing in the browser when the teacher submits registration or login, then a second hash on the server before the value is stored.
- Pages for registration and login, and a stub page at `/mcq` that register and login send the teacher to. Login and register use the shadcn login and signup blocks already in this project (`Card`, `Field`, `Input`, `Button`), centered with `min-h-svh` and `max-w-sm`.
- `/` redirects to `/register`. The Next.js starter page is not shown.
- A logout control on the stub page that calls the logout endpoint and returns the teacher to login.
- Vitest tests for every phase, written before that phase's implementation. A phase is complete only when those tests pass and that phase's acceptance criteria are checked.

### Out of Scope

- Multiple-choice questions, answers, subjects, or any question-bank behavior beyond the stub page.
- Social login (Google, Microsoft, or any other provider).
- Tokens of any kind, including JWT, API tokens, and refresh tokens.
- Password reset, email verification, and profile editing screens.
- HTTP endpoints for updating or deleting a user. Those operations exist on the user service so a later feature can call them. This slice does not expose them.
- `@cloudflare/vitest-pool-workers`. Unit tests mock D1. The real local database is checked by hand in Phase 5.

### Cut

- Session management — considered because login and logout usually create and destroy a session. Deliberately not built. Logout does not clear a cookie, token, or server-side session, because none is created. The `/mcq` stub is not protected.
- Account update and delete routes — the service can update and delete, but this slice has no product flow that needs those routes.

## Technical Requirements

### Database Schema

D1 is configured. Database name `my-ai-sprints`, binding `DB` (not the Wrangler default `my_ai_sprints`), database id `25a50ae6-4663-4028-a702-c7ea5d000e99` in `wrangler.jsonc`. Types were regenerated with `npm run cf-typegen` so `env.DB` is typed.

The `users` table is `migrations/0001_create-users.sql`. Agents apply it locally only. Do not run `migrations apply --remote` unless the user does that themselves:

```bash
npx wrangler d1 migrations create my-ai-sprints create-users
npx wrangler d1 migrations apply my-ai-sprints --local
```

`username` and `email` are separate columns. They may hold the same string. Each is unique on its own, so two teachers cannot share a username or an email.

`password_hash` stores the server hash only. It never stores the password the teacher typed, and it never stores the browser hash by itself.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

SQLite creates indexes for those `UNIQUE` constraints. No extra indexes.

All queries use prepared statements with numbered placeholders (`?1`, `?2`). Read rows with `all()` and take `results[0]`. Do not call `env.DB` from a route handler or a client component. The user service is the only module that queries `users`.

### API Endpoints

Routes live under `src/app/api/`. Each handler validates the body before calling the user service. Responses never include `password_hash`.

A public user looks like this:

```json
{
  "id": "abc123",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada",
  "email": "ada@school.edu"
}
```

The `password` field on register and login is the browser hash (lowercase hex SHA-256), not the typed password. Handlers reject a value that is not 64 hex characters. Register validates with Zod 4 (`z.email()`, name 1–100, username 3–64, password `/^[0-9a-f]{64}$/`). Login validates `identifier` (trimmed, min 1) and the same password digest.

#### POST /api/auth/register

Creates a user through `createUser`, then the browser navigates to `/mcq`.

**Request body:**

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada",
  "email": "ada@school.edu",
  "password": "<64-char sha-256 hex>"
}
```

**Response:**

- Success (201): `{ "user": <public user> }`
- Error (400): `{ "error": "Invalid registration." }` when a field is missing, the email is malformed, or `password` is not a SHA-256 hex digest
- Error (409): `{ "error": "Username or email is already registered." }`
- Error (500): `{ "error": "Unable to register." }`

#### POST /api/auth/login

Looks up the teacher by username or by email through the user service, then checks the browser hash against `password_hash`. Unknown account and wrong password return the same response.

**Request body:**

```json
{
  "identifier": "ada@school.edu",
  "password": "<64-char sha-256 hex>"
}
```

`identifier` matches `username` or `email`.

**Response:**

- Success (200): `{ "user": <public user> }`
- Error (400): `{ "error": "Invalid login." }` when `identifier` is empty or `password` is not a SHA-256 hex digest
- Error (401): `{ "error": "Invalid username, email, or password." }`
- Error (500): `{ "error": "Unable to log in." }`

#### POST /api/auth/logout

Does not read or write `users`. There is no session to end. The handler acknowledges the request so the browser can return to `/login`.

**Request body:** none.

**Response:**

- Success (200): `{ "ok": true }`
- There is no failure path in this slice. Logout does not read D1, so it does not return 500.

### User service

`src/lib/services/user-service.ts` owns every `users` query.

| Method | Used by this feature | Behavior |
|---|---|---|
| `createUser` | `POST /api/auth/register` | Server-hashes the browser digest, inserts one row, returns the public user. |
| `findByUsernameOrEmail` | `POST /api/auth/login` | Returns the stored row, including `password_hash`, or `null`. |
| `verifyPassword` | `POST /api/auth/login` | Compares the browser digest to `password_hash`. |
| `updateUser` | No endpoint yet | Updates `first_name`, `last_name`, `username`, or `email` for an id. Does not change the password in this feature. |
| `deleteUser` | No endpoint yet | Deletes the row for an id. |

`createUser` treats a unique-constraint failure as `UserAlreadyRegisteredError` with message "Username or email is already registered." so the route can return 409. `updateUser` uses the same error.

### Password hashing

Two hashes, in this order:

1. **Browser.** On submit of registration or login, hash the typed password with `crypto.subtle.digest("SHA-256")` and send the lowercase hex string. The typed password is not sent. Login uses the same browser hash as registration, because the server stored a hash of that digest.
2. **Server.** `createUser` generates a 16-byte salt and derives a PBKDF2-SHA-256 hash of the browser digest (100,000 iterations, 256 bits) with `crypto.subtle`. Store one string in `password_hash`:

```text
pbkdf2-sha256$100000$<salt hex>$<derived hex>
```

`verifyPassword` in `src/lib/password.ts` parses that string and compares the derived bytes with `timingSafeEqual` from `node:crypto`. A row whose `password_hash` does not use this format fails verification. The user service’s `verifyPassword(identifier, digest)` looks the user up first, then calls that helper.

No password-hashing library. Web Crypto is already available in the browser and in Workers.

### User Interface Requirements

Use the existing shadcn `field`, `input`, `label`, `button`, and `card` components from `src/components/ui/`. Import `cn` from `@/lib/utils`. Forms that hash the password are client components. Keep that directive on the form, not on the page.

The page shells and card layout come from the shadcn **login** and **signup** blocks. Keep that layout: a full-viewport centered column (`flex min-h-svh w-full items-center justify-center p-6 md:p-10`) with a `max-w-sm` card. The login page renders `LoginForm`. The register page uses the signup block as `RegisterForm` at `/register` (not `/signup`).

Those blocks include Google buttons and a “Forgot your password?” link. Do not ship them. Social login and password reset are out of scope. Replace `#` links with `/register` and `/login`. Replace the signup block’s single “Full Name” field with first name, last name, and username.

Validation below runs in the browser before hashing, and again on the server for everything except password length (the server only sees the digest).

#### Register (`/register`)

- Page layout: the shadcn signup shell. Title “Create an account”. Description “Enter your information below to create your account”.
- Fields: first name, last name, username, email, password, confirm password.
- First and last name: required, trimmed, 1–100 characters.
- Username: required, 3–64 characters after trim. It may be an email address so it can equal the email field. The API does not restrict username to `[A-Za-z0-9._-]`, because that would reject `ada@school.edu`.
- Email: required, valid email format. It may equal the username.
- Password: required, at least 8 characters. Hashed in the browser before the request.
- Confirm password: must match the typed password. It is not sent.
- Submit calls `POST /api/auth/register`. Success navigates to `/mcq`.
- 409 and 400 messages render on the form. A link points to `/login`.

#### Login (`/login`)

- Page layout: the shadcn login shell. Title “Login to your account”. Description tells the teacher to enter a username or email.
- Fields: username or email, password. The identifier control is a text field, not `type="email"`, so a username is valid.
- Identifier: required, non-empty after trim.
- Password: required, hashed in the browser the same way as registration.
- Submit calls `POST /api/auth/login`. Success navigates to `/mcq`.
- 401 renders "Invalid username, email, or password." A link points to `/register`.

#### Question bank stub (`/mcq`)

- Same centered `max-w-sm` card shell as login and register, so the three pages share one layout.
- Static page. Copy states that the multiple-choice question bank will be built later.
- One action: Log out. It calls `POST /api/auth/logout` and then navigates to `/login`.
- The page does not check whether anyone logged in. That matches the decision to skip session management.

`/` redirects to `/register`. The Next.js starter page is not shown.

## Testing

Vitest is the test framework. It is installed. Scripts are `test` (`vitest run`) and `test:watch` (`vitest`). Config is `vitest.config.ts` with `@vitejs/plugin-react@5` (version 6 conflicts with Babel 7 in this repo), `vite-tsconfig-paths`, `environment: "jsdom"`, and `globals: true`.

`@testing-library/user-event` drives the register and login forms. In a TTY, Vitest erases the pass/fail footer when the run ends. `npm test | cat` keeps that summary on screen.

Each phase starts by writing that phase's tests and running `npm test`. The run is red: the behavior is missing, so the assertions fail. Implementation then turns those tests green. A phase is successful only when both of these are true:

- `npm test` passes the tests listed for that phase.
- That phase's acceptance criteria are checked.

Tests sit next to the code they cover (`src/lib/password.ts` is covered by `src/lib/password.test.ts`). They assert observable results: stored values, status codes, response bodies, and what a teacher can see on the page. They mock `getCloudflareContext` and the user service. A unit test does not call a real D1 database, a remote service, or the network.

## Implementation Phases

### Phase 1: Database - COMPLETED

**Objective**: Add D1 and create `users` locally.

**Tests first**: Install Vitest, then write `migrations/create-users.test.ts` before the database exists. `npm test` is red because the binding and the migration are missing.

The test finds `migrations/*_create-users.sql` and `wrangler.jsonc` and asserts:

- `wrangler.jsonc` binds a D1 database as `DB`.
- The migration creates `users` with `id`, `first_name`, `last_name`, `username`, `email`, `password_hash`, `created_at`, and `updated_at`.
- `username` and `email` are each `UNIQUE`.
- The table has `password_hash` and no plain-text `password` column.
- The migration does not add `IDX_users_user_name` or `IDX_users_email`. The unique constraints already index those columns.

**Tasks**:

1. Create the D1 database `my-ai-sprints` and bind it as `DB` in `wrangler.jsonc`.
2. Run `npm run cf-typegen`.
3. Add the `create-users` migration and apply it with `--local` only.
4. Re-run `npm test` until `migrations/create-users.test.ts` is green.

**Phase acceptance**:

- [x] `npm test` passes `migrations/create-users.test.ts`.
- [x] Local D1 has the `users` table from that migration.

**Deliverables**:

- `vitest.config.ts` and the `test` script.
- `migrations/create-users.test.ts`.
- `wrangler.jsonc` contains the `DB` binding.
- `migrations/` contains the `users` migration.
- Local D1 has the `users` table.

### Phase 2: User service and password hashing - COMPLETED

**Objective**: Read and write users without exposing SQL to routes.

**Tests first**: Write the tests below before the helpers and the service. `npm test` is red because those modules do not exist yet.

`src/lib/password-client.test.ts`:

- A known password becomes the same 64-character lowercase SHA-256 hex every time.
- A different password becomes a different digest.

`src/lib/password.test.ts`:

- `hashPassword` stores `pbkdf2-sha256$100000$<salt>$<derived>` and not the browser digest.
- Two hashes of the same digest use different salts.
- `verifyPassword` accepts the matching digest and rejects a different one.
- A value that is not in that stored format fails verification.

`src/lib/services/user-service.test.ts`, with D1 mocked:

- `createUser` binds the server hash, returns the public user, and omits `password_hash`.
- `createUser` accepts a row whose username and email are the same string.
- A unique-constraint failure from the mock becomes the "already registered" error.
- `findByUsernameOrEmail` binds the identifier once in a `username = ?1 OR email = ?1` query.
- `verifyPassword` returns false when no row exists, and otherwise checks the stored hash.
- `updateUser` and `deleteUser` run their statements and do not change `password_hash` in this feature.

**Tasks**:

1. Add a D1 accessor in `src/lib/` that uses `getCloudflareContext()`.
2. Add browser SHA-256 and server PBKDF2 helpers.
3. Implement `createUser`, `findByUsernameOrEmail`, `verifyPassword`, `updateUser`, and `deleteUser`.
4. Re-run `npm test` until the three Phase 2 files are green.

**Phase acceptance**:

- [x] `npm test` passes the three Phase 2 files.
- [x] A created user stores a salted PBKDF2 string, and the public result has no `password_hash`.
- [x] Duplicate username and duplicate email surface as the already-registered error.

**Deliverables**:

- `src/lib/password-client.test.ts`, `src/lib/password.test.ts`, and `src/lib/services/user-service.test.ts`.
- `src/lib/services/user-service.ts`.
- Password helpers used by the service and the forms.

### Phase 3: Register, login, and logout endpoints - COMPLETED

**Objective**: Expose the three routes that call the user service.

**Tests first**: Write the route tests before the handlers. `npm test` is red because the routes do not exist yet. Mock the user service. Do not open a database.

`src/app/api/auth/register/route.test.ts`:

- A valid body returns 201 and a public user, with no `password_hash`.
- A missing field, a malformed email, or a password that is not 64 hex characters returns 400 `{ "error": "Invalid registration." }`.
- A duplicate username returns 409 `{ "error": "Username or email is already registered." }`.
- A duplicate email returns that same 409 body.
- The handler calls `createUser` and does not call `updateUser` or `deleteUser`.

`src/app/api/auth/login/route.test.ts`:

- A matching username returns 200 and a public user.
- A matching email returns the same 200 shape.
- An unknown identifier and a wrong password both return 401 `{ "error": "Invalid username, email, or password." }`.
- An empty identifier or a bad digest returns 400 `{ "error": "Invalid login." }`.
- The response body has no `password_hash`.

`src/app/api/auth/logout/route.test.ts`:

- `POST` returns 200 `{ "ok": true }`.
- The handler does not call `createUser`, `findByUsernameOrEmail`, `updateUser`, or `deleteUser`.

**Tasks**:

1. Add Zod and validate each request body with it. Zod is not installed; add it before the handlers exist and record why (route input must be validated, and this repo standardizes on Zod).
2. Implement `POST /api/auth/register`, `POST /api/auth/login`, and `POST /api/auth/logout`.
3. Map unique-constraint failures to 409 and failed password checks to 401.
4. Re-run `npm test` until the three route files are green.

**Phase acceptance**:

- [x] `npm test` passes the three route test files.
- [x] Duplicate username returns the 409 body above.
- [x] Unknown account and wrong password return the same 401 body.

**Deliverables**:

- `src/app/api/auth/register/route.test.ts`, `src/app/api/auth/login/route.test.ts`, and `src/app/api/auth/logout/route.test.ts`.
- `src/app/api/auth/register/route.ts`.
- `src/app/api/auth/login/route.ts`.
- `src/app/api/auth/logout/route.ts`.

### Phase 4: Pages - COMPLETED

**Objective**: A teacher can register or log in and land on the question-bank stub, then log out.

**Tests first**: Write the component tests before the pages. `npm test` is red because the forms and the stub do not exist yet. Render with Testing Library. Query by role and accessible name. Drive the forms with `userEvent`. Mock `fetch` and the router.

`src/components/register-form.test.tsx`:

- Submit with a valid teacher hashes the password and sends the 64-character digest. The typed password and the confirm-password field are absent from the request.
- Username and email may be submitted as the same string.
- A 409 response shows "Username or email is already registered."
- A successful response navigates to `/mcq`.

`src/components/login-form.test.tsx`:

- Submit hashes the password before the request.
- A 401 response shows "Invalid username, email, or password."
- A successful response navigates to `/mcq`.

`src/components/logout-button.test.tsx`:

- Log out calls `POST /api/auth/logout` and then navigates to `/login`.

`src/app/mcq/page.test.tsx`, or the client stub it renders:

- The page shows that the question bank will be built later.
- The logout control is available without a prior login.

**Tasks**:

1. Build `/register` and `/login` from the shadcn signup and login blocks, with client-side hashing before submit.
2. Build the `/mcq` stub with logout, using the same centered card shell.
3. Redirect `/` to `/register`.
4. Re-run `npm test` until the Phase 4 test files are green.

**Phase acceptance**:

- [x] `npm test` passes the Phase 4 test files.
- [x] The register form shows the duplicate-username error from a 409.
- [x] The login form shows the bad-credentials error from a 401.
- [x] Register and login success open `/mcq`, and logout opens `/login`.
- [x] `/` redirects to `/register`.

**Deliverables**:

- The four Phase 4 test files.
- `src/app/page.tsx` — `redirect("/register")`.
- `src/app/register/page.tsx`.
- `src/app/login/page.tsx`.
- `src/app/mcq/page.tsx`.
- `src/components/register-form.tsx`, `src/components/login-form.tsx`, `src/components/logout-button.tsx`.

### Phase 5: Manual verification - PLANNED

**Objective**: Confirm the whole feature before calling it done. Automated tests stay green, and the browser checks pass.

**Tests first**: This phase adds no new test file. Run the full suite before the manual pass. `npm test` must already be green from Phases 1–4. A red suite stops the phase. Fix the failing phase, turn that phase green again, then return here.

**Tasks**:

1. Run `npm test` and keep the full suite green.
2. Register a new teacher and confirm the browser opens `/mcq`.
3. Register again with that same username and confirm the form shows the 409 duplicate-username error.
4. Log in with the wrong password and confirm the form shows the 401 bad-credentials error.
5. Log in with the username, then with the email, and confirm both open `/mcq`.
6. Log out and confirm the browser opens `/login` and the `users` row is unchanged.
7. Confirm `password_hash` is a salted server hash and the typed password is not stored.
8. Mark the feature acceptance criteria only after the suite is green and these checks have passed.

**Phase acceptance**:

- [ ] `npm test` passes the full suite.
- [ ] Each manual check above passed against the local app.
- [ ] The feature acceptance criteria are checked.

**Deliverables**:

- A green `npm test` run.
- Each manual check passed against the local app.
- Acceptance criteria marked only after these checks pass.

## Technical Implementation Details

### Key Files

- `vitest.config.ts` — Vitest harness. Tests import `@/` through `vite-tsconfig-paths`. `@vitejs/plugin-react` is pinned to v5.
- `migrations/create-users.test.ts` — schema assertions, written before the migration.
- `wrangler.jsonc` — D1 binding `DB` for database `my-ai-sprints` (`25a50ae6-4663-4028-a702-c7ea5d000e99`).
- `migrations/0001_create-users.sql` — `users` table. Applied locally in Phase 1.
- `next.config.ts` — `initOpenNextCloudflareForDev()` so `getCloudflareContext()` works under `npm run dev`.
- `src/lib/db.ts` — `getCloudflareContext()` and `env.DB`. Server-only.
- `src/lib/password.ts` — server PBKDF2 hash and verify with `node:crypto` `timingSafeEqual`. Server-only. Covered by `src/lib/password.test.ts`.
- `src/lib/password-client.ts` — browser SHA-256 hex digest. Safe to import from a client component. Covered by `src/lib/password-client.test.ts`.
- `src/lib/services/user-service.ts` — create, update, delete, lookup, password check, and `UserAlreadyRegisteredError`. Covered by `src/lib/services/user-service.test.ts`.
- `src/app/api/auth/register/route.ts` — register endpoint. Covered by `src/app/api/auth/register/route.test.ts`.
- `src/app/api/auth/login/route.ts` — login endpoint. Covered by `src/app/api/auth/login/route.test.ts`.
- `src/app/api/auth/logout/route.ts` — logout acknowledgement. Covered by `src/app/api/auth/logout/route.test.ts`.
- `src/app/page.tsx` — redirects `/` to `/register`.
- `src/app/register/page.tsx` — registration page using the shadcn signup layout. Renders `src/components/register-form.tsx`.
- `src/app/login/page.tsx` — login page using the shadcn login layout. Renders `src/components/login-form.tsx`.
- `src/app/mcq/page.tsx` — question-bank stub and logout. Renders `src/components/logout-button.tsx`.
- `src/components/register-form.tsx` — client form. Hashes the password, posts to `/api/auth/register`, shows 409/400, navigates to `/mcq`.
- `src/components/login-form.tsx` — client form. Hashes the password, posts to `/api/auth/login`, shows 401, navigates to `/mcq`.
- `src/components/logout-button.tsx` — posts to `/api/auth/logout`, then navigates to `/login`.

### Implementation Patterns

Reach D1 only from server code:

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
  const { env } = await getCloudflareContext();
  return env.DB;
}
```

Insert with numbered placeholders:

```typescript
await db
  .prepare(
    `INSERT INTO users (first_name, last_name, username, email, password_hash)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
  .bind(firstName, lastName, username, email, passwordHash)
  .run();
```

Look up a login by either field:

```typescript
const { results } = await db
  .prepare(
    `SELECT id, first_name, last_name, username, email, password_hash
     FROM users
     WHERE username = ?1 OR email = ?1`,
  )
  .bind(identifier)
  .all();
```

Browser hash, before `fetch`:

```typescript
const bytes = new TextEncoder().encode(password);
const digest = await crypto.subtle.digest("SHA-256", bytes);
const passwordHash = [...new Uint8Array(digest)]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");
```

### Important Notes

- The browser hash is not the value in `password_hash`. The server hashes that digest again with a salt. Storing the browser hash alone would make a stolen database usable for login.
- Login must use the same browser hash as registration. Hashing only on the registration form would make stored passwords unverifiable.
- Logout cannot end an authenticated session. Anyone can open `/mcq` directly. Do not add a cookie, `localStorage` flag, or middleware check in this feature.
- `updateUser` and `deleteUser` must not be called from the three auth routes.
- Each phase writes its Vitest tests first. The first `npm test` of that phase is red. The phase is done when those tests are green and that phase's acceptance criteria are checked.
- Apply migrations locally only. Never `migrations apply --remote` unless the user runs that command.
- `initOpenNextCloudflareForDev()` in `next.config.ts` lets `npm run dev` reach local D1. `npm run preview` is still the check for the Workers runtime.
- OpenNext’s Cloudflare build imports `esbuild`. It is a direct devDependency (`^0.27.7`) because Node does not resolve the copy nested under Wrangler.
- A curl against `/api/auth/register` must send the SHA-256 digest, not the typed password. SHA-256 of `password` is `5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8`.
- Do not deploy unless explicitly asked. Agents do not create further migrations in later phases.

## Acceptance Criteria

- [ ] `users` exists in local D1 with `id`, `first_name`, `last_name`, `username`, `email`, and `password_hash`.
- [ ] `username` and `email` are unique. A second registration with either value returns 409.
- [ ] A teacher can register when username and email are different, and when they are the same string.
- [ ] The request body contains the SHA-256 digest, and `password_hash` is a salted PBKDF2 string of that digest. The typed password is not stored and is not returned.
- [ ] Register and login responses omit `password_hash`.
- [ ] Login succeeds with the username or with the email, and then the browser opens `/mcq`.
- [ ] Login with an unknown identifier or a wrong password returns the same 401 message.
- [ ] Logout returns `{ "ok": true }`, does not change `users`, and the browser opens `/login`.
- [ ] `/mcq` shows that the question bank is not built yet, and it loads without a prior login.
- [ ] `updateUser` and `deleteUser` exist on the user service and have no HTTP route.
- [ ] No session cookie, token, or social-login path is added.
- [ ] `npm test` passes the full Vitest suite.
- [ ] `npm run lint` and `npm run build` succeed.

## Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| Registration completes | A new teacher reaches `/mcq` with one valid submission | Manual pass through `/register` against local D1 |
| Login completes | The same teacher reaches `/mcq` using username and using email | Manual pass through `/login` |
| Stored secret | 0 rows contain the typed password or the raw browser digest as `password_hash` | Inspect `password_hash` after a local registration; it starts with `pbkdf2-sha256$` |
| Logout | Logout returns the teacher to `/login` without writing to `users` | Manual pass, then confirm the row is unchanged |
| Scope hold | No question-bank behavior and no session cookie | Review of routes and response headers |
| Phase gate | Each phase ends with a green Vitest run and its acceptance criteria checked | `npm test` plus the checkboxes on that phase |

## Dependencies

### External Dependencies

- Cloudflare D1 — stores `users`. Bound as `DB` to database `my-ai-sprints`.
- Web Crypto — SHA-256 in the browser (`digestPassword`) and PBKDF2 on the server (`hashPassword`). No password-hashing package.
- Zod 4.6 — request validation on register and login. Runtime dependency.
- Vitest 5, Testing Library, `user-event`, jsdom, `vite-tsconfig-paths`, and `@vitejs/plugin-react@5` — the test harness. Installed in Phase 1.
- `esbuild` 0.27 — required by `@opennextjs/cloudflare` at build/deploy time. Direct devDependency.

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — the only way to reach `env.DB`. `initOpenNextCloudflareForDev()` in `next.config.ts` enables that under `next dev`.
- shadcn `field`, `input`, `label`, `button`, and `card` — registration, login, and the stub. Tailwind CSS v4 in `src/app/globals.css`.
- Wrangler migrations — schema changes. Agents apply locally only.

No new environment variables. No secrets in this feature.

## Risks and Mitigation

### Technical Risks

- **Risk**: The browser digest is stored as `password_hash`, so a copied database can be replayed at login.
- **Mitigation**: `createUser` always runs PBKDF2 with a unique salt before insert. Acceptance checks the stored prefix.

- **Risk**: PBKDF2 at 100,000 iterations is slow on the Workers CPU limit.
- **Mitigation**: Keep the iteration count in the stored string so it can be lowered later without a second migration. Do not drop the server hash to save time.

- **Risk**: D1 is queried from a client component, or SQL is built by string concatenation.
- **Mitigation**: Database access stays in `src/lib/services/user-service.ts`. Queries use `?1` style binds.

- **Risk**: A migration is applied to the remote database during implementation.
- **Mitigation**: The only apply command in this feature uses `--local`.

### User Experience Risks

- **Risk**: Teachers treat `/mcq` as a private page. It is not, because there is no session.
- **Mitigation**: The stub says the question bank is not built yet. Do not show account data on it that would imply they are signed in.

- **Risk**: Login reveals whether an email is registered.
- **Mitigation**: Unknown user and wrong password share one 401 message.

## Troubleshooting Guide

### Vitest install fails on `@vitejs/plugin-react`

**Problem**: `npm install` of the latest `@vitejs/plugin-react` stops with `ERESOLVE` before Vitest is added.
**Cause**: Plugin version 6 pulls an optional Babel 8 peer that conflicts with the Babel 7 already in this repo.
**Solution**: Install `@vitejs/plugin-react@5` with the rest of the Vitest packages. Phase 1 used that pin.
**Code Reference**: `package.json`

### OpenNext deploy cannot find `esbuild`

**Problem**: `npm run deploy` fails with `Cannot find package 'esbuild' imported from .../@opennextjs/cloudflare/dist/cli/build/bundle-server.js`.
**Cause**: OpenNext imports `esbuild` as a top-level package, and npm had only nested copies under Wrangler.
**Solution**: Add `esbuild` as a direct devDependency.
**Code Reference**: `package.json`

### Vitest pass/fail counts disappear after `npm test`

**Problem**: The terminal shows green checkmarks per file, but not `Test Files  N passed`.
**Cause**: Vitest draws that summary as a live TTY footer and erases it when the process exits.
**Solution**: Run `npm test | cat`.
**Code Reference**: `vitest.config.ts`

### curl against register prints nothing

**Problem**: Pasting the curl command into the `npm run dev` terminal produces no JSON.
**Cause**: That terminal is the Next.js server, not a shell that can run curl.
**Solution**: Leave `npm run dev` running and run curl in a second terminal.

### Register or login against `next dev` hangs or returns 500

**Problem**: The API cannot reach D1 under Node.
**Cause**: `getCloudflareContext()` needs the OpenNext dev helper and a local migration.
**Solution**: Keep `initOpenNextCloudflareForDev()` in `next.config.ts`, apply `0001_create-users.sql` with `--local`, or verify with `npm run preview`.
**Code Reference**: `next.config.ts:15`

## Notes for AI Agents

When working with this PRD:

1. Read the Overview and Hypothesis before writing code. This slice is accounts only.
2. Stay inside Scope. Do not add sessions, cookies, tokens, social login, or question-bank features.
3. Register and login must call the user service. Logout must not.
4. Hash in the browser and again on the server. Never store or log the typed password.
5. Update phase status as work finishes. Record real file paths under Technical Implementation Details.
6. For each phase, write the listed Vitest tests first and run `npm test`. Leave that run red until the implementation exists. Mark the phase complete only when those tests are green and that phase's acceptance criteria are checked.
7. Mark feature acceptance criteria when Phase 5 has passed: the full suite is green, and the manual checks have been done. Do not call the feature done before that.
8. Add a troubleshooting entry when a bug is fixed.
9. Apply D1 migrations locally only. Do not deploy unless the user asks.

## Current Status

**Last Updated**: October 12, 2026
**Current Phase**: Phase 4 - Pages
**Status**: COMPLETED
**Next Steps**: Phase 5 (manual verification) has not started.
