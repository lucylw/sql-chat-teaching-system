// =====================================================
// SQL LAB SUPPORTING CODE
// =====================================================

const DEFAULT_MESSAGES_TABLE = "chat_inbox";
const MESSAGES_TABLE_ALIASES = [DEFAULT_MESSAGES_TABLE, "messages"];

// SQL contract (shared requirements)
const SQL_CONTRACT = {
    user_login: { firstWords: ["select"], expectedCols: [{ name: "password" }] },
    user_register: { firstWords: ["insert"] },
    update_password: { firstWords: ["update"] },
    channels_list: {
        firstWords: ["with", "select"],
        // allowing CTE and simple nested queries
        expectedCols: [
            { name: "id" },
            { name: "name" },
            { name: "description" },
            { name: "is_member", type: "boolean" },
            { name: "user_count", type: "integer" }
        ]
    },
    channel_join: { firstWords: ["insert"] },
    channel_leave: { firstWords: ["delete"] },
    member_check: { firstWords: ["select"] },
    messages_list: {
        firstWords: ["select"],
        expectedCols: [
            { name: "username" },
            { name: "body" },
            { name: "created_at", type: "timestamp" }
        ]
    },
    message_post: {
        firstWords: ["insert", "select"]
        // allowing insert or select to insert through a function
    },
    channel_members_list: { firstWords: ["select"], expectedCols: [{ name: "username" }] },
    channel_create: { firstWords: ["insert"] }
};

function normalizeFirstWords(words) {
    const list = Array.isArray(words) ? words : [words];
    return list.map((w) => String(w || "").trim().toLowerCase()).filter(Boolean);
}

function buildDefaultSql(contract) {
    const out = {};
    for (const [key, cfg] of Object.entries(contract || {})) {
        const list = normalizeFirstWords(cfg?.firstWords);
        const first = list[0] || "select";
        out[key] = `${first.toUpperCase()} '';`;
    }
    return out;
}

// Default SQL templates
const DEFAULT_SQL = buildDefaultSql(SQL_CONTRACT);

// solution for solutions/demo_solution_channel_name_pk, used in demo.
const SOLUTION_SQL = {
    "user_login": "SELECT password FROM users WHERE username = $1;",
    "user_register": "INSERT INTO users(username, password) VALUES ($1, $2);",
    "update_password": "UPDATE users SET password = $2 WHERE username = $1 AND password = $3;",
    "channels_list": `SELECT
 c.name as id,
 c.name as name,
 c.description as description,
 (cm.username IS NOT NULL) AS is_member,
 (SELECT COUNT(*) FROM channel_members cm2 WHERE cm2.channel = c.name) AS user_count
FROM channels c
LEFT JOIN channel_members cm
 ON cm.channel = c.name
AND cm.username = $1
ORDER BY c.name;`,
    "channel_join": "INSERT INTO channel_members(username, channel) VALUES ($1, $2) ON CONFLICT DO NOTHING;",
    "channel_leave": "DELETE FROM channel_members WHERE username = $1 AND channel = $2;",
    "member_check": "SELECT true FROM channel_members WHERE username = $1 AND channel = $2;",
    "messages_list": `SELECT username, body, created_at
FROM (
  SELECT username, body, created_at
  FROM ${DEFAULT_MESSAGES_TABLE}
  WHERE channel_id = $1
  ORDER BY created_at DESC
  LIMIT 50
) t
ORDER BY created_at ASC;`,
    "message_post": `INSERT INTO ${DEFAULT_MESSAGES_TABLE}(username, channel_id, body) VALUES ($1, $2, $3);`,
    "channel_members_list": "SELECT username FROM channel_members WHERE channel = $1 ORDER BY username;",
    "channel_create": "INSERT INTO channels(name, description) VALUES ($1, $2);"
};

