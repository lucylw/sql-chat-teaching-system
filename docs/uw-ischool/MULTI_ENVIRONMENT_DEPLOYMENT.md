# Multi-Environment Deployment on One Server

This guide is for adding one additional faculty/course environment at a time on the same server.

Use it like this:

- keep the existing site as-is
- add one new environment
- if you need another environment later, repeat the same process with new parameter values

Each hostname/domain should have its own checkout of the codebase. Do not place multiple hostnames under a shared app root.

This keeps the student login flow unchanged: students still enter only DB username and password. The app-level `PGHOST` and `PGPORT` stay server-side.

This guide assumes you are already using the main PM2/Nginx deployment model from [`../HANDOFF.md`](../HANDOFF.md).

## Why this pattern

This is simpler and safer than asking students to enter DB ports:

- no frontend login changes
- no session or pool-cache changes
- no cross-environment connection confusion
- separate logs, secrets, restarts, and hostnames per environment
- easier handoff to another instructor later

## Set Parameters First

Before you run anything, fill in these values for the one new environment you are adding.

Example:

```bash
SECTION_ID=sp26a
DEPLOY_USER=belencsf
REPO_URL=https://github.com/bcsaldias/sql-chat-teaching-system

HOSTNAME=$SECTION_ID.is-info330.ischool.uw.edu
HOST_ROOT=/home/$DEPLOY_USER/$HOSTNAME
APP_DIR=$HOST_ROOT/sql-chat-teaching-system

APP_PORT=3012
DB_HOST=is-info330.ischool.uw.edu
DB_PORT=5442

PM2_APP_NAME=sql-chat-$SECTION_ID
PM2_CONFIG=config/pm2/ecosystem.$SECTION_ID.config.js
```

Change these values for each new environment:

- `SECTION_ID`
- `DEPLOY_USER`
- `HOSTNAME`
- `HOST_ROOT` if you are not using `/home/$DEPLOY_USER/$HOSTNAME`
- `APP_PORT`
- `DB_HOST`
- `DB_PORT`
- `PM2_APP_NAME`

The important uniqueness rules are:

- `APP_PORT` must not match any other running environment
- `DB_PORT` must match the PostgreSQL instance for this environment
- `HOSTNAME` must be unique
- `HOST_ROOT` must point to this hostname's checkout only
- `PM2_APP_NAME` must be unique
- `.env` secrets must be unique

## Directory Layout

This guide uses one host-specific directory per deployed hostname under the deploy user's home directory:

```text
/home/belencsf/is-info330.ischool.uw.edu/sql-chat-teaching-system/
/home/belencsf/$SECTION_ID.is-info330.ischool.uw.edu/sql-chat-teaching-system/
```

Do not move an already working site just to match this exact path shape. The important part is one code checkout per host/domain.

## Current INFO330 Nginx Layout

The checked-in Nginx files under [`../../config/nginx/`](../../config/nginx/) now describe the current INFO330 multi-host Nginx setup, not just a generic one-host example:

- [`../../config/nginx/site.conf`](../../config/nginx/site.conf) routes the main host to port `3000`, `a.` to `3001`, `b.` to `3002`, `c.` to `3003`, and includes the optional Jupyter listener on `8443`
- [`../../config/nginx/info330-ssl.conf`](../../config/nginx/info330-ssl.conf) holds the reusable TLS certificate and protocol settings
- [`../../config/nginx/proxy-common.conf`](../../config/nginx/proxy-common.conf) holds the common reverse-proxy headers for the app
- [`../../config/nginx/proxy-jupyter.conf`](../../config/nginx/proxy-jupyter.conf) holds the Jupyter-specific proxy settings

If you change the live INFO330 Nginx layout, keep these files and this document in sync. If you are creating a brand new single-host environment, treat `site.conf` as a pattern to trim down rather than copying the entire multi-host file unchanged.

## Step-by-Step Setup for One New Environment

### 1) Prepare the host-specific deploy directory and ownership

Create the host root and assign it to the deploy user for that environment:

```bash
sudo mkdir -p "$HOST_ROOT"
sudo chown "$DEPLOY_USER":"$DEPLOY_USER" "$HOST_ROOT"
sudo chmod 755 "$HOST_ROOT"
```

Run the app checkout and app-management steps as `DEPLOY_USER`. If you are not already that user, switch before continuing.

### 2) Create the new checkout

```bash
git clone "$REPO_URL" "$APP_DIR"
```

If you prefer, you can copy an existing deployed checkout instead. The important part is that each hostname gets its own checkout.

### 3) Install dependencies

```bash
cd "$APP_DIR"
npm ci
```

### 4) Create the environment-specific `.env`

```bash
cd "$APP_DIR"
cp .env.example .env
```

