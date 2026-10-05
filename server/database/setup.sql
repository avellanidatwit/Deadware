-- Run once on a new native PostgreSQL installation as postgres.
-- Passwords are prompted interactively and are not stored in this file.
\set ON_ERROR_STOP on
CREATE ROLE deadware_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE deadware_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
\password deadware_app
\password deadware_migrator
CREATE DATABASE deadware;
\connect deadware
REVOKE ALL ON DATABASE deadware FROM PUBLIC;
GRANT CONNECT ON DATABASE deadware TO deadware_app, deadware_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO deadware_app;
GRANT USAGE, CREATE ON SCHEMA public TO deadware_migrator;
ALTER DEFAULT PRIVILEGES FOR ROLE deadware_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO deadware_app;
ALTER DEFAULT PRIVILEGES FOR ROLE deadware_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO deadware_app;