const PGDATABASES_MAPPING = {
    "grp01_ca": "__project_grp01_ca_app",
    "grp02_ca": "__project_grp02_ca_app",
    "grp03_ca": "__project_grp03_ca_app",
    "grp04_ca": "__project_grp04_ca_app",
    "grp05_ca": "__project_grp05_ca_app",
    "grp06_ca": "__project_grp06_ca_app",
    "grp07_ca": "__project_grp07_ca_app",
    "grp08_ca": "__project_grp08_ca_app",
    "grp09_ca": "__project_grp09_ca_app",
    "grp10_ca": "__project_grp10_ca_app",
    "grp11_ca": "__project_grp11_ca_app",
    "grp12_ca": "__project_grp12_ca_app",
    "grp13_ca": "__project_grp13_ca_app",
    "grp14_ca": "__project_grp14_ca_app",
    "grp15_ca": "__project_grp15_ca_app",

    "grp16_cb": "__project_grp16_cb_app",
    "grp17_cb": "__project_grp17_cb_app",
    "grp18_cb": "__project_grp18_cb_app",
    "grp19_cb": "__project_grp19_cb_app",
    "grp20_cb": "__project_grp20_cb_app",
    "grp21_cb": "__project_grp21_cb_app",
    "grp22_cb": "__project_grp22_cb_app",
    "grp23_cb": "__project_grp23_cb_app",
    "grp24_cb": "__project_grp24_cb_app",
    "grp25_cb": "__project_grp25_cb_app",
    "grp26_cb": "__project_grp26_cb_app",
    "grp27_cb": "__project_grp27_cb_app",
    "grp28_cb": "__project_grp28_cb_app",
    "grp29_cb": "__project_grp29_cb_app",
    "grp30_cb": "__project_grp30_cb_app",

    "demo": "__project_demo_app",
    "test0": "__project_test0_app"

}


// =====================================================
// SCHEMA INTROSPECTION
// =====================================================
// ========================================================================
// The code below allows to adapt to students schemas if needed.
// Because it's the first time running this project, I'll keep it
// in case I need it, but in a refined version, this shouldn't be needed.
// ========================================================================


// NOTE: this could be spared if we force the students to an ID type, but I want to allow some flexibility.
function parseByDataType(dataType, raw) {
    const t = String(dataType ?? "").toLowerCase();
    const isNum = /(int|numeric|decimal|real|double|float)/.test(t);

    if (!isNum) return String(raw);

    const n = Number(raw);
    if (Number.isNaN(n)) throw new Error(`Expected numeric id, got: ${raw}`);
    return n;
}

function parseChannelId(req, channel_id_raw) {
    const info = req.session?.chatSchemaInfo;
    const dtype = info?.channels_pk_type || info?.tables?.channels?.pk?.types?.[0] || "text";
    return parseByDataType(dtype, channel_id_raw);
}

async function loadChatSchemaInfo(client) {
    const baseInfo = await loadChannelMembershipSchemaInfo(client);
    const {
        channels_pk,
        channels_pk_type,
        users_pk,
        users_pk_type,
        membership_channels_fk,
        membership_channels_fk_type,
        membership_users_fk,
        membership_users_fk_type,
    } = baseInfo;
    const messages_table = await resolveMessagesTableName(client);
    const {
        messages_channels_fk,
        messages_channels_fk_type,
        messages_users_fk,
        messages_users_fk_type,
    } = await loadMessagesKeys(client, messages_table, {
        membership_channels_fk,
        membership_users_fk
    });

    return {
        channels_pk,
        channels_pk_type,
        users_pk,
        users_pk_type,
        membership_channels_fk,
        membership_channels_fk_type,
        membership_users_fk,
        membership_users_fk_type,
        messages_table,
        messages_channels_fk,
        messages_channels_fk_type,
        messages_users_fk,
        messages_users_fk_type
    }
}

async function loadChannelMembershipSchemaInfo(client) {
    // with this info, we can double check that students are using PK and FK properly.
    const {
        channels_pk,
        channels_pk_type,
        users_pk,
        users_pk_type,
        membership_channels_fk,
        membership_channels_fk_type,
        membership_users_fk,
        membership_users_fk_type,
    } = await loadChannelMembershipKeys(client);

    return {
        channels_pk,
        channels_pk_type,
        users_pk,
        users_pk_type,
        membership_channels_fk,
        membership_channels_fk_type,
        membership_users_fk,
        membership_users_fk_type
    }
}

