const {
  SQL_CONTRACT,
  DEFAULT_SQL,
  SOLUTION_SQL,
  PGDATABASES_MAPPING,
  loadChannelMembershipSchemaInfo,
  loadChatSchemaInfo,
  parseChannelId,
  DEFAULT_MESSAGES_TABLE,
  MESSAGES_TABLE_ALIASES
} = require('./utils.js');
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { registerInstructorRoutes } = require("./instructor.js");
const { registerPopulateDbRoutes } = require("./populate_db.js");
require("dotenv").config();

const app = express();

function parseMilestoneEnv(rawValue, fallback) {
  const parsed = Number.parseInt(String(rawValue ?? "").trim(), 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

const ALLOW_SUPERUSER_MODE = process.env.ALLOW_SUPERUSER_MODE === "true";
const SANITY_CHECK_MILESTONE = parseMilestoneEnv(process.env.SANITY_CHECK_MILESTONE, 2);
const SCHEMA_INFO_TTL_MS = 60 * 1000;
const HEALTHCHECK_DB_USER = process.env.HEALTHCHECK_DB_USER || "demo";
const HEALTHCHECK_DB_PASS = process.env.HEALTHCHECK_DB_PASS || "demo";
const GIT_SHA = process.env.GIT_SHA || readGitSha() || "unknown";
const DEPLOYED_BY = process.env.DEPLOYED_BY || "unknown";
const TITLE_APPEND = String(process.env.TITLE || "").trim();
const DEPLOYED_AT = new Date().toISOString();
const SUBMISSIONS_DIR = process.env.SQL_SUBMISSIONS_DIR || path.join(__dirname, "..", "submissions");
const PT_TZ = "America/Los_Angeles";
function formatPt(iso) {
  const base = new Date(iso).toLocaleString("sv-SE", { timeZone: PT_TZ, hour12: false });
  return `${base.replace(" ", "T")} PT`;
}
function isSuperUserReq(req) {
  // Superuser check. Superuser uses solution SQL.
  return ALLOW_SUPERUSER_MODE && req.session?.dbUser === "demo";
}

function readGitSha() {
  try {
    const headPath = path.join(__dirname, "..", ".git", "HEAD");
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (head.startsWith("ref: ")) {
      const refPath = path.join(__dirname, "..", ".git", head.slice(5));
      return fs.readFileSync(refPath, "utf8").trim();
    }
    return head;
  } catch (_err) {
    return null;
  }
}

app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      // IMPORTANT. OK – self note. I thought about this a lot, and I don't want to make
      // it more secure than necessary for local testing for now.
      secure: false, // in theory, should true behind HTTPS
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 6
    }
  })
);

app.use(express.static(path.join(__dirname, "..", "public")));

app.use((req, _res, next) => {
  // console.log("sid", req.sessionID, "dbUser", req.session?.dbUser, "schema", req.session?.schema);
  next();
});


// =====================================================
// DB/Auth helpers
// =====================================================


const DEMO_POOL_MAX = Number(process.env.PG_POOL_MAX || 3);
const DEFAULT_POOL_MAX = Number(process.env.PG_POOL_MAX_DEFAULT || 3);

const DB_CONFIG_BASE = {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_POOL_CONN_MS || 5000)
};

function resolveDbPassword(dbUser, dbPass) {
  return dbUser === "demo" && dbPass === "demo" && ALLOW_SUPERUSER_MODE ? process.env.REAL_DEMO_PASSWORD : dbPass;
}

function dbConfig(dbUser, dbPass) {
  return {
    ...DB_CONFIG_BASE,
    max: dbUser === "demo" ? DEMO_POOL_MAX : DEFAULT_POOL_MAX,
    database: PGDATABASES_MAPPING[dbUser],
    user: dbUser,
    password: resolveDbPassword(dbUser, dbPass)
  };
}

async function withDb(dbUser, dbPass, fn) {
  const client = await getPool(dbUser, dbPass).connect();

  try {
    await client.query(`SET LOCAL search_path TO public;`);
    return await fn(client);
  } finally {
    client.release();
  }
}

const poolCache = new Map();
function getPool(dbUser, dbPass) {
  const config = dbConfig(dbUser, dbPass);
  const key = `${config.user}::${config.password || ""}`;
  let pool = poolCache.get(key);
  if (!pool) {
    pool = new Pool(config);
    poolCache.set(key, pool);
  }
  return pool;
}

async function dropPool(dbUser, dbPass) {
  if (!dbUser) return;
  const config = dbConfig(dbUser, dbPass);
  const key = `${config.user}::${config.password || ""}`;
  const pool = poolCache.get(key);
  if (!pool) return;
  poolCache.delete(key);
  await pool.end();
}

