# Deploy Deadware

GitHub Pages serves the client. A separate machine runs the Node.js API and PostgreSQL. The repository contains deployment configuration; a public server and domain have not been provisioned.

## Choose addresses

Recommended: use a Pages custom domain such as `play.your-domain.com` and an API subdomain `api.your-domain.com`. This lets login use same-site cookies. If you use `https://avellanidatwit.github.io/Deadware/`, set the API's `CLIENT_ORIGIN=https://avellanidatwit.github.io` and `COOKIE_SAME_SITE=none`. Browsers blocking third-party cookies can still block login with unrelated domains.

Create DNS records pointing the API name to your server. Set the Pages custom domain and its DNS using [GitHub's instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site). Keep the server in a stable directory outside OneDrive and user profiles.

## Prepare the server

1. Install Node.js 24+, PostgreSQL 17 and Caddy. Create the database using the README's first-time instructions. Keep PostgreSQL on loopback with password authentication; never expose port 5432 publicly.
2. Run `npm ci` and `npm run build:server`. Copy `deploy/server.env.example` to `.env`, enter the runtime database password and generate a random session secret with the README command. Replace every example domain. Use only the restricted `deadware_app` role in this file.
3. Copy `deploy/migrations.env.example` to `.env.migrations` and enter the migrator password. Run `npm run db:migrate`, then remove this higher-privilege file from the running server and store it securely for upgrades. Restrict `.env` file permissions to the service account and administrators.
4. Run `npm run check:server -- --production`. This checks production settings, database access, role restrictions and applied migrations without changing the world.
5. Start manually with `npm run start:server`, or configure a service below. Only one process may own the world. The API binds to `127.0.0.1`, including in production.

Set `DEADWARE_API_HOST` to the API hostname (no scheme or path) in Caddy's service environment. Optional `DEADWARE_API_PORT` defaults to 3000. Run Caddy with `deploy/Caddyfile`; it proxies `/api/*` to loopback. Permit public TCP ports 80 and 443 through the firewall/router, with DNS pointing to that machine. Caddy requires these conditions to obtain and renew certificates through [automatic HTTPS](https://caddyserver.com/docs/automatic-https). Do not forward Node port 3000 or PostgreSQL port 5432. Install Caddy using its [service guidance](https://caddyserver.com/docs/running).

The API enforces an exact client origin, credentialed CORS, a custom mutation header, authentication, ownership, rate limits and validated request bodies. Health checks reveal only readiness. Production uses secure HTTP-only cookies, generic internal errors and security headers; the built client includes a content security policy.

## Automatic startup

For Windows, follow [Windows service setup](WINDOWS_SERVICE.md). The native host starts Node at boot and allows graceful shutdown and recovery. Use a dedicated restricted account and a stable deployment directory. Installation requires an administrator terminal; managed machines may require signing the host. Stop the service before using `npm start` manually. Real boot behavior must be checked on the chosen host.

For Linux, adapt `deploy/deadware.service`: create the `deadware` account, install under `/opt/deadware`, verify the absolute Node path, and install/enable the unit using systemd. Caddy and PostgreSQL need their own services. Never run the game as root. The example unit restarts failed processes and limits filesystem access.

## Publish the client

1. Choose **Settings → Pages → Build and deployment → GitHub Actions** in the repository.
2. Set the Actions variable `VITE_API_URL` to the public HTTPS API origin without `/api`, a trailing slash or credentials. This value is public; database credentials and session secrets must never be client variables.
3. Push to `main` or dispatch **Deploy web client**. The workflow runs server and browser tests, checks the public API's readiness/CORS/authentication, then builds and deploys the client. Publication stops if the API is unreachable or misconfigured. It detects the Pages base path; `VITE_BASE_PATH` is an optional override with leading/trailing slashes.
4. Run `npm run check:deployment -- --api https://api.your-domain.com --client https://your-client-address/Deadware/` after publication. Then register/login in a browser and verify survivor creation, script editing, map inspection and reconnection. The HTTP probe cannot establish whether a particular browser accepts cross-site cookies.

The workflow follows [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). Client routes use hashes so repository-site reloads work.

## Updates, backups and validation

Back up PostgreSQL with `pg_dump` and test restoring backups before upgrades. Stop the game, update dependencies/build, temporarily supply migrator credentials for migrations, run the readiness checker, then restart. Preserve the world timing settings in existing installations. A crash can lose progress since the last checkpoint; clean shutdown persists the world. Keep backup retention and service log rotation configured on the host.

Run `npm test`, `npm run test:browser`, `npm run format:check`, and `npm audit` for development checks. `npm run test:integration` creates and removes an isolated local PostgreSQL cluster under ignored `test-results`; set `PG_BIN` if PostgreSQL tools are elsewhere. Alternatively, `TEST_DATABASE_URL` must point to a disposable database with a test-only role allowed to create databases and roles. Never point it to the live game database.

No live deployment is verified until DNS, HTTPS, service startup and browser login succeed on the actual host.