async function resolveMessagesTableName(client) {
    const { rows } = await client.query(
        `select table_name
         from information_schema.tables
         where table_schema = 'public'
           and table_name = any($1::text[])
         order by array_position($1::text[], table_name)
         limit 1;`,
        [MESSAGES_TABLE_ALIASES]
    );
    return rows[0]?.table_name || null;
}

async function loadMessagesKeys(client, tableName, options = {}) {
    const name = String(tableName || "").trim();
    const membershipChannelsFk = String(options.membership_channels_fk || "").trim() || null;
    const membershipUsersFk = String(options.membership_users_fk || "").trim() || null;
    if (!name) {
        return {
            messages_channels_fk: null,
            messages_channels_fk_type: null,
            messages_users_fk: null,
            messages_users_fk_type: null
        };
    }

    const { rows } = await client.query(`
    SELECT
      COALESCE(msg_chan_fk.col, msg_member_chan_fk.col) AS messages_channels_fk,
      COALESCE(msg_chan_fk.typ, msg_member_chan_fk.typ) AS messages_channels_fk_type,
      COALESCE(msg_user_fk.col, msg_member_user_fk.col) AS messages_users_fk,
      COALESCE(msg_user_fk.typ, msg_member_user_fk.typ) AS messages_users_fk_type
    FROM (SELECT 1) base
    LEFT JOIN LATERAL (
      SELECT a.attname AS col, a.atttypid::regtype::text AS typ
      FROM pg_constraint c
      JOIN pg_class t      ON t.oid = c.conrelid
      JOIN pg_namespace n  ON n.oid = t.relnamespace
      JOIN pg_class rt     ON rt.oid = c.confrelid
      JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = 'public'
        AND t.relname = $1
        AND rt.relname = 'channels'
        AND c.contype = 'f'
      ORDER BY k.ord
      LIMIT 1
    ) msg_chan_fk ON true
    LEFT JOIN LATERAL (
      SELECT a.attname AS col, a.atttypid::regtype::text AS typ
      FROM pg_constraint c
      JOIN pg_class t      ON t.oid = c.conrelid
      JOIN pg_namespace n  ON n.oid = t.relnamespace
      JOIN pg_class rt     ON rt.oid = c.confrelid
      JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = 'public'
        AND t.relname = $1
        AND rt.relname = 'users'
        AND c.contype = 'f'
      ORDER BY k.ord
      LIMIT 1
    ) msg_user_fk ON true
    LEFT JOIN LATERAL (
      SELECT src.attname AS col, src.atttypid::regtype::text AS typ
      FROM pg_constraint c
      JOIN pg_class t      ON t.oid = c.conrelid
      JOIN pg_namespace n  ON n.oid = t.relnamespace
      JOIN pg_class rt     ON rt.oid = c.confrelid
      JOIN LATERAL unnest(c.conkey) WITH ORDINALITY src_key(attnum, ord) ON true
      JOIN LATERAL unnest(c.confkey) WITH ORDINALITY ref_key(attnum, ord) ON ref_key.ord = src_key.ord
      JOIN pg_attribute src ON src.attrelid = t.oid AND src.attnum = src_key.attnum
      JOIN pg_attribute ref ON ref.attrelid = rt.oid AND ref.attnum = ref_key.attnum
      WHERE n.nspname = 'public'
        AND t.relname = $1
        AND rt.relname = 'channel_members'
        AND c.contype = 'f'
        AND $2::text IS NOT NULL
        AND ref.attname = $2
      ORDER BY src_key.ord
      LIMIT 1
    ) msg_member_chan_fk ON true
    LEFT JOIN LATERAL (
      SELECT src.attname AS col, src.atttypid::regtype::text AS typ
      FROM pg_constraint c
      JOIN pg_class t      ON t.oid = c.conrelid
      JOIN pg_namespace n  ON n.oid = t.relnamespace
      JOIN pg_class rt     ON rt.oid = c.confrelid
      JOIN LATERAL unnest(c.conkey) WITH ORDINALITY src_key(attnum, ord) ON true
      JOIN LATERAL unnest(c.confkey) WITH ORDINALITY ref_key(attnum, ord) ON ref_key.ord = src_key.ord
      JOIN pg_attribute src ON src.attrelid = t.oid AND src.attnum = src_key.attnum
      JOIN pg_attribute ref ON ref.attrelid = rt.oid AND ref.attnum = ref_key.attnum
      WHERE n.nspname = 'public'
        AND t.relname = $1
        AND rt.relname = 'channel_members'
        AND c.contype = 'f'
        AND $3::text IS NOT NULL
        AND ref.attname = $3
      ORDER BY src_key.ord
      LIMIT 1
    ) msg_member_user_fk ON true;
  `, [name, membershipChannelsFk, membershipUsersFk]);

    const row = rows[0] || {};
    return {
        messages_channels_fk: row.messages_channels_fk || null,
        messages_channels_fk_type: row.messages_channels_fk_type || null,
        messages_users_fk: row.messages_users_fk || null,
        messages_users_fk_type: row.messages_users_fk_type || null
    };
}