const DB_AUTH_ERROR_CODES = new Set(["28P01", "28000"]);
function isDbAuthError(err) {
  if (!err) return false;
  const code = err.code || err?.cause?.code;
  if (code && DB_AUTH_ERROR_CODES.has(code)) return true;
  const msg = String(err.message || err).toLowerCase();
  return (
    msg.includes("password authentication failed") ||
    msg.includes("role") && msg.includes("does not exist") ||
    msg.includes("no pg_hba.conf entry")
  );
}

function clearDbSession(req) {
  if (!req.session) return;
  req.session.dbUser = null;
  req.session.dbPass = null;
  req.session.chatUsername = null;
  clearSchemaInfoCache(req);
}

function clearSchemaInfoCache(req) {
  if (!req.session) return;
  req.session.chatSchemaInfo = null;
  req.session.chatSchemaInfoDbUser = null;
  req.session.chatSchemaInfoLoadedAt = null;
}

async function handleDbAuthFailure(req, res, err) {
  if (!isDbAuthError(err)) return false;
  const { dbUser, dbPass } = req.session || {};
  try { await dropPool(dbUser, dbPass); } catch { }
  clearDbSession(req);
  res.status(401).json({
    error: "Not logged in to group database.",
    detail: "Database authentication failed. Please log in again."
  });
  return true;
}

function dbError(error, detail, status = 400, extra = null) {
  const body = { error, detail };
  if (extra && typeof extra === "object") Object.assign(body, extra);
  return { status, body };
}

function sqlErrorExtra(key, err) {
  if (!err || err.sqlError !== true) return null;
  return { sqlKey: key, sqlError: true };
}

// prevents sql injection
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;
function qIdent(name) {
  const n = String(name || "").trim();
  if (!IDENT_RE.test(n)) throw new Error(`Unsafe identifier: ${n}`);
  return `"${n.replace(/"/g, '""')}"`;
}

function dbRoute(handler, errorFactory) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (e) {
      if (await handleDbAuthFailure(req, res, e)) return;
      if (typeof errorFactory === "function") {
        const resp = errorFactory(e, req) || {};
        const status = resp.status || 400;
        const body = resp.body || { error: "Request failed.", detail: String(e?.message || e) };
        return res.status(status).json(body);
      }
      next(e);
    }
  };
}

function requireGroupLogin(req, res, next) {
  if (!req.session?.dbUser || !req.session?.dbPass) {
    return res.status(401).json({ error: "Not logged in to group database." });
  }
  next();
}

function requireChatUser(req, res, next) {
  if (!req.session?.chatUsername) {
    return res.status(401).json({ error: "Not logged in as a chat user." });
  }
  next();
}

registerInstructorRoutes(app, {
  requireGroupLogin,
  dbRoute,
  dbError,
  publicDir: path.join(__dirname, "..", "public"),
  submissionsDir: SUBMISSIONS_DIR,
  progressLogPath: process.env.SQL_PROGRESS_LOG
});

registerPopulateDbRoutes(app, {
  requireGroupLogin,
  dbRoute,
  dbError,
  withDb,
  qIdent,
  publicDir: path.join(__dirname, "..", "public")
});

// Schema cache
function hasBaseChatSchemaInfo(info) {
  return Boolean(info?.channels_pk && info?.membership_channels_fk && info?.users_pk && info?.membership_users_fk);
}

function hasMessageSchemaInfo(info) {
  return Boolean(
    info &&
    Object.prototype.hasOwnProperty.call(info, "messages_table") &&
    Object.prototype.hasOwnProperty.call(info, "messages_channels_fk") &&
    Object.prototype.hasOwnProperty.call(info, "messages_users_fk")
  );
}

function isFreshSchemaInfoCache(req, includeMessages) {
  const cached = req.session?.chatSchemaInfo;
  const cachedDbUser = req.session?.chatSchemaInfoDbUser || null;
  const loadedAtRaw = req.session?.chatSchemaInfoLoadedAt;
  const loadedAt = Number(loadedAtRaw);
  const currentDbUser = req.session?.dbUser || null;
  if (!hasBaseChatSchemaInfo(cached)) return false;
  if (includeMessages && !hasMessageSchemaInfo(cached)) return false;
  if (!currentDbUser || !cachedDbUser || cachedDbUser !== currentDbUser) return false;
  if (!Number.isFinite(loadedAt) || loadedAt <= 0) return false;
  return (Date.now() - loadedAt) <= SCHEMA_INFO_TTL_MS;
}

function stripMessageSchemaInfo(info) {
  if (!info || typeof info !== "object") return {};
  const next = { ...info };
  delete next.messages_table;
  delete next.messages_channels_fk;
  delete next.messages_channels_fk_type;
  delete next.messages_users_fk;
  delete next.messages_users_fk_type;
  return next;
}

