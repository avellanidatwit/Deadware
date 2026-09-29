# Deadware

Deadware is a persistent zombie apocalypse simulation. Players deploy SurvivorScript programs into a world that runs on an authoritative server. The browser observes snapshots and submits requests; it never simulates entities.

## Run locally

Requires Node.js 24 or newer. Run `npm install`, then `npm start` and open http://localhost:3000. The starting page asks for email and password. When no login accounts exist, the server creates `operator@deadware.local` and prints its randomly generated password once. Save it and use it to log in. New worlds have no pre-seeded survivors or zombies. Existing accounts and player-created survivors are preserved.

After login, the client shows a view-only page with a dropdown grouped into My survivors and My zombies. Selecting an entity changes the grid perspective and status block. Only owned entities can be selected; other actors can still appear within their sight. The grid key explains colors and symbols. Survivors retain explored terrain; zombies show current sight. Accounts without entities see an empty state. Open the separate Programming tab to create survivors, edit active entities, and manage your saved script library.

The server ticks every 100 ms. Actors decide every 600 ms; survivor movement is available every second decision. The browser polls once per second. Logout revokes the session. Sessions expire after 12 hours, remain only in browser memory, and require a fresh login after refresh. Passwords use salted scrypt hashes; session tokens are hashed in SQLite.
World state, entity ownership, scripts, inventory, memory, terrain, loot, exploration and pending injections are saved in `data/world.sqlite`. Saves commit after every decision and accepted mutation, plus graceful shutdown. Refreshing or closing a browser does not stop the world. Restarting the server restores it. Server downtime is not simulated, and an abrupt crash can lose work since the last committed decision. A persistence failure halts the simulation and API rather than acknowledging unsaved changes. Keep the database on a persistent volume and run one server process per database.



The status card shows the entity and owner names, health and needs bars, lifetime/kills, and five inventory slots with item categories and an equipped marker. Hover over the map for terrain descriptions and visible occupant details; tapping or using arrow keys on the focused grid also works. Public occupant details are limited to name, type, owner display name, health, kills, and time alive. Inventories, needs, ammunition, memory, and programs are never included in public hover data. Explored tiles outside sight show terrain only; unexplored tiles reveal nothing.

Kills are credited to the actor delivering a fatal combat hit. Time alive measures simulation time since injection (or zombie resurrection), stops at death, and excludes server downtime. Both persist across restarts. Old entities whose birth was never recorded show an unknown lifetime; historical kills before tracking began cannot be reconstructed.

## Programming and the survivor lifecycle

In Programming, choose **Create a survivor**, give it a name, and write its survivor behavior and future zombie behavior before pressing **Inject survivor**. The server validates both scripts, queues the survivor, and chooses a uniformly random free walkable tile at injection time. Only survivors can be injected; the API rejects direct zombie creation too.

Use the same dropdown to select an active owned survivor or a zombie raised from one of your survivors. **Update behavior** updates a survivor's live program and its prepared zombie program together, or an active zombie's current program. A dead survivor cannot be reprogrammed. Refresh the active list to discover queued spawns and newly raised zombies; switching tabs also refreshes it. Drafts are kept while switching between entries within the current login.

After a fatal needs update or attack, the server removes the survivor and raises exactly one zombie at the corpse coordinates, with the same owner and the latest prepared zombie script. The zombie starts acting on the next decision tick. Its origin and the survivor-to-zombie link are persistent, preventing duplicate resurrection after restart. Legacy directly injected zombies cannot be reprogrammed through the new lifecycle workflow.

**Save survivor and zombie scripts** stores a named pair in your account library independently of the entity. The library lets you read both programs and load them into a new survivor draft. At death, the survivor's final deployed programs are automatically archived there as well. Unsaved local edits still need saving before refresh or logout. Each account can keep 100 manually saved pairs, plus automatic death archives.

On startup, existing saves remove the known prototype IDs `survivor-1`, `zombie-1`, and `building-<number>-zombie`, including their grid references. Player-created survivors, terrain, loot, credentials, and scripts belonging to retained entities remain. Legacy queued zombie injections are dropped. Procedural building zombies are disabled for new persistent worlds.

## Separate web client / GitHub Pages

Run `npm run build:client` and publish the contents of `web-dist/` to GitHub Pages or any static host. Links support repository subpaths. This artifact contains only HTML, CSS, and the browser renderer/client modules. GitHub Pages hosts the client, not the simulation server.