Generate fresh secrets for this environment:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # INSTRUCTOR_TOKEN
```

Set at least these values in `"$APP_DIR/.env"`:

```env
NODE_ENV=production
DEPLOYED_BY=$DEPLOY_USER
PORT=3012
PGHOST=is-info330.ischool.uw.edu
PGPORT=5442
SESSION_SECRET=<unique-random-value>
HEALTHCHECK_DB_USER=demo
HEALTHCHECK_DB_PASS=<environment-specific-password>
INSTRUCTOR_TOKEN=<unique-random-value>
ALLOW_SUPERUSER_MODE=false
```

These values must be unique per environment:

- `PORT`
- `PGPORT`
- `SESSION_SECRET`
- `INSTRUCTOR_TOKEN`
- `HEALTHCHECK_DB_PASS`

### 5) Confirm the DB mapping for this environment

Review [`../../src/utils.js`](../../src/utils.js) and make sure `PGDATABASES_MAPPING` matches the usernames and database names for this environment.

If this environment uses the same username pattern and database names as the existing site, this file may not need changes. If the new environment uses a different group set, update the mapping in this checkout only.

### 6) Create an environment-specific PM2 config

Do not reuse the same PM2 app name as an existing site.

```bash
cd "$APP_DIR"
cp config/pm2/ecosystem.config.js "$PM2_CONFIG"
```

Edit `"$APP_DIR/$PM2_CONFIG"` and change only the app name to the actual `PM2_APP_NAME` value:

```js
name: "sql-chat-$SECTION_ID",
```

Leave `script`, `cwd`, and `env_file` unchanged. In this checkout, `env_file` should still point to this checkout's `.env`.

### 7) Start the new environment with PM2

```bash
cd "$APP_DIR"
pm2 start "$PM2_CONFIG" --env production
```

If you later change `.env` or `"$PM2_CONFIG"` and want PM2 to re-read that config file, run:

```bash
cd "$APP_DIR"
pm2 restart "$PM2_CONFIG" --env production --update-env
```

Confirm it is online:

```bash
pm2 list
pm2 logs "$PM2_APP_NAME" --lines 100
```

Persist PM2 state if needed:

```bash
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup` if this PM2 user has not already been configured for reboot survival.

### 8) Sync and reload the INFO330 Nginx config if needed

If the checked-in files under `config/nginx/` already match the live server and already include this hostname-to-port mapping, you can skip this step.

If you changed the Nginx mapping for this environment, update the checked-in files first and then sync them to the live Nginx paths:

```bash
sudo cp "$APP_DIR/config/nginx/site.conf" /etc/nginx/sites-available/is-info330.ischool.uw.edu
sudo cp "$APP_DIR/config/nginx/info330-ssl.conf" /etc/nginx/snippets/info330-ssl.conf
sudo cp "$APP_DIR/config/nginx/proxy-common.conf" /etc/nginx/snippets/proxy-common.conf
```

If you are using Jupyter for the main domain, also sync the Jupyter snippet:

```bash
sudo cp "$APP_DIR/config/nginx/proxy-jupyter.conf" /etc/nginx/snippets/proxy-jupyter.conf
```

For a new `HOSTNAME`, make sure `config/nginx/site.conf` already contains the matching `server_name` and `proxy_pass http://127.0.0.1:<APP_PORT>;` entry before you reload Nginx.

TLS settings live in `/etc/nginx/snippets/info330-ssl.conf`. If the new hostname needs different certificate coverage, update that snippet or switch to a hostname-specific TLS snippet before you reload Nginx.

For each new `HOSTNAME`, ask iSchool IT to provision the DNS record and TLS certificate coverage before you expect the public HTTPS URL to work.

Validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 9) Verify the new environment

Check the app directly first:

```bash
curl -i "http://127.0.0.1:$APP_PORT/health"
```

Check Nginx host matching locally on the server:

```bash
curl -i -H "Host: $HOSTNAME" http://127.0.0.1/health
```

Check HTTPS locally before public DNS is ready:

```bash
curl -k -i --resolve "$HOSTNAME:443:127.0.0.1" "https://$HOSTNAME/health"
```

Only after DNS and TLS are ready, check the public URL:

```bash
curl -i "https://$HOSTNAME/health"
```

Then do one browser smoke test for the new environment:

1. Open the environment hostname and confirm the login page loads.
2. Log in with a known group DB account for that environment.
3. Open SQL Lab and run a safe read-only query.
4. Open `/populate_db` and confirm the page loads.
5. Open `/instructor` with that environment's `INSTRUCTOR_TOKEN`.
6. Check `/status` and confirm `ok: true`.

## Repeat for the Next Environment

If you need another environment later, repeat this document from the `Set Parameters First` section with new values.

You should not need to change the process itself. Only the parameter values should change.

## Updating Code Later

When you deploy code changes, update each environment separately.

Example for one environment:

```bash
cd "$APP_DIR"
git pull
npm ci
pm2 restart "$PM2_APP_NAME" --update-env
```

That restarts only the named app, not every deployed environment.

If you changed `.env` or `"$PM2_CONFIG"` itself, use the config-file restart instead:

```bash
cd "$APP_DIR"
pm2 restart "$PM2_CONFIG" --env production --update-env
```

Run the smoke test for that hostname after restart.

## What Not to Do

- Do not move an already working environment just to match the example paths in this doc.
- Do not run multiple environments behind URL path prefixes like `/$SECTION_ID` unless you first refactor the app for a configurable base path.
- Do not reuse the same `SESSION_SECRET` or `INSTRUCTOR_TOKEN` across environments.
- Do not point multiple Nginx hostnames at the same local app port in this deployment model.
