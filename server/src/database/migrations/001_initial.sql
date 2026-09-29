CREATE TABLE users (
  id uuid PRIMARY KEY,
  username varchar(32) UNIQUE NOT NULL,
  email varchar(254) UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin'))
);
CREATE TABLE worlds (
  id integer PRIMARY KEY CHECK (id = 1),
  name text NOT NULL DEFAULT 'Deadware',
  tick bigint NOT NULL,
  state text NOT NULL,
  last_saved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE survivors (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id),
  name varchar(64) NOT NULL,
  x integer, y integer,
  health integer NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'alive', 'dead')),
  created_at timestamptz NOT NULL DEFAULT now(),
  died_at timestamptz
);
CREATE INDEX survivors_owner ON survivors(owner_id);
CREATE TABLE survivor_scripts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  survivor_id uuid NOT NULL REFERENCES survivors(id),
  source_code text NOT NULL,
  zombie_source_code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  active boolean NOT NULL DEFAULT true,
  deployed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(survivor_id, version)
);
CREATE UNIQUE INDEX survivor_active_script ON survivor_scripts(survivor_id) WHERE active;
CREATE TABLE sessions (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);
CREATE INDEX sessions_expire ON sessions(expire);
