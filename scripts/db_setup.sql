-- 1) Updated psql SQL (roles + DBs + DB-level lockdown)

\set ON_ERROR_STOP on

-- Owner role for all student DBs (students do NOT own the DB itself)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_admin') THEN
    CREATE ROLE project_admin NOLOGIN;
  END IF;
END $$;

-- Create student login roles with consecutive group numbers across sections
DO $$
DECLARE
  i int;
  sec text;
  ord int;
  grpnum int;
  g text;
  r text;
BEGIN
  FOR sec, ord IN
    SELECT * FROM (VALUES ('ca',1),('cb',2)) AS t(sec, ord)
  LOOP
    FOR i IN 1..15 LOOP
      grpnum := (ord - 1) * 15 + i;                 -- 1..60
      g := 'grp' || lpad(grpnum::text, 2, '0');     -- grp01..grp60
      r := g || '_' || sec;                      -- grp16_bb, etc.

      BEGIN
        EXECUTE format(
          'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;',
          r, 'CHANGE_ME_' || r
        );
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;

      -- Optional: reduce accidental access to default DBs
      BEGIN EXECUTE format('REVOKE CONNECT ON DATABASE postgres FROM %I;', r); EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE format('REVOKE CONNECT ON DATABASE template1 FROM %I;', r); EXCEPTION WHEN undefined_object THEN NULL; END;
    END LOOP;
  END LOOP;
END $$;

-- Drop all databases starting with __project_
SELECT format('DROP DATABASE IF EXISTS %I;', datname)
FROM pg_database
WHERE datname LIKE '__project_%'
ORDER BY datname;
\gexec

-- Create one database per group+section (use \gexec)
WITH combos AS (
  SELECT
    ((ord - 1) * 15 + i) AS grpnum,
    ('grp' || lpad(((ord - 1) * 15 + i)::text, 2, '0')) AS g,
    sec
  FROM (VALUES ('ca',1),('cb',2)) AS s(sec, ord)
  CROSS JOIN generate_series(1,15) AS i
)
SELECT format('DROP DATABASE IF EXISTS %I;', '__project_' || g || '_' || sec || '_app')
FROM combos
ORDER BY grpnum;
\gexec

WITH combos AS (
  SELECT
    ((ord - 1) * 15 + i) AS grpnum,
    ('grp' || lpad(((ord - 1) * 15 + i)::text, 2, '0')) AS g,
    sec
  FROM (VALUES ('ca',1),('cb',2)) AS s(sec, ord)
  CROSS JOIN generate_series(1,15) AS i
)
SELECT format('CREATE DATABASE %I OWNER project_admin;', '__project_' || g || '_' || sec || '_app')
FROM combos
ORDER BY grpnum;
\gexec

-- DB-level privileges + search_path
WITH combos AS (
  SELECT
    ((ord - 1) * 15 + i) AS grpnum,
    ('grp' || lpad(((ord - 1) * 15 + i)::text, 2, '0')) AS g,
    sec,
    (('grp' || lpad(((ord - 1) * 15 + i)::text, 2, '0')) || '_' || sec) AS r,
    ('__project_' || ('grp' || lpad(((ord - 1) * 15 + i)::text, 2, '0')) || '_' || sec || '_app') AS dbname
  FROM (VALUES ('ca',1),('cb',2)) AS s(sec, ord)
  CROSS JOIN generate_series(1,15) AS i
)
SELECT format($cmd$
REVOKE ALL ON DATABASE %1$I FROM PUBLIC;
GRANT CONNECT ON DATABASE %1$I TO project_admin;
GRANT CONNECT ON DATABASE %1$I TO %2$I;

REVOKE CREATE, TEMP ON DATABASE %1$I FROM PUBLIC;
REVOKE CREATE, TEMP ON DATABASE %1$I FROM %2$I;

ALTER ROLE %2$I IN DATABASE %1$I SET search_path = public, pg_catalog;
$cmd$,
dbname, r, g)
FROM combos
ORDER BY grpnum;
\gexec



WITH combos AS (
  SELECT
    ('grp' || lpad(((ord - 1) * 15 + i)::text, 2, '0')) AS g,
    sec,
    (('grp' || lpad(((ord - 1) * 15 + i)::text, 2, '0')) || '_' || sec) AS r,
    ('__project_' || ('grp' || lpad(((ord - 1) * 15 + i)::text, 2, '0')) || '_' || sec || '_app') AS dbname
  FROM (VALUES ('ca',1),('cb',2)) AS s(sec, ord)
  CROSS JOIN generate_series(1,15) AS i
)
-- needed because I messed up the previous version
SELECT format(
  'ALTER ROLE %I IN DATABASE %I SET search_path = public, pg_catalog;',
  r, dbname
)
FROM combos
ORDER BY dbname;
\gexec
-- End of script