async function ensureSchemaInfo(req, options = {}) {
  const includeMessages = options.includeMessages !== false;
  const forceRefresh = options.forceRefresh === true;
  const cached = req.session?.chatSchemaInfo;
  if (!forceRefresh && isFreshSchemaInfoCache(req, includeMessages)) {
    return cached;
  }

  const { dbUser, dbPass } = req.session;
  if (!dbUser || !dbPass) throw new Error("Not logged in.");

  const info = await withDb(
    dbUser,
    dbPass,
    (client) => includeMessages ? loadChatSchemaInfo(client) : loadChannelMembershipSchemaInfo(client)
  );

  const merged = includeMessages
    ? { ...(cached || {}), ...info }
    : stripMessageSchemaInfo({ ...(cached || {}), ...info });
  req.session.chatSchemaInfo = merged;
  req.session.chatSchemaInfoDbUser = dbUser;
  req.session.chatSchemaInfoLoadedAt = Date.now();
  return merged;
}

// =====================================================
// Health
// =====================================================


async function readDbStats(client) {
  const dbNameRes = await client.query("SELECT current_database() AS current_database;");
  const currentDbRes = await client.query(
    "SELECT numbackends::int AS current_db_connections FROM pg_stat_database WHERE datname = current_database();"
  );
  const totalRes = await client.query(
    "SELECT sum(numbackends)::int AS total_connections FROM pg_stat_database;"
  );
  const maxRes = await client.query(
    "SELECT setting::int AS max_connections FROM pg_settings WHERE name = 'max_connections';"
  );

  const currentDatabase = dbNameRes.rows[0]?.current_database ?? null;
  const currentDbConnections = currentDbRes.rows[0]?.current_db_connections ?? null;
  const totalConnections = totalRes.rows[0]?.total_connections ?? null;
  const maxConnections = maxRes.rows[0]?.max_connections ?? null;
  const totalConnPct =
    typeof totalConnections === "number" && typeof maxConnections === "number" && maxConnections > 0
      ? Math.round((totalConnections / maxConnections) * 1000) / 10
      : null;

  const stats = {
    currentDatabase,
    dbConnectionsCurrentDb: currentDbConnections,
    dbConnectionsTotal: totalConnections,
    dbConnectionsMax: maxConnections,
    dbConnectionsPct: totalConnPct ? String(totalConnPct) + "%" : totalConnPct
  };

  try {
    const activityRes = await client.query(
      "SELECT state, count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() GROUP BY state;"
    );
    const dbSessionsByState = {};
    let dbSessionsCurrentDb = 0;
    for (const row of activityRes.rows) {
      const state = row.state ?? "unknown";
      const count = row.count ?? 0;
      dbSessionsByState[state] = count;
      dbSessionsCurrentDb += count;
    }
    stats.dbSessionsCurrentDb = dbSessionsCurrentDb;
    stats.dbSessionsByState = dbSessionsByState;
  } catch (err) {
    stats.dbActivityError = String(err?.message || err);
  }

  return stats;
}


function getStatusContext(req) {
  const sessionDbUser = req.session?.dbUser || null;
  const sessionDbPass = req.session?.dbPass || null;
  const sessionDatabase = sessionDbUser ? PGDATABASES_MAPPING[sessionDbUser] || null : null;
  const useSessionDb = Boolean(sessionDbUser && sessionDbPass && sessionDatabase);
  const statsDbUser = useSessionDb ? sessionDbUser : HEALTHCHECK_DB_USER;
  const statsDbPass = useSessionDb ? sessionDbPass : HEALTHCHECK_DB_PASS;
  const statsDbSource = useSessionDb ? "session" : "healthcheck";
  const statsDatabase = PGDATABASES_MAPPING[statsDbUser] || null;

  return {
    sessionDbUser,
    sessionDbPass,
    sessionDatabase,
    statsDbUser,
    statsDbPass,
    statsDbSource,
    statsDatabase
  };
}

async function getStatusResponse(req, includeDetails) {
  const {
    sessionDbUser,
    sessionDatabase,
    statsDbUser,
    statsDbPass,
    statsDbSource,
    statsDatabase
  } = getStatusContext(req);

  const base = includeDetails
    ? {
      gitSha: GIT_SHA,
      deployedBy: DEPLOYED_BY,
      deployedAt: DEPLOYED_AT,
      deployedAtPt: formatPt(DEPLOYED_AT),
      sanityCheckMilestone: SANITY_CHECK_MILESTONE,
      statsDbSource,
      statsDbUser,
      statsDatabase,
      sessionDbUser,
      sessionDatabase
    }
    : null;
  let poolStats = {};

  try {
    if (!statsDatabase) {
      throw new Error("Stats database user is not mapped.");
    }
    if (includeDetails) {
      const pool = getPool(statsDbUser, statsDbPass);
      poolStats = {
        poolTotalCount: pool.totalCount,
        poolIdleCount: pool.idleCount,
        poolWaitingCount: pool.waitingCount
      };
    }
    let dbStats = {};
    await withDb(statsDbUser, statsDbPass, async (client) => {
      await client.query("SELECT 1");
      if (!includeDetails) return;
      try {
        dbStats = await readDbStats(client);
      } catch (err) {
        dbStats = { dbStatsError: String(err?.message || err) };
      }
    });
    const body = includeDetails ? { ok: true, ...base, ...dbStats, ...poolStats } : { ok: true };
    return { status: 200, body };
  } catch (_err) {
    const body = includeDetails ? { ok: false, ...base, ...poolStats } : { ok: false };
    return { status: 503, body };
  }
}

