# Deadware

An authoritative zombie simulation with SurvivorScript behavior, a React/Vite console, and self-hosted PostgreSQL. The browser sends validated requests and sees only permitted snapshots; all game logic runs on the server.

## Run locally

Requires Node.js 24+ and Docker Compose (or a local PostgreSQL 17 installation).

1. Run `npm install` (PowerShell can use `npm.cmd`).
2. Copy `.env.example` to `.env`. Set different random passwords for `DATABASE_PASSWORD`, `MIGRATION_PASSWORD`, and `POSTGRES_PASSWORD`. Set `SESSION_SECRET` to at least 32 random characters. Generate each value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. Run `docker compose up -d --wait database`.
4. Run `npm run db:migrate`.
5. Run `npm start`, then `npm run dev:client` in another terminal.
6. Open **http://localhost:5173**, register, and inject a survivor with living and future zombie programs.

The API binds to `127.0.0.1:3000`; PostgreSQL binds to `127.0.0.1:5432`. There is no default PostgreSQL player/password. Compose initialization runs only for a new volume. Editing `.env` does not rotate existing database role passwords.

The migration account owns the schema; the application account has data access without schema privileges. For an existing PostgreSQL installation, provision roles using [init.sh](server/database/init.sh) before migrations. Keep PostgreSQL local/private and never run the application as its superuser.

## Repository structure

| Path | Responsibility |
| --- | --- |
| `client/src/main.tsx` | React login, survivor dashboard, editor and world viewer |
| `client/src/api/` | Credentialed HTTP requests |
| `client/src/ui/` | Preserved renderer and legacy UI modules |
| `shared/src/types/` | Public API/world types independent of server models |
| `server/src/api/` | Authentication, sessions, validation and ownership |
| `server/src/database/` | PostgreSQL connection, migrations and repositories |
| `server/src/simulation/` | Serialized tick/mutation/checkpoint coordination |
| `server/src/world.mjs` | Existing world manager and versioned save codec |
| `server/src/world/`, `entities/`, `data/` | Preserved simulation systems |
| `server/src/scripting/` | Existing parser, runtime and language modules |

Dependencies and the lockfile are managed at the repository root. The existing world manager remains JavaScript; simulation modules and the new API/database layers are TypeScript.

## Persistence

Users, sessions, survivors and versioned survivor/zombie script pairs have relational tables. A complete versioned world checkpoint preserves zombies, terrain, loot, inventory, memory, the library and pending injections. Survivor rows and script history commit atomically with that checkpoint; separate tables for the remaining objects are deferred.

The active world lives in RAM. Configure `SIMULATION_TICK_MS=100`, `DECISION_TICKS=6`, `CLIENT_POLL_MS=1000` and `CHECKPOINT_MS=30000` independently. Survivor movement retains its two-decision cooldown. World tick/decision timing persists and cannot silently change on restart. Database delays pause ticks rather than accumulating a backlog.

Accepted mutations and graceful shutdown also checkpoint. Crashes may lose simulation progress since the last checkpoint; acknowledged mutations have committed. Persistence failure halts operations. An advisory lock prevents multiple server writers. Server downtime is not simulated. Back up PostgreSQL and verify restores in a separate database before upgrades.

## API and security

Passwords use Argon2id. PostgreSQL-backed sessions use HttpOnly cookies, 12-hour expiry, regeneration on login and invalidation on logout. Production cookies require HTTPS. Authentication work and request rates are bounded. SQL values are parameterized; scripts compile once on deployment/recovery and never execute JavaScript.

Mutations require the exact `CLIENT_ORIGIN`, JSON and `X-Deadware-Client: web`. Credentialed CORS allows that origin. These server-side checks protect against cross-site form/fetch CSRF. Vite preserves the browser origin through its development proxy. Frontend configuration contains no secrets.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | `{username, email, password}` |
| POST | `/api/auth/login` | `{email, password}` |
| POST | `/api/auth/logout` | Revoke session |
| GET | `/api/me` | Current account |
| GET | `/api/survivors`, `/api/me/entities` | Owned entities |
| GET | `/api/programming` | Active entities, defaults, library, queue |
| GET | `/api/world?entity=<id>` | Owned entity's perception/explored terrain |
| POST | `/api/survivors` | Queue `{name, script, zombieScript?}`; server controls spawn/ownership |
| PUT | `/api/survivors/:id/script` | Deploy `{script, zombieScript?}` after ownership checks |
| PUT | `/api/zombies/:id/script` | Update an owned resurrected zombie's `{script}` |
| GET / POST | `/api/scripts` | Read/save named script pairs |

Survivors rise as owned zombies after death; direct zombie injection remains disabled. See [the game/language design](docs/DESIGN.md). WebSockets, password recovery, automatic SQLite import and richer React inspector views are deferred.

## GitHub Pages

The [Pages workflow](.github/workflows/deploy-client.yml) builds static React files into `web-dist/` and deploys on pushes to `main` or manual runs. In **Settings ? Pages**, select **GitHub Actions**. Set repository variable `VITE_API_URL` to your future public HTTPS API origin. `VITE_BASE_PATH` defaults to `./` for repository paths and custom domains.

For manual builds, copy `client/.env.example` to `client/.env.local`, set the public API URL and run `npm run build:client`. The Node API and PostgreSQL require their own always-on host. These source changes do not provision a live site or server.

Keep development local. For production, put Caddy/Nginx on the same host in front of `127.0.0.1:3000`, expose HTTPS only, set `NODE_ENV=production` and an exact HTTPS `CLIENT_ORIGIN`. Proxy trust is limited to loopback. Unrelated Pages/API domains need `COOKIE_SAME_SITE=none`; some browsers block third-party cookies. A Pages custom domain and API subdomain under the same site can use `lax`. Test authentication using the actual domains before launch.

References: [Vite Pages deployment](https://vite.dev/guide/static-deploy), [Express sessions](https://expressjs.com/en/resources/middleware/session/), [PostgreSQL transactions in Node](https://node-postgres.com/features/transactions).

## Existing SQLite worlds

`npm run start:legacy` preserves the prior SQLite server, accounts and browser UI at http://localhost:3000, using the relocated simulation code. Existing `data/world.sqlite` is untouched. Its bearer sessions and environment variables are independent of PostgreSQL and the React console. `npm run build:legacy-client` builds the old static UI, replacing `web-dist/`.

The [archived legacy reference](docs/LEGACY.md) describes that UI/API. Substitute `start:legacy` for `start`, and `build:legacy-client` for `build:client` in that document. Account IDs and password hashes differ; no automatic import is attempted.

## Verification

`npm test` builds both TypeScript targets and runs simulation, legacy UI/API, scheduling and configuration tests. `npm run build:client` verifies the static production build.

The PostgreSQL integration test runs when `TEST_DATABASE_URL` points to a **disposable database** with schema-creation privileges. It creates and removes a unique schema, testing migrations, Argon2id authentication, cookies, CSRF, ownership, forbidden fields, script history, expiry and exact recovery. Without the variable, it is explicitly skipped. GitHub Actions supplies PostgreSQL and always runs it.