async function loadChannelMembershipKeys(client) {
    const { rows } = await client.query(`
    SELECT
      COALESCE(ch_pk.col,  'channel_id') AS channels_pk,
      COALESCE(ch_pk.typ,  'text')       AS channels_pk_type,
      COALESCE(u_pk.col,   'username')   AS users_pk,
      COALESCE(u_pk.typ,   'text')       AS users_pk_type,
      COALESCE(mem_fk.col, 'channel_id') AS membership_channels_fk,
      COALESCE(mem_fk.typ, 'text')       AS membership_channels_fk_type,
      COALESCE(mem_user_fk.col, 'username') AS membership_users_fk,
      COALESCE(mem_user_fk.typ, 'text')     AS membership_users_fk_type
    FROM (SELECT 1) base
    LEFT JOIN LATERAL (
      SELECT a.attname AS col, a.atttypid::regtype::text AS typ
      FROM pg_constraint c
      JOIN pg_class t      ON t.oid = c.conrelid
      JOIN pg_namespace n  ON n.oid = t.relnamespace
      JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = 'public' AND t.relname = 'channels' AND c.contype = 'p'
      ORDER BY k.ord
      LIMIT 1
    ) ch_pk ON true
    LEFT JOIN LATERAL (
      SELECT a.attname AS col, a.atttypid::regtype::text AS typ
      FROM pg_constraint c
      JOIN pg_class t      ON t.oid = c.conrelid
      JOIN pg_namespace n  ON n.oid = t.relnamespace
      JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = 'public' AND t.relname = 'users' AND c.contype = 'p'
      ORDER BY k.ord
      LIMIT 1
    ) u_pk ON true
    LEFT JOIN LATERAL (
      SELECT a.attname AS col, a.atttypid::regtype::text AS typ
      FROM pg_constraint c
      JOIN pg_class t      ON t.oid = c.conrelid
      JOIN pg_namespace n  ON n.oid = t.relnamespace
      JOIN pg_class rt     ON rt.oid = c.confrelid
      JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = 'public'
        AND t.relname = 'channel_members'
        AND rt.relname = 'channels'
        AND c.contype = 'f'
      ORDER BY k.ord
      LIMIT 1
    ) mem_fk ON true
    LEFT JOIN LATERAL (
      SELECT a.attname AS col, a.atttypid::regtype::text AS typ
      FROM pg_constraint c
      JOIN pg_class t      ON t.oid = c.conrelid
      JOIN pg_namespace n  ON n.oid = t.relnamespace
      JOIN pg_class rt     ON rt.oid = c.confrelid
      JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = 'public'
        AND t.relname = 'channel_members'
        AND rt.relname = 'users'
        AND c.contype = 'f'
      ORDER BY k.ord
      LIMIT 1
    ) mem_user_fk ON true;
  `);

    return rows[0]; // always exactly 1 row
}


module.exports = {
    DEFAULT_MESSAGES_TABLE,
    MESSAGES_TABLE_ALIASES,
    SQL_CONTRACT,
    DEFAULT_SQL,
    SOLUTION_SQL,
    PGDATABASES_MAPPING,
    parseChannelId,
    loadChannelMembershipSchemaInfo,
    loadChatSchemaInfo
};