async function handleStatus(req, res) {
  const { status, body } = await getStatusResponse(req, true);
  res.status(status).json(body);
}

async function handleHealth(req, res) {
  const { status, body } = await getStatusResponse(req, false);
  res.status(status).json(body);
}

app.get("/status", handleStatus);
app.get("/health", handleHealth);
app.get("/api/ui-config", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ title: TITLE_APPEND });
});



// =====================================================
// SQL templates
// =====================================================

// Template merge
function getMergedTemplates(req) {
  return { ...DEFAULT_SQL, ...(req.session.sqlTemplates || {}) };
}

function getSql(req, key) {
  if (isSuperUserReq(req)) {
    const base = SOLUTION_SQL[key] || "";
    return normalizeSingleStatement(resolveSolutionSql(req, key, base));
  }
  const custom = req.session?.sqlTemplates?.[key];
  const base = custom ?? DEFAULT_SQL[key];
  if (!base) throw new Error(`Unknown SQL template key: ${key}`);
  return normalizeSingleStatement(base);
}

function resolveSolutionSql(req, key, sql) {
  if (key !== "messages_list" && key !== "message_post") return sql;
  const table = String(req.session?.chatSchemaInfo?.messages_table || "").trim();
  if (!table || table === DEFAULT_MESSAGES_TABLE || !IDENT_RE.test(table)) return sql;
  const target = DEFAULT_MESSAGES_TABLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${target}\\b`, "gi");
  return String(sql || "").replace(re, table);
}

function expectedColsForKey(key) {
  const cols = SQL_CONTRACT?.[key]?.expectedCols;
  if (!cols) return null;
  return cols
    .map((c) => (c && typeof c === "object" ? c.name : c))
    .map((c) => String(c || "").trim())
    .filter(Boolean);
}

function assertExpectedCols(result, key) {
  const expected = expectedColsForKey(key);
  if (!expected || expected.length === 0) return;
  const cols = new Set((result?.fields || []).map((f) => String(f.name || "").toLowerCase()));
  const missing = expected.filter((c) => !cols.has(String(c).toLowerCase()));
  if (missing.length === 0) return;
  const err = new Error(`This query must return columns: ${missing.join(", ")}`);
  err.sqlError = true;
  err.sqlKey = key;
  throw err;
}

async function runSql(req, client, key, params) {
  try {
    const r = await client.query(getSql(req, key), params);
    assertExpectedCols(r, key);
    return r;
  } catch (e) {
    e.sqlKey = e.sqlKey || key;
    if (e.sqlError !== false) e.sqlError = true;
    throw e;
  }
}

// Single statement
function normalizeSingleStatement(sql) {
  const s = String(sql || "").trim();
  const t = s.endsWith(";") ? s.slice(0, -1).trim() : s;
  if (!t) throw new Error("SQL cannot be empty.");
  if (t.includes(";")) throw new Error("Only one SQL statement is allowed.");
  return t;
}

const DEFAULT_ALLOWED_SQL_FIRST_WORDS = ["select", "insert", "delete", "update", "with"];
function normalizeFirstWords(words) {
  const list = Array.isArray(words) ? words : [words];
  return list.map((w) => String(w || "").trim().toLowerCase()).filter(Boolean);
}
function buildAllowedFirstWords(contract) {
  const fromContract = Object.values(contract || {}).flatMap((cfg) =>
    normalizeFirstWords(cfg?.firstWords)
  );
  const unique = Array.from(new Set(fromContract));
  return new Set(unique.length > 0 ? unique : DEFAULT_ALLOWED_SQL_FIRST_WORDS);
}
const ALLOWED_SQL_FIRST_WORDS = buildAllowedFirstWords(SQL_CONTRACT);
const MAX_SQL_TEMPLATE_LEN = 600;
const COUNT_STAR_RE = /\bcount\s*\(\s*\*\s*\)/i;
const STAR_WITHOUT_COUNT_RE = /\*(?!\s*\))/; // bare star

function expectedFirstWordsForKey(key) {
  const words = SQL_CONTRACT?.[key]?.firstWords;
  if (!words) return null;
  const list = Array.isArray(words) ? words : [words];
  const normalized = list.map((w) => String(w || "").trim().toLowerCase()).filter(Boolean);
  return normalized.length ? normalized : null;
}

function validateSqlTemplate(key, normalized) {
  if (normalized.length > MAX_SQL_TEMPLATE_LEN) {
    throw new Error(`Template "${key}" exceeds ${MAX_SQL_TEMPLATE_LEN} characters.`);
  }
  const firstWord = normalized.trim().split(/\s+/)[0].toLowerCase();
  const expected = expectedFirstWordsForKey(key);
  if (expected) {
    const allowed = expected;
    if (!allowed.includes(firstWord)) {
      const label = allowed.map((w) => w.toUpperCase()).join("/");
      throw new Error(`Template "${key}" must start with ${label}.`);
    }
  } else if (!ALLOWED_SQL_FIRST_WORDS.has(firstWord)) {
    throw new Error(`Template "${key}" must start with SELECT/INSERT/DELETE/UPDATE/WITH.`);
  }

  if (normalized.includes("*") && !COUNT_STAR_RE.test(normalized)) {
    throw new Error(`Template "${key}" can only use "*" inside COUNT(*). Please list explicit columns.`);
  }

  if (STAR_WITHOUT_COUNT_RE.test(normalized.replace(COUNT_STAR_RE, ""))) {
    throw new Error(`Template "${key}" can only use "*" inside COUNT(*). Please list explicit columns.`);
  }

  if (normalized.includes("--")) {
    throw new Error(`Template "${key}" cannot contain comments (--).`);
  }

  const lower = normalized.toLowerCase();
  if (lower.includes("drop ") || lower.includes("alter ") || lower.includes("create ")) {
    throw new Error(`Template "${key}" cannot contain DROP/ALTER/CREATE statements.`);
  }
}

function safeFilenamePart(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function buildSqlSnapshot(req) {
  const dbUser = String(req.session?.dbUser || "unknown");
  const submittedAt = new Date().toISOString();
  const submittedAtPt = formatPt(submittedAt);
  const keys = Object.keys(DEFAULT_SQL);
  const templates = {};
  const lines = [
    `-- db_user: ${dbUser}`,
    `-- submitted_at: ${submittedAt}`,
    `-- submitted_at_pt: ${submittedAtPt}`,
    "--"
  ];

  for (const key of keys) {
    const sql = getSql(req, key);
    templates[key] = sql;
    lines.push(`-- ${key}`);
    lines.push(`${sql};`);
    lines.push("");
  }

  const content = lines.join("\n").trimEnd() + "\n";
  return { dbUser, submittedAt, templates, content };
}

function writeSqlSnapshotFile(snapshot) {
  const safeUser = safeFilenamePart(snapshot.dbUser);
  const safeStamp = safeFilenamePart(snapshot.submittedAt);
  const base = `${safeUser}_${safeStamp}`;

  fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });

  let filename = `${base}.sql`;
  let fullPath = path.join(SUBMISSIONS_DIR, filename);
  let i = 1;
  while (fs.existsSync(fullPath)) {
    filename = `${base}_${i}.sql`;
    fullPath = path.join(SUBMISSIONS_DIR, filename);
    i += 1;
  }

  fs.writeFileSync(fullPath, snapshot.content, "utf8");
  return { filename, fullPath };
}

// =====================================================
// API routes
// =====================================================

app.get("/api/sql_templates", requireGroupLogin, (req, res) => {
  res.json({ ok: true, templates: getMergedTemplates(req), contract: SQL_CONTRACT });
});

app.post("/api/sql_templates", requireGroupLogin, (req, res) => {
  const templates = req.body?.templates || {};
  req.session.sqlTemplates = req.session.sqlTemplates || {};

  try {
    for (const [key, sql] of Object.entries(templates)) {
      if (!(key in DEFAULT_SQL)) continue; // ignore unknown keys
      const normalized = normalizeSingleStatement(sql);
      validateSqlTemplate(key, normalized);

      req.session.sqlTemplates[key] = normalized;
    }
    const merged = getMergedTemplates(req);
    try {
    } catch (e) { }
    res.json({ ok: true, templates: merged, contract: SQL_CONTRACT });
  } catch (e) {
    res.status(400).json({ error: "Invalid SQL template.", detail: String(e.message || e) });
  }
});

app.post("/api/sql_templates/reset", requireGroupLogin, (req, res) => {
  req.session.sqlTemplates = {};
  const merged = getMergedTemplates(req);
  try {
    console.log('[sql_templates] reset to defaults');
  } catch (e) { }
  res.json({ ok: true, templates: merged, contract: SQL_CONTRACT });
});

app.post("/api/sql_templates/submit", requireGroupLogin, (req, res) => {
  try {
    const snapshot = buildSqlSnapshot(req);
    const { filename } = writeSqlSnapshotFile(snapshot);
    res.json({
      ok: true,
      filename,
      dbUser: snapshot.dbUser,
      submittedAt: snapshot.submittedAt
    });
  } catch (e) {
    res.status(400).json({
      error: "Failed to submit SQL templates.",
      detail: String(e.message || e)
    });
  }
});
// =====================================================

// --------------------
// Group login
// --------------------

async function testDbLogin(username, password) {
  await withDb(username, password, (client) => client.query("select 1;"));
}

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};

  try {
    await testDbLogin(username, password);
    req.session.dbUser = username;
    req.session.dbPass = password;
    req.session.chatUsername = null;
    clearSchemaInfoCache(req);
    if (!req.session.sqlTemplates) req.session.sqlTemplates = {};
    res.json({ ok: true, demoMode: isSuperUserReq(req) });
  } catch (e) {
    res.status(401).json({
      error: "Login failed. Check username/password and connectivity.",
      detail: String(e.message || e)
    });
  }
});


app.post("/api/credentials_login", requireGroupLogin, dbRoute(async (req, res) => {
  const username = req.session.dbUser;
  const password = req.session.dbPass;

  await testDbLogin(username, password);
  res.json({ ok: true, dbUser: username, demoMode: isSuperUserReq(req) });
}, (e) => dbError(
  "Login failed. Check username/password and connectivity.",
  String(e.message || e),
  401
)));



app.post("/api/logout", async (req, res) => {
  const { dbUser, dbPass } = req.session || {};
  try { await dropPool(dbUser, dbPass); } catch { }
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});


// Browser logout
app.get("/logout", async (req, res) => {
  const { dbUser, dbPass } = req.session || {};
  try { await dropPool(dbUser, dbPass); } catch { }
  req.session.destroy(() => {
    // Clear cookie
    res.clearCookie("connect.sid");
    res.redirect("/"); // or res.redirect("/index.html");
  });
});


// --------------------
// User auth
// --------------------
app.post("/api/user/register", requireGroupLogin, dbRoute(async (req, res) => {
  const { username, password_hash } = req.body || {};
  const u = String(username || "").trim();
  const h = String(password_hash || "").trim();

  if (!u) return res.status(400).json({ error: "username is required." });
  if (h.length !== 128) return res.status(400).json({ error: "password_hash must be 128 characters." });

  const { dbUser, dbPass } = req.session;

  await withDb(dbUser, dbPass, async (client) => {
    await runSql(req, client, "user_register", [u, h]);
  });
  res.json({ ok: true });
}, (e) => {
  const msg = String(e.message || e);
  if (msg.includes("duplicate key") || msg.includes("already exists")) {
    return dbError("Username already exists.", null, 409);
  }
  return dbError("Registration failed.", msg, 400, sqlErrorExtra("user_register", e));
}));

app.post("/api/user/login", requireGroupLogin, dbRoute(async (req, res) => {
  const { username, password_hash } = req.body || {};
  const u = String(username || "").trim();
  const h = String(password_hash || "").trim();

  if (!u) return res.status(400).json({ error: "username is required." });
  if (h.length !== 128) return res.status(400).json({ error: "password_hash must be 128 characters." });

  const { dbUser, dbPass } = req.session;

  const ok = await withDb(dbUser, dbPass, async (client) => {
    const r = await runSql(req, client, "user_login", [u]);
    if (r.rowCount === 0) return false;
    return r.rows[0].password === h;
  });

  if (!ok) return res.status(401).json({ error: "Invalid username or password." });

  req.session.chatUsername = u;
  res.json({ ok: true, username: u });
}, (e) => dbError("Login failed.", String(e.message || e), 400, sqlErrorExtra("user_login", e))));

app.post("/api/user/logout", requireGroupLogin, (req, res) => {
  req.session.chatUsername = null;
  res.json({ ok: true });
});

// --------------------
// Channels
// --------------------
app.get("/api/channels", requireGroupLogin, requireChatUser, dbRoute(async (req, res) => {
  const { dbUser, dbPass, chatUsername } = req.session;

  const channels = await withDb(dbUser, dbPass, async (client) => {
    const r = await runSql(req, client, "channels_list", [chatUsername]);
    return r.rows;
  });

  res.json({ ok: true, channels });
}, (e) => dbError("Failed to load channels.", String(e.message || e), 400, sqlErrorExtra("channels_list", e))));

// Channel members
app.get("/api/channels/members", requireGroupLogin, requireChatUser, dbRoute(async (req, res) => {
  await ensureSchemaInfo(req, { includeMessages: false });
  const cid = parseChannelId(req, req.query.channel_id);
  const { dbUser, dbPass } = req.session;
  const members = await withDb(dbUser, dbPass, async (client) => {
    const r = await runSql(req, client, "channel_members_list", [cid]);
    return r.rows.map(row => Object.values(row || {})[0]).filter(v => v != null).map(String);
  });
  res.json({ ok: true, members });
}, (e) => dbError("Failed to load channel members.", String(e.message || e), 400, sqlErrorExtra("channel_members_list", e))));


app.post("/api/channels/create", requireGroupLogin, requireChatUser, dbRoute(async (req, res) => {
  const { name, description } = req.body || {};
  const channel_name = String(name || "").trim();
  const channel_description = String(description || "").trim();

  if (!channel_name) return res.status(400).json({ error: "channel_name is required." });
  if (!channel_description) return res.status(400).json({ error: "channel_description is required." });
  const { dbUser, dbPass } = req.session;
  await withDb(dbUser, dbPass, async (client) => {
    await runSql(req, client, "channel_create", [channel_name, channel_description]);
  });
  res.json({ ok: true });
}, (e) => dbError("Failed to create channel.", String(e.message || e), 400, sqlErrorExtra("channel_create", e))));

app.post("/api/channels/join", requireGroupLogin, requireChatUser, dbRoute(async (req, res) => {
  await ensureSchemaInfo(req, { includeMessages: false });
  const cid = parseChannelId(req, req.body?.channel_id);
  const { dbUser, dbPass, chatUsername } = req.session;
  await withDb(dbUser, dbPass, async (client) => {
    await runSql(req, client, "channel_join", [chatUsername, cid]);
  });
  res.json({ ok: true });
}, (e) => dbError("Failed to join channel.", String(e.message || e), 400, sqlErrorExtra("channel_join", e))));


app.post("/api/channels/leave", requireGroupLogin, requireChatUser, dbRoute(async (req, res) => {
  const { channel_id } = req.body || {};
  await ensureSchemaInfo(req, { includeMessages: false });
  const cid = parseChannelId(req, channel_id);
  const { dbUser, dbPass, chatUsername } = req.session;
  await withDb(dbUser, dbPass, async (client) => {
    await runSql(req, client, "channel_leave", [chatUsername, cid]);
  });
  res.json({ ok: true });
}, (e) => dbError("Failed to leave channel.", String(e.message || e), 400, sqlErrorExtra("channel_leave", e))));

// --------------------
// Messages
// --------------------
app.get("/api/messages", requireGroupLogin, requireChatUser, dbRoute(async (req, res) => {
  await ensureSchemaInfo(req);
  const cid = parseChannelId(req, req.query.channel_id);
  const { dbUser, dbPass, chatUsername } = req.session;
  const trace = [];
  const messages = await withDb(dbUser, dbPass, async (client) => {
    const runWithTrace = async (key, params, queryFn) => {
      const entry = { key, paramsCount: Array.isArray(params) ? params.length : 0, status: "running" };
      trace.push(entry);
      try {
        const r = await queryFn();
        entry.status = "ok";
        return r;
      } catch (e) {
        entry.status = "error";
        e.sqlKey = key;
        e.sqlTrace = trace;
        if (e.sqlError !== false) e.sqlError = true;
        throw e;
      }
    };

    const mem = await runWithTrace(
      "member_check",
      [chatUsername, cid],
      () => runSql(req, client, "member_check", [chatUsername, cid])
    );
    if (mem.rowCount === 0) {
      const err = new Error("You must join this channel to view messages.");
      err.sqlKey = "member_check";
      err.sqlTrace = trace;
      err.sqlError = false;
      throw err;
    }

    const r = await runWithTrace(
      "messages_list",
      [cid],
      () => runSql(req, client, "messages_list", [cid])
    );
    return r.rows;
  });

  res.json({ ok: true, messages });
}, (e) => dbError(
  "Failed to load messages.",
  String(e.message || e),
  400,
  (() => {
    const extra = { sqlKey: e.sqlKey || null, sqlTrace: e.sqlTrace || null };
    if (typeof e.sqlError === "boolean") extra.sqlError = e.sqlError;
    return extra;
  })()
)));


app.post("/api/message", requireGroupLogin, requireChatUser, dbRoute(async (req, res) => {
  const { channel_id, body } = req.body || {};
  const b = String(body || "").trim();

  if (!b) return res.status(400).json({ error: "body is required." });

  await ensureSchemaInfo(req);
  const cid = parseChannelId(req, channel_id);
  const { dbUser, dbPass, chatUsername } = req.session;
  const result = await withDb(dbUser, dbPass, async (client) => {
    const r = await runSql(req, client, "message_post", [chatUsername, cid, b]);
    return r.rows[0];
  });

  res.json({ ok: true, ...result });
}, (e) => dbError(
  "Failed to post message.",
  String(e.message || e),
  400,
  sqlErrorExtra("message_post", e)
)));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`SQL Chat app running on http://localhost:${port}`);
});