Run the Node server on an always-on host with persistent disk. Configure HTTPS using your host or a reverse proxy, then enter that HTTPS endpoint in the Server connection settings on the login page. Set `DEADWARE_ORIGINS` to the exact client origin, for example `https://your-name.github.io` (no repository path). The client also works at the Node server's own origin.

Environment configuration:

- `PORT`: defaults to `3000`.
- `HOST`: defaults to `127.0.0.1`; set `0.0.0.0` when exposing through your hosting platform.
- `DEADWARE_DB`: SQLite filename, default `./data/world.sqlite`.
- `DEADWARE_ORIGINS`: comma-separated allowed browser origins.
- `DEADWARE_USERS`: optional JSON array of `{ "email": "player@example.com", "password": "a-long-private-password", "owner": "player-one", "displayName": "Riley" }`. Passwords must contain 12-128 characters. Optional `displayName` (1-64 characters) is the public owner label; it defaults to the owner ID and never uses the login email. Use owner `operator` for the initial account or an existing owner ID to retain that user's entities. Logins are created/updated at startup and persist without this setting afterward. Changing a password revokes that owner's sessions. Keep this in private server configuration, never the static build.
- `DEADWARE_TOKENS`: optional JSON object mapping access tokens of at least 32 characters to owner IDs. For example, map a securely generated token to `operator` for the initial account, and another to `player-two`. Supplying this setting replaces stored credentials at startup, allowing provisioning and rotation. Without it, existing credentials remain valid.

Email/password accounts are provisioned by the operator; legacy API tokens remain supported. Self-service registration, account recovery, historical statistics, and WebSockets are future work. Keep tokens out of the static build and source control. Requests authenticate ownership on the server; clients cannot submit owner IDs, positions, health, inventory, or arbitrary JavaScript.

## API and limits

`POST /api/login` accepts `{ "email": "...", "password": "..." }` and returns a session token. Other `/api/` routes require `Authorization: Bearer <token>`. `POST /api/logout` revokes that session. Login attempts are throttled per connection IP. Mutations require JSON.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/world` or `/api/world/region` | Append `?entity=<id>` to view a specific owned survivor or zombie; region aliases the full map |
| GET | `/api/me` | Authenticated owner ID |
| GET | `/api/me/entities` | Owned entity programs and status |
| GET | `/api/survivors`, `/api/zombies` | Owned entities of that type |
| GET | `/api/survivors/:id`, `/api/zombies/:id` | Owned entity details |
| POST | `/api/survivors` | Queue `{ "name": "Scout", "script": "OTHERWISE\n    EXPLORE", "zombieScript": "OTHERWISE\n    WANDER" }` |
| PUT | `/api/survivors/:id/script`, `/api/zombies/:id/script` | Deploy `script`; survivor updates also accept `zombieScript` |
| GET | `/api/programming` | Active programmable entities, defaults, queue, and saved scripts |
| GET / POST | `/api/scripts` | List saved programs / save a named `{ name, script, zombieScript }` pair |

Scripts allow 1–100 rules, at most five condition leaves per rule, one action per rule, 16 KiB of source and 512 characters per line. Memory uses four predefined slots; arbitrary variables and executable JavaScript are unavailable. Invalid syntax reports the source line. Requests are capped at 200 KiB to accommodate two JSON-escaped scripts. Each owner is limited to 100 survivors (including dead survivors and pending requests); their resulting zombies do not consume another survivor slot. The global injection queue is limited to 100. Programs compile once on deployment or recovery, not each tick. The server filters map entities and loot by the survivor's current perception.

## Development

`npm test` builds TypeScript and tests the language, simulation, rendering, remote client requests, API ownership/validation, injections and restart recovery. `npm run build` compiles TypeScript; restart the server after source changes.

- `server.mjs`: HTTP API, credentials, SQLite persistence and fixed-rate scheduler.
- `server/world.mjs`: authoritative world manager, snapshot projection, injection queue and versioned save codec.
- `src/main.ts`, `src/ui/`: remote client and renderer.
- `src/entities/`, `src/world/`, `src/scripting/`: server simulation and constrained script runtime.
- `public/`: static Game, Wiki, Tutorial and Account pages.
- `docs/DESIGN.md`: game, language, server and client specifications.

See [the design and language specification](docs/DESIGN.md) for gameplay rules and SurvivorScript commands.
