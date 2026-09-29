#!/bin/sh
set -eu
psql --username postgres --dbname deadware --set=ON_ERROR_STOP=1 \
  --set=app_password="$DEADWARE_APP_PASSWORD" --set=migration_password="$DEADWARE_MIGRATION_PASSWORD" <<'SQL'
CREATE ROLE deadware_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
CREATE ROLE deadware_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'migration_password';
REVOKE ALL ON DATABASE deadware FROM PUBLIC;
GRANT CONNECT ON DATABASE deadware TO deadware_app, deadware_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO deadware_app;
GRANT USAGE, CREATE ON SCHEMA public TO deadware_migrator;
ALTER DEFAULT PRIVILEGES FOR ROLE deadware_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO deadware_app;
ALTER DEFAULT PRIVILEGES FOR ROLE deadware_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO deadware_app;
SQL