// =====================================================
// Schema check
// =====================================================

const CHANNEL_NAME_ALIASES = ["name", "channel_name", "channelname", "cname"];
const CHANNEL_DESC_ALIASES = ["description", "channel_description", "channel_desc", "desc", "cdesc"];
const USER_PASSWORD_ALIASES = ["password", "password_hash", "password_digest", "pwd"];

async function findFirstColumnByAliases(client, table, aliases) {
  const list = (aliases || [])
    .map((c) => String(c || "").trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return null;
  const { rows } = await client.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'public'
       and table_name = $1
       and lower(column_name) = any($2::text[])
     order by array_position($2::text[], lower(column_name))
     limit 1;`,
    [table, list]
  );
  return rows[0]?.column_name || null;
}

app.get("/api/test_schema", requireGroupLogin, dbRoute(async (req, res) => {
  const { dbUser, dbPass } = req.session;
  const info = await ensureSchemaInfo(req, {
    includeMessages: SANITY_CHECK_MILESTONE >= 3,
    forceRefresh: true
  });

  const channelsPkCol = qIdent(info.channels_pk);
  const channelsFkCol = qIdent(info.membership_channels_fk);
  const usersPkCol = qIdent(info.users_pk);
  const usersFkCol = qIdent(info.membership_users_fk);
  let messagesTable = null;
  let messagesChannelFkCol = null;
  let messagesUserFkCol = null;

  if (SANITY_CHECK_MILESTONE >= 3) {
    const messagesTableRaw = info.messages_table;
    if (!messagesTableRaw) {
      const aliases = Array.isArray(MESSAGES_TABLE_ALIASES) ? MESSAGES_TABLE_ALIASES : [];
      const label = aliases.length
        ? aliases.map((name) => `"${name}"`).join(" or ")
        : `"${DEFAULT_MESSAGES_TABLE}"`;
      throw new Error(`Messages table must be named ${label}.`);
    }

    const messagesChannelFkRaw = info.messages_channels_fk;
    const messagesUserFkRaw = info.messages_users_fk;
    if (!messagesChannelFkRaw) {
      throw new Error(`Messages table must include a foreign key path to channels (directly or via channel_members).`);
    }
    if (!messagesUserFkRaw) {
      throw new Error(`Messages table must include a foreign key path to users (directly or via channel_members).`);
    }

    messagesTable = qIdent(messagesTableRaw);
    messagesChannelFkCol = qIdent(messagesChannelFkRaw);
    messagesUserFkCol = qIdent(messagesUserFkRaw);
  }

  await withDb(dbUser, dbPass, async (client) => {
    const sanityChecks = [];

    if (SANITY_CHECK_MILESTONE >= 2) {
      const channelsNameRaw = await findFirstColumnByAliases(client, "channels", CHANNEL_NAME_ALIASES);
      if (!channelsNameRaw) {
        throw new Error(
          `Channels table must include a name column (${CHANNEL_NAME_ALIASES.join(", ")}). `
        );
      }
      const channelsDescRaw = await findFirstColumnByAliases(client, "channels", CHANNEL_DESC_ALIASES);
      if (!channelsDescRaw) {
        throw new Error(
          `Channels table must include a description column (${CHANNEL_DESC_ALIASES.join(", ")}). `
        );
      }
      const passwordRaw = await findFirstColumnByAliases(client, "users", USER_PASSWORD_ALIASES);
      if (!passwordRaw) {
        throw new Error(
          `Users table must include a password column (${USER_PASSWORD_ALIASES.join(", ")}). `
        );
      }

      const channelsNameCol = qIdent(channelsNameRaw);
      const channelsDescCol = qIdent(channelsDescRaw);
      const passwordCol = qIdent(passwordRaw);
      sanityChecks.push(
        `select ${usersPkCol}, ${passwordCol} from users limit 0;`,
        `select ${channelsPkCol}, ${channelsNameCol}, ${channelsDescCol} from channels limit 0;`,
        `select ${usersFkCol}, ${channelsFkCol} from channel_members limit 0;`
      );
    }

    if (SANITY_CHECK_MILESTONE >= 3) {
      sanityChecks.push(
        `select ${messagesUserFkCol}, ${messagesChannelFkCol} from ${messagesTable} limit 0;`
      );
    }

    for (const checkQuery of sanityChecks) {
      console.log("Testing", checkQuery);
      await client.query(checkQuery);
    }
  });

  return res.json({ ok: true });
}, (e) => dbError("Incorrect Schema.", String(e.message || e))));

// =====================================================
// Password reset
// =====================================================

app.post("/api/user/reset_password", requireGroupLogin, dbRoute(async (req, res) => {
  const { username, old_password_hash, new_password_hash } = req.body || {};
  const u = String(username || "").trim();
  const oldH = String(old_password_hash || "").trim();
  const newH = String(new_password_hash || "").trim();

  if (!u) return res.status(400).json({ error: "username is required." });
  if (oldH.length !== 128) return res.status(400).json({ error: "old_password_hash must be 128 characters." });
  if (newH.length !== 128) return res.status(400).json({ error: "new_password_hash must be 128 characters." });
  if (oldH === newH) return res.status(400).json({ error: "New password must be different." });

  const { dbUser, dbPass } = req.session;

  const changed = await withDb(dbUser, dbPass, async (client) => {
    const r = await runSql(req, client, "update_password", [u, newH, oldH]);
    return r.rowCount;
  });

  if (changed === 0) {
    return res.status(401).json({ error: "Invalid username or current password." });
  }

  // Keep session
  if (req.session.chatUsername === u) req.session.chatUsername = u;

  res.json({ ok: true });
}, (e) => dbError("Password reset failed.", String(e.message || e), 400, sqlErrorExtra("update_password", e))));
