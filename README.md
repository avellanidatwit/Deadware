# Deadware

A multiplayer zombie simulation where you write scripts to control survivors. The server runs the world and saves progress to PostgreSQL. Players sign in through a React website.

**Hosting:** GitHub Pages runs the website. One separate server runs Node.js and PostgreSQL.

## First-time setup

Install **Node.js 24+** and **PostgreSQL 17**, then open a terminal in this project folder. Make sure the PostgreSQL service is running.

### 1. Create the database

For a **new database only**, run the command for your terminal.

**Windows PowerShell** (default PostgreSQL 17 installation):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h 127.0.0.1 -U postgres -d postgres -f server/database/setup.sql
```

**Other terminals**, with `psql` on PATH:

```sh
psql -h 127.0.0.1 -U postgres -d postgres -f server/database/setup.sql
```

The script creates the database and prompts for two passwords:

- `deadware_app`: used by the game.
- `deadware_migrator`: used to update the database structure.

Enter the `postgres` administrator password chosen during installation first. Then choose the two game database passwords when prompted. Password input is hidden.

Already have a Deadware database? Skip this step and keep your existing passwords.

### 2. Configure the game

```sh
npm install
```

Copy `.env.example` to `.env`. Set these values:

| Setting | What to enter |
| --- | --- |
| `DATABASE_PASSWORD` | The `deadware_app` password |
| `MIGRATION_PASSWORD` | The `deadware_migrator` password |
| `SESSION_SECRET` | A random value from the command below |

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Leave the other settings at their defaults for local development. Keep `.env` private.

### 3. Prepare the database

```sh
npm run db:migrate
```

Run this again after updates that change the database structure.

## Run locally

Start the game server:

```sh
npm start
```

In a second terminal, start the website:

```sh
npm run dev:client
```

Open **http://localhost:5173**, register an account, and create a survivor. Keep both terminals open while playing. If PowerShell blocks `npm`, use `npm.cmd` instead.

The world runs while the server is running, even without connected players. Progress is saved automatically; a crash can lose progress since the last checkpoint (30 seconds by default).

## Host with GitHub Pages

GitHub Pages hosts only the website. Your game server must stay online separately.

1. Set up Node.js and PostgreSQL on your server using the steps above. Run one game server process and configure it to restart automatically.
2. Put Caddy or Nginx in front of the API to provide **HTTPS**, forwarding requests to `127.0.0.1:3000`. Keep PostgreSQL private, listening on localhost with password authentication.
3. In the server's `.env`, set `NODE_ENV=production` and `CLIENT_ORIGIN` to your website's HTTPS origin, such as `https://play.example.com` (no path or trailing slash).
4. In your GitHub repository, open **Settings > Pages** and choose **GitHub Actions** as the source.
5. Under **Settings > Secrets and variables > Actions > Variables**, add `VITE_API_URL` with your public API origin, such as `https://api.example.com` (no trailing slash).
6. Push to `main` or manually run the **Deploy web client** workflow. Test registration and login on the published website.

For a Pages address such as `https://name.github.io/Deadware/`, `CLIENT_ORIGIN` is `https://name.github.io`.

**Login cookies:** With a Pages custom domain and API subdomain under the same site, keep `COOKIE_SAME_SITE=lax`. With unrelated website/API domains, set it to `none`; browsers that block third-party cookies may prevent login.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm test` | Build and run tests |
| `npm run build:client` | Build the website into `web-dist/` |
| `npm run db:migrate` | Apply database updates |

Database integration tests require `TEST_DATABASE_URL` pointing to a disposable test database. Otherwise they are skipped locally; GitHub Actions runs them.

## Data and existing installations

- Back up PostgreSQL before upgrades. Never use its administrator account to run the game.
- Do not commit `.env`, database files, or generated folders such as `node_modules/`, `dist/`, and `web-dist/`.

See [the game and scripting guide](docs/DESIGN.md) for SurvivorScript and simulation details. Code lives in `client/` (website), `server/` (API and game), and `shared/` (shared types).


## Real-time movement

Movement runs continuously between script decisions. Survivors walk at 1.0 tiles/second; zombies move at 1.2. Use `SPRINT MOVE_AWAY nearest zombie` for a temporary survivor speed of 1.6 (three seconds, stamina cost, eight-second cooldown). Existing scripts still work.

After updating, run `npm run db:migrate`, restart the API and refresh the website. Back up PostgreSQL first: this update stores decimal positions and health. See [the movement rules](docs/DESIGN.md#continuous-movement) for details.
