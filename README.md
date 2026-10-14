# Deadware

A multiplayer zombie simulation where you write SurvivorScript to control survivors. The React client shows the world; the Node.js server runs the simulation and saves progress in PostgreSQL.

GitHub Pages hosts the client. The API needs a separate HTTPS server. Public hosting has not been provisioned yet; follow [the deployment guide](docs/DEPLOYMENT.md) when choosing a host and domain.

## First-time local setup

Install Node.js 24+ and PostgreSQL 17. For a new database, run:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h 127.0.0.1 -U postgres -d postgres -f server/database/setup.sql
```

On other systems, use `psql` on PATH. The setup prompts for separate runtime (`deadware_app`) and migration (`deadware_migrator`) passwords. Skip this step for an existing database.

Run `npm install`, copy `.env.example` to `.env`, and enter the two database passwords. Generate `SESSION_SECRET` with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep `.env` private. Then run:

```sh
npm run db:migrate
npm run check:server
npm start
```

In another terminal, run `npm run dev:client` and open http://localhost:5173. Register and create a survivor. On Windows, use `npm.cmd` if PowerShell blocks `npm`.

The world continues while the API is running. Clean shutdown saves progress; a crash can lose changes since the last checkpoint (30 seconds by default). Stop the Windows service before starting manually.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm start` | Build and start the API manually |
| `npm run start:server` | Start an already-built API |
| `npm run build:client` | Build the website into `web-dist/` |
| `npm run db:migrate` | Apply database migrations |
| `npm run check:server -- --production` | Check deployment configuration and database readiness |
| `npm run check:deployment -- --api URL --client URL` | Check public HTTPS endpoints, CORS and authentication |
| `npm test` | Type checks and automated tests |
| `npm run test:integration` | Run real database tests in an isolated temporary cluster |
| `npm run test:browser` | Browser regressions; install Chromium once with `npx playwright install chromium` |
| `npm run format` | Format source code consistently |
| `npm run format:check` | Check formatting |

GitHub Actions runs checks before publishing Pages. Set the repository's public `VITE_API_URL` variable only after the HTTPS API is available. See [deployment, cookies, proxy, services and backups](docs/DEPLOYMENT.md) and [Windows automatic startup with manual startup retained](docs/WINDOWS_SERVICE.md).

## Game and code

The World view supports dragging, zooming, inspection, camera following, roofs and permission-filtered attack/death effects. Keyboard controls: arrows inspect, +/- zoom, 0 resets, Escape clears selection. Movement is continuous between script decisions; sprint temporarily increases survivor speed.

See [game and scripting rules](docs/DESIGN.md) and [renderer architecture and assets](docs/ISOMETRIC_RENDERER.md). Source lives in `client/`, `server/` and `shared/`.

To generate a fresh world, stop the API and run `npm run world:reset`, then restart. This deletes gameplay data, including programs and death archives, while retaining accounts. Back up PostgreSQL first. The reset refuses to run while a server owns the world lock.
