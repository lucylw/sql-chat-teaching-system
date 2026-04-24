// ----------------------------
// Elements
// ----------------------------
const el = (id) => document.getElementById(id);

const loginPanel = el("loginPanel");
const chatPanel = el("chatPanel");

const usernameEl = el("username");   // group DB login username (grp10)
const passwordEl = el("password");   // group DB login password
const loginBtn = el("loginBtn");
const loginMsg = el("loginMsg");

const logoutBtn = el("logoutBtn");
const connPill = el("connPill");

const userAuthPanel = el("userAuthPanel");
const chatUI = el("chatUI");
const mainChatUI = el("mainChatUI");
const chatUsernameEl = el("chatUsername");
const chatPasswordEl = el("chatPassword");
const registerBtn = el("registerBtn");
const userLoginBtn = el("userLoginBtn");
const userAuthMsg = el("userAuthMsg");

const channelsEl = el("channels");
const channelSearchEl = el("channelSearch");
const channelMsg = el("channelMsg");
const activeChannelLabel = el("activeChannelLabel");
const activeChannelSub = el("activeChannelSub");
const chatEmptyState = el("chatEmptyState");
const emptyRefreshBtn = el("emptyRefreshBtn");
const emptyCreateBtn = el("emptyCreateBtn");

const composerInput = el("composerInput");
const sendBtn = el("sendBtn");
const postMsg = el("postMsg");
const messagesEl = el("messages");
const messagesEmptyState = el("messagesEmptyState");

const userPill = el("userPill");
const userLabel = el("userLabel");
const userAvatar = el("userAvatar");
const brandTitleEl = el("brandTitle");
const brandSubEl = el("brandSub");
const sqlTabTip = el("sqlTabTip");
const openSidebarBtn = el("openSidebarBtn");

const sidebar = el("sidebar");
const chatMain = el("chatMain");
const sidebarOverlay = el("sidebarOverlay");

const blockChatContext = (e) => {
  if (document.documentElement.classList.contains("sql-mode")) return;
  e.preventDefault();
};

chatPanel?.addEventListener("contextmenu", blockChatContext);

// Member modal elements (present in index.html)
const memberModal = el("memberModal");
const memberModalOverlay = el("memberModalOverlay");
const memberModalList = el("memberModalList");
const memberModalTitle = el("memberModalTitle");
const memberModalClose = el("memberModalClose");
const memberModalMsg = el("memberModalMsg");

const toastEl = el("toast");
const confettiEl = el("confetti");

const createChannelBtn = el("createChannelBtn");
const newChannelName = el("newChannelName");
const newChannelDescription = el("newChannelDescription");
const createChannelPostBtn = el("postNewChannelBtn");
const newChannelMsg = el("newChannelMsg");


// New channel modal elements (present in index.html)
const newChannelModal = el("newChannelModal");
const newChannelModalOverlay = el("newChannelModalOverlay");
const newChannelModalList = el("newChannelModalList");
const newChannelModalTitle = el("newChannelModalTitle");
const newChannelModalClose = el("newChannelModalClose");

// Connection menu elements (present in index.html)
const connMenu = el("connMenu");
const connMenuUserLogout = el("connMenuUserLogout");
const connMenuDbLogout = el("connMenuDbLogout");


// ----------------------------
// SQL Lab
// ----------------------------
let tabChatBtn = null;
let tabSqlBtn = null;
let sqlPanel = null;
let sqlLabList = null;
let sqlSaveBtn = null;
let sqlResetBtn = null;
let sqlResetStatusBtn = null;
let schemaTestBtn = null;
let sqlLabMsg = null;
let schemaMsg = null;
let sqlProgressText = null;
let sqlProgressBar = null;
let sqlDirtyStateEl = null;
let sqlLastSavedEl = null;
let confettiShown = false;
let sqlSubmissionInFlight = false;
let progressReportTimer = null;
let lastProgressSignature = null;
let _printGuardReady = false;
// keep the last templates we loaded from the server so we can avoid
// saving / reloading when nothing changed (prevents unnecessary re-runs)
let _lastSqlTemplates = null;
const sqlEditors = new Map();
const MAX_SQL_LEN = 600; // to make sure students don't go too long.
const SQL_LEN_WARN = Math.floor(MAX_SQL_LEN * 0.9);

function toWordMap(value) {
  const out = {};
  if (!value) return out;
  if (typeof value === "string") {
    value.split(/\s+/).forEach((w) => {
      const k = String(w || "").trim().toLowerCase();
      if (k) out[k] = true;
    });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((w) => {
      const k = String(w || "").trim().toLowerCase();
      if (k) out[k] = true;
    });
    return out;
  }
  if (typeof value === "object") {
    Object.keys(value).forEach((k) => {
      const key = String(k || "").trim().toLowerCase();
      if (key) out[key] = true;
    });
  }
  return out;
}

function getSqlModeOptions() {
  if (!window.CodeMirror || typeof window.CodeMirror.resolveMode !== "function") {
    return "text/x-sql";
  }
  if (getSqlModeOptions._cached) return getSqlModeOptions._cached;
  const resolved = window.CodeMirror.resolveMode("text/x-sql") || {};
  const keywords = toWordMap(resolved.keywords);
  keywords.with = true; // ensure CTE keyword is highlighted
  const builtin = toWordMap(resolved.builtin);
  const atoms = toWordMap(resolved.atoms);
  const mode = { ...resolved, name: "sql", keywords, builtin, atoms };
  getSqlModeOptions._cached = mode;
  return mode;
}

const SQL_LAB_GROUPS = [
  { id: "auth", title: "Auth & Users" },
  { id: "channels", title: "Channels & Membership" },
  { id: "messages", title: "Messages" }
];

const SQL_LAB_ITEMS = [
  {
    key: "user_login",
    status: null,
    title: "Log in button",
    group: "auth",
    description: `
      <div><b>What happens:</b> user clicks <code>Log in</code></div>
      <div><b>Parameters:</b> <code>$1</code> = <b>username</b></div>
      <div class="mutedSmall" style="margin-top: 8px;">
        Note: Users created directly in the DB with a plain‑text password won’t be able to log in here.
        This app hashes passwords before sending them, so sign up users in the chat app for stored passwords to match.
      </div>
    `,
    required: "SELECT password FROM users WHERE username = $1; -- if your DB has a different schema you must match this to your schema."
  },
  {
    key: "user_register",
    status: null,
    title: "Sign up button",
    group: "auth",
    description: `
      <div><b>What happens:</b> user clicks <code>Register</code></div>
      <div><b>Parameters:</b> <code>$1</code> = <b>username</b>, <code>$2</code> = <b>password_hash</b></div>
      <div><b>Must do:</b> INSERT a new row into <code>users</code></div>
      <div><b>Tip:</b> enforce uniqueness on <b>username</b> in your schema</div>
    `,
  },
  {
    key: "update_password",
    status: null,
    title: "Reset password",
    group: "auth",
    description: `
      <div><b>What happens:</b> user clicks <code>Reset password</code></div>
      <div><b>Parameters:</b> <code>$1</code> = <b>username</b>, <code>$2</code> = <b>new_password_hash</b>,  <code>$3</code> = <b>current_password_hash</b></div>
      <div><b>Must do:</b> UPDATE the user’s password in <code>users</code></div>
    `,
  },
  {
    key: "channels_list",
    status: null,
    title: "Display channels + membership",
    group: "channels",
    description: `
      <div><b>What happens:</b> Loads the sidebar channel list, indicates your current join/leave status for each channel, and provides Join/Leave buttons.</div>
      <div><b>Parameters:</b> <code>$1</code> = <b>username</b></div>
    `,
    textAreaHeight: "280px"
  },
  {
    key: "member_check",
    status: null,
    title: "Check membership before loading messages",
    group: "channels",
    description: `
      <div><b>What happens:</b> The app checks whether you’re allowed to view the channel before loading its messages.</div>
      <div><b>Parameters:</b> <code>$1</code> = <b>username</b>, <code>$2</code> = <b>channel_pk</b></div>
      <div><b>Must return:</b> at least one row only if the user is a member (no rows otherwise)</div>
    `,
  },
  {
    key: "channel_join",
    status: null,
    title: "Join channel",
    group: "channels",
    description: `
      <div><b>What happens:</b> user clicks <code>Join</code></div>
      <div><b>Parameters:</b> <code>$1</code> = <b>username</b>, <code>$2</code> = <b>channel_pk</b></div>
      <div><b>Must do:</b> INSERT a membership row</div>
      <div><b>Required:</b> use <b>ON CONFLICT DO NOTHING</b> to prevent duplicates</div>
    `,
  },
  {
    key: "channel_leave",
    status: null,
    title: "Leave channel",
    group: "channels",
    description: `
      <div><b>What happens:</b> user clicks <code>Leave</code></div>
      <div><b>Parameters:</b> <code>$1</code> = <b>username</b>, <code>$2</code> = <b>channel_pk</b></div>
      <div><b>Must do:</b> DELETE the membership row</div>
    `,
  },
  {
    key: "messages_list",
    status: null,
    title: "Display messages for a channel",
    group: "messages",
    description: `
      <div><b>What happens:</b> load messages when a channel is opened</div>
      <div><b>Parameters:</b> <code>$1</code> = <b>channel_pk</b></div>
      <div><b>Ordering:</b> newest at the bottom</div>
      <div><b>Limit:</b> ~50 rows</div>
    `,
    textAreaHeight: "140px"
  },
  {
    key: "message_post",
    status: null,
    title: "Send button: Post message",
    group: "messages",
    description: `
      <div><b>What happens:</b> user clicks <code>Send</code></div>
      <div><b>Parameters:</b> <code>$1</code> = <b>username</b>, <code>$2</code> = <b>channel_pk</b>, <code>$3</code> = <b>body</b></div>
      <div><b>Must do:</b> insert a message</div>
    `,
    // <div><b>Must return:</b> inserted <b>message id</b></div>
  },
  {
    key: "channel_create",
    status: null,
    title: "Create channel",
    group: "channels",
    description: `
      <div><b>What happens:</b> user creates a new channel</div>
      <div><b>Parameters:</b> <code>$1</code> = <b>name</b>, <code>$2</code> = <b>description</b></div>
    `,
    // <div><b>Must return:</b> new <b>channel_pk</b></div>
  },
  {
    key: "channel_members_list",
    status: null,
    title: "Channel members list",
    group: "channels",
    description: `
      <div><b>What happens:</b> Clicking the “x members” button opens the modal and lists member names for that channel.</div>
      <div><b>Parameters:</b> <code>$1</code> = <b>channel_pk</b></div>
    `
  }
];

let sqlContract = null;

function applySqlContract(contract) {
  if (!contract || typeof contract !== "object") return;
  sqlContract = contract;
  for (const item of SQL_LAB_ITEMS) {
    const entry = contract[item.key];
    if (!entry) continue;
    if (entry.expectedCols) item.expectedCols = entry.expectedCols;
    if (entry.firstWords) item.firstWords = entry.firstWords;
  }
}

function setSidebarVisible(v) {
  sidebar.classList.toggle("hidden", !v); // hidden when v=false
  if (!v) {
    sidebar.classList.remove("open"); // close drawer
    if (sidebarOverlay) sidebarOverlay.classList.add("hidden");
  }
  chatMain.classList.toggle("hidden", !v);
  if (!v) chatMain.classList.remove("open"); // close drawer
}

function openSidebarDrawer() {
  sidebar.classList.add("open");
  if (sidebarOverlay) sidebarOverlay.classList.remove("hidden");
}

function closeSidebarDrawer() {
  sidebar.classList.remove("open");
  if (sidebarOverlay) sidebarOverlay.classList.add("hidden");
}


function ensureSqlLabUI() {
  if (sqlPanel && sqlLabList) return;

  tabChatBtn = el("tabChat");
  tabSqlBtn = el("tabSql");
  sqlPanel = el("panelSql");
  sqlLabList = el("sqlLabList");
  sqlSaveBtn = el("sqlSaveBtn");
  sqlResetBtn = el("sqlResetBtn");
  sqlResetStatusBtn = el("sqlResetStatusBtn");
  schemaTestBtn = el("schemaTestBtn");
  sqlLabMsg = el("sqlLabMsg");
  schemaMsg = el("schemaMsg");
  sqlProgressText = el("sqlProgressText");
  sqlProgressBar = el("sqlProgressBar");
  sqlDirtyStateEl = el("sqlDirtyState");
  sqlLastSavedEl = el("sqlLastSaved");
  installPrintGuard();
  updateSqlLastSaved(getSqlLastSaved());
  setSqlDirtyState(false);

  const blockSqlCopy = (e) => {
    if (!document.documentElement.classList.contains("sql-mode")) return;
    const target = e.target instanceof Element ? e.target : null;
    const inEditor = target && (target.closest("textarea.sqlInput") || target.closest(".CodeMirror"));
    if (inEditor) return;
    e.preventDefault();
  };

  sqlPanel.addEventListener("copy", blockSqlCopy);
  sqlPanel.addEventListener("cut", blockSqlCopy);
  sqlPanel.addEventListener("contextmenu", blockSqlCopy);

  // Events
  tabChatBtn.addEventListener("click", async () => {
    if (tabChatBtn.classList.contains("active")) return;
    hideSqlTabTip();
    await setTab("chat");
  });
  tabSqlBtn.addEventListener("click", async () => {
    if (tabSqlBtn.classList.contains("active")) return;
    hideSqlTabTip();
    await setTab("sql");
  });

  sqlSaveBtn.addEventListener("click", async () => {
    setMsg(sqlLabMsg, "");
    sqlSaveBtn.disabled = true;
    try {
      const didSave = await saveSqlTemplatesIfChanged();
      setMsg(sqlLabMsg, didSave ? "SQL saved." : "No unsaved SQL changes.", true);
    } catch (e) {
      setMsg(sqlLabMsg, e.message || String(e), false);
      updateSqlDirtyState();
    }
  });

  sqlResetBtn.addEventListener("click", async () => {
    setMsg(sqlLabMsg, "");
    try {
      await api("/api/sql_templates/reset", "POST");
      clearSqlDraftState();
      resetSqlEditorHeights();
      await loadSqlTemplates();
      setMsg(sqlLabMsg, "Reset to SQL defaults.", true);
      setSqlLastSaved(new Date().toISOString());
    } catch (e) {
      setMsg(sqlLabMsg, e.message, false);
    }
  });

  sqlResetStatusBtn.addEventListener("click", () => {
    setMsg(sqlLabMsg, "");
    resetSqlStatus();
    setMsg(sqlLabMsg, "SQL status cleared.", true);
  });

  schemaTestBtn.addEventListener("click", async () => {
    setMsg(schemaMsg, "");
    try {
      await api("/api/test_schema", "GET");
      setMsg(schemaMsg, "Database schema looks good.", true);
    } catch (e) {
      setMsg(schemaMsg, e.message, false);
    }
  });

}

function installPrintGuard() {
  if (_printGuardReady) return;
  _printGuardReady = true;

  const warn = () => toast("Printing disabled in SQL Lab");
  const isSqlMode = () => document.documentElement.classList.contains("sql-mode");

  const origPrint = window.print;
  if (typeof origPrint === "function" && !origPrint._sqlGuarded) {
    const wrapped = function () {
      if (isSqlMode()) {
        warn();
        return;
      }
      return origPrint();
    };
    wrapped._sqlGuarded = true;
    window.print = wrapped;
  }

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (String(e.key || "").toLowerCase() !== "p") return;
    if (!isSqlMode()) return;
    e.preventDefault();
    warn();
  });

  window.addEventListener("beforeprint", () => {
    if (isSqlMode()) warn();
  });
}

function setTabsVisible(visible) {
  ensureSqlLabUI();
  if (!visible) {
    [document.documentElement, document.body].forEach((el) => el.classList.remove("sql-mode"));
    tabChatBtn.classList.add("active");
    tabSqlBtn.classList.remove("active");
    sqlPanel.classList.add("hidden");
    // restore chat panels to default state
    if (state.chatUsername) showMainUI(state.chatUsername);
    else showUserAuth();
  }
}

let _pollResume = false;

async function setTab(which) {

  ensureSqlLabUI();

  const isSql = which === "sql";
  const leavingSql = !isSql && sqlPanel && !sqlPanel.classList.contains("hidden");

  if (leavingSql) {
    try {
      setMsg(sqlLabMsg, "");
      const didSave = await saveSqlTemplatesIfChanged();
      if (didSave) toast("SQL saved");
    } catch (e) {
      toast("SQL save failed: " + (e.message || e));
      setMsg(sqlLabMsg, e.message || String(e), false);
      updateSqlDirtyState();
      return;
    }
  }


  [document.documentElement, document.body].forEach((el) => el.classList.toggle("sql-mode", isSql));

  tabChatBtn.classList.toggle("active", !isSql);
  tabSqlBtn.classList.toggle("active", isSql);

  if (isSql) {
    // pause polling while in SQL lab
    _pollResume = !!state.pollTimer;
    stopPolling();
    setSidebarVisible(false);
    sqlPanel.classList.remove("hidden");
    userAuthPanel.classList.add("hidden");
    mainChatUI.classList.add("hidden");
    chatUI.classList.add("hidden");
    hideSqlTabTip();

    await loadSqlTemplates();
  } else {
    sqlPanel.classList.add("hidden");
    setSidebarVisible(true);
    // restore whichever chat sub-panel is appropriate
    if (state.chatUsername) {
      showMainUI(state.chatUsername);
      // Refresh channels/messages so the chat reflects any SQL/template changes
      try {
        await loadChannels();
        if (state.activeChannelId) {
          await loadMessages(state.activeChannelId, { silent: true });
          // Update the last-seen timestamp for the active channel to reflect
          // that the user returned to the Chat tab now. This updates the
          // channels list UI with the new "returned at" time.
          state.lastSeenByChannel[String(state.activeChannelId)] = new Date().toISOString();
          saveLocal("lastSeenByChannel", state.lastSeenByChannel);
          renderChannels(state.channels);
        }
      } catch (e) {
        // non-fatal: show a small toast and continue
        console.error('Failed to refresh chat data on tab switch:', e);
        setMsg(postMsg, 'Failed to refresh chat data.', false);
      }
    } else showUserAuth();

    if (_pollResume && state.activeChannelId) startPolling();
  }
}

function renderSqlLab(templates) {
  ensureSqlLabUI();
  sqlEditors.forEach((editor) => {
    if (editor && typeof editor.toTextArea === "function") editor.toTextArea();
  });
  sqlEditors.clear();
  sqlLabList.innerHTML = "";

  let globalIndex = 0;
  for (const group of SQL_LAB_GROUPS) {
    const items = SQL_LAB_ITEMS.filter((i) => i.group === group.id);
    if (!items.length) continue;

    const section = document.createElement("div");
    section.className = "sqlSection";
    const sectionTitle = document.createElement("div");
    sectionTitle.className = "sqlSectionTitle";
    sectionTitle.textContent = group.title;
    section.appendChild(sectionTitle);
    sqlLabList.appendChild(section);

    for (const item of items) {
      const indexLabel = globalIndex;
      globalIndex += 1;

      const outer = document.createElement("div");
      outer.className = "sqlItem";
      outer.dataset.sqlkey = item.key;

      const title = document.createElement("div");
      title.className = "sqlTitle";
      title.textContent = String(indexLabel) + ") " + item.title;

      const queryStatus = document.createElement("span");
      queryStatus.className = "queryStatus";

      if (item.status) queryStatus.classList.add("is-pass");
      else if (item.status === false) queryStatus.classList.add("is-fail");

      // console.log("STATUS", item.status, item.title);
      queryStatus.dataset.tip = item.status ? "Query runs." :
        item.status === false ? "Try again." :
          "Not tested";

      // if (item.key === "user_login" && item.status === false) {
      //   item.status = userAuthMsg.textContent ? userAuthMsg.textContent : "Try again.";
      // }

      const desc = document.createElement("div");
      desc.className = "sqlDesc";
      // desc.textContent = item.description || "";
      desc.innerHTML = item.description || "";

      const req = document.createElement("pre");
      req.className = "sqlRequired";
      req.textContent = item.required;

      const ta = document.createElement("textarea");
      ta.className = "sqlInput";
      ta.dataset.sqlkey = item.key;
      ta.maxLength = MAX_SQL_LEN;
      const s = String(templates[item.key] ?? "").trimEnd();
      ta.value = s ? (s.endsWith(";") ? s : s + ";") : "";
      // for a given text area color keywords, SELECT, INSERT, ...

      const headerRow = document.createElement("div");
      headerRow.className = "sqlItemHeader";
      headerRow.appendChild(title);
      headerRow.appendChild(queryStatus);
      outer.appendChild(headerRow);

      outer.appendChild(desc);
      if (item.expectedCols && item.expectedCols.length) {
        const chips = document.createElement("div");
        chips.className = "sqlChips";

        const label = document.createElement("div");
        label.className = "sqlChipLabel";
        label.textContent = "Expected columns";

        const row = document.createElement("div");
        row.className = "sqlChipRow";
        for (const col of item.expectedCols) {
          const chip = document.createElement("span");
          chip.className = "sqlChip";
          const name = (col && typeof col === "object") ? col.name : col;
          const type = (col && typeof col === "object") ? col.type : null;
          if (type) {
            const nameEl = document.createElement("span");
            nameEl.className = "sqlChipName";
            nameEl.textContent = name;
            const typeEl = document.createElement("span");
            typeEl.className = "sqlChipType";
            typeEl.textContent = type;
            chip.appendChild(nameEl);
            chip.appendChild(typeEl);
          } else {
            chip.textContent = name;
          }
          row.appendChild(chip);
        }

        chips.appendChild(label);
        chips.appendChild(row);
        outer.appendChild(chips);
      }
      if (item.required) outer.appendChild(req);
      const meta = sqlMeta[item.key] || {};
      if (meta.lastInput) {
        const metaBlock = document.createElement("div");
        metaBlock.className = "sqlMeta";
        const metaLabel = document.createElement("div");
        metaLabel.className = "sqlMetaLabel";
        metaLabel.textContent = "Last input";
        const metaCode = document.createElement("pre");
        metaCode.className = "sqlMetaCode";
        const inputArr = Array.isArray(meta.lastInput) ? meta.lastInput : [meta.lastInput];
        metaCode.textContent = formatSqlInputs(inputArr);
        metaBlock.appendChild(metaLabel);
        metaBlock.appendChild(metaCode);
        outer.appendChild(metaBlock);
      }
      if (meta.lastError) {
        const errBlock = document.createElement("div");
        errBlock.className = "sqlMeta sqlMetaError";
        const errLabel = document.createElement("div");
        errLabel.className = "sqlMetaLabel";
        errLabel.textContent = "Last error";
        const errText = document.createElement("div");
        errText.className = "sqlMetaText";
        errText.textContent = meta.lastError;
        errBlock.appendChild(errLabel);
        errBlock.appendChild(errText);
        outer.appendChild(errBlock);
      }
      if (meta.lastTip) {
        const tipBlock = document.createElement("div");
        tipBlock.className = "sqlMeta sqlMetaHint";
        const tipLabel = document.createElement("div");
        tipLabel.className = "sqlMetaLabel";
        tipLabel.textContent = "Tip";
        const tipText = document.createElement("div");
        tipText.className = "sqlMetaText";
        tipText.textContent = meta.lastTip;
        tipBlock.appendChild(tipLabel);
        tipBlock.appendChild(tipText);
        outer.appendChild(tipBlock);
      }
      if (item.textAreaHeight) ta.style.height = item.textAreaHeight;
      outer.appendChild(ta);
      sqlLabList.appendChild(outer);

      if (window.CodeMirror) {
        const editor = window.CodeMirror.fromTextArea(ta, {
          mode: getSqlModeOptions(),
          lineNumbers: false,
          lineWrapping: true,
          viewportMargin: Infinity
        });
        editor.setValue(ta.value || "");
        editor.on("beforeChange", (cm, change) => {
          if (change.origin === "setValue") return;
          const currentLen = cm.getValue().length;
          const removed = cm.getRange(change.from, change.to);
          const inserted = change.text ? change.text.join("\n") : "";
          const nextLen = currentLen - removed.length + inserted.length;

          const showMaxToast = () => {
            const now = Date.now();
            if (!cm._maxToastAt || now - cm._maxToastAt > 1200) {
              toast(`Max SQL length is ${MAX_SQL_LEN} characters.`);
              cm._maxToastAt = now;
            }
          };

          const showWarnToast = () => {
            const now = Date.now();
            if (!cm._warnToastAt || now - cm._warnToastAt > 2000) {
              toast(`Approaching max SQL length (${MAX_SQL_LEN}).`);
              cm._warnToastAt = now;
            }
          };

          if (currentLen > MAX_SQL_LEN && nextLen > currentLen) {
            change.cancel();
            showMaxToast();
            return;
          }

          if (nextLen > MAX_SQL_LEN) {
            const allowed = MAX_SQL_LEN - (currentLen - removed.length);
            if (allowed <= 0) {
              change.cancel();
              showMaxToast();
              return;
            }
            const truncated = inserted.slice(0, allowed);
            change.update(change.from, change.to, truncated.split("\n"));
            showMaxToast();
            return;
          }

          if (nextLen >= SQL_LEN_WARN && nextLen > currentLen) {
            showWarnToast();
          }
        });
        const storedHeight = getSqlEditorHeight(item.key);
        const initialHeight = storedHeight ? `${storedHeight}px` : (item.textAreaHeight || "100px");
        editor.setSize(null, initialHeight);
        editor.on("change", () => {
          updateSqlDirtyState();
        });
        sqlEditors.set(item.key, editor);
        requestAnimationFrame(() => editor.refresh());

        const resizer = document.createElement("div");
        resizer.className = "sqlResizeHandle";
        resizer.title = "Drag to resize";
        outer.appendChild(resizer);

        let startY = 0;
        let startH = 0;

        const onMove = (e) => {
          const dy = (e.touches?.[0]?.clientY ?? e.clientY) - startY;
          const next = Math.max(80, startH + dy);
          editor.setSize(null, `${next}px`);
        };

        const onUp = () => {
          const height = editor.getWrapperElement().getBoundingClientRect().height;
          setSqlEditorHeight(item.key, height);
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          window.removeEventListener("touchmove", onMove);
          window.removeEventListener("touchend", onUp);
        };

        const onDown = (e) => {
          e.preventDefault();
          startY = e.touches?.[0]?.clientY ?? e.clientY;
          startH = editor.getWrapperElement().getBoundingClientRect().height;
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
          window.addEventListener("touchmove", onMove, { passive: false });
          window.addEventListener("touchend", onUp);
        };

        resizer.addEventListener("mousedown", onDown);
        resizer.addEventListener("touchstart", onDown, { passive: false });
      } else {
        ta.addEventListener("input", () => {
          updateSqlDirtyState();
        });
      }

      // TODO ADD green if correct query
    }
  }

  updateSqlProgress();
}

function updateSqlProgress() {
  if (!sqlProgressText || !sqlProgressBar) return;
  const total = SQL_LAB_ITEMS.length;
  const passed = SQL_LAB_ITEMS.filter((i) => i.status === true).length;
  const pct = total ? Math.round((passed / total) * 100) : 0;
  sqlProgressText.textContent = `${passed}/${total} passing`;
  sqlProgressBar.style.width = `${pct}%`;

  if (total > 0 && passed === total) {
    if (!confettiShown) {
      confettiShown = true;
      launchConfetti();
      submitSqlSnapshot();
    }
  } else {
    confettiShown = false;
  }
}

function queueProgressReport() {
  if (!state.isDbConnected) return;
  if (progressReportTimer) clearTimeout(progressReportTimer);
  progressReportTimer = setTimeout(async () => {
    progressReportTimer = null;
    const total = SQL_LAB_ITEMS.length;
    const passedKeys = SQL_LAB_ITEMS.filter((i) => i.status === true).map((i) => i.key);
    const signature = JSON.stringify({ total, passedKeys });
    if (signature === lastProgressSignature) return;
    lastProgressSignature = signature;
    try {
      await api("/api/progress", "POST", {
        passedCount: passedKeys.length,
        totalCount: total,
        passedKeys
      });
    } catch {
      // best-effort; ignore logging failures
    }
  }, 600);
}

function getSqlItemStatus(key) {
  return SQL_LAB_ITEMS.find((i) => i.key === key)?.status;
}

function updateSqlItemUI(key) {
  if (!sqlLabList || !sqlPanel || sqlPanel.classList.contains("hidden")) return;
  const itemEl = sqlLabList.querySelector(`.sqlItem[data-sqlkey="${key}"]`);
  if (!itemEl) return;

  const statusEl = itemEl.querySelector(".queryStatus");
  if (statusEl) {
    statusEl.classList.remove("is-pass", "is-fail");
    const status = getSqlItemStatus(key);
    if (status === true) statusEl.classList.add("is-pass");
    else if (status === false) statusEl.classList.add("is-fail");
    statusEl.dataset.tip = status ? "Query runs." :
      status === false ? "Try again." :
        "Not tested";
  }

  itemEl.querySelectorAll(".sqlMeta").forEach((el) => el.remove());
  const ta = itemEl.querySelector("textarea.sqlInput");
  if (!ta) return;
  const meta = sqlMeta[key] || {};
  if (meta.lastInput) {
    const metaBlock = document.createElement("div");
    metaBlock.className = "sqlMeta";
    const metaLabel = document.createElement("div");
    metaLabel.className = "sqlMetaLabel";
    metaLabel.textContent = "Last input";
    const metaCode = document.createElement("pre");
    metaCode.className = "sqlMetaCode";
    const inputArr = Array.isArray(meta.lastInput) ? meta.lastInput : [meta.lastInput];
    metaCode.textContent = formatSqlInputs(inputArr);
    metaBlock.appendChild(metaLabel);
    metaBlock.appendChild(metaCode);
    itemEl.insertBefore(metaBlock, ta);
  }
  if (meta.lastError) {
    const errBlock = document.createElement("div");
    errBlock.className = "sqlMeta sqlMetaError";
    const errLabel = document.createElement("div");
    errLabel.className = "sqlMetaLabel";
    errLabel.textContent = "Last error";
    const errText = document.createElement("div");
    errText.className = "sqlMetaText";
    errText.textContent = meta.lastError;
    errBlock.appendChild(errLabel);
    errBlock.appendChild(errText);
    itemEl.insertBefore(errBlock, ta);
  }
  if (meta.lastTip) {
    const tipBlock = document.createElement("div");
    tipBlock.className = "sqlMeta sqlMetaHint";
    const tipLabel = document.createElement("div");
    tipLabel.className = "sqlMetaLabel";
    tipLabel.textContent = "Tip";
    const tipText = document.createElement("div");
    tipText.className = "sqlMetaText";
    tipText.textContent = meta.lastTip;
    tipBlock.appendChild(tipLabel);
    tipBlock.appendChild(tipText);
    itemEl.insertBefore(tipBlock, ta);
  }
}

function collectSqlLabInputs() {
  ensureSqlLabUI();
  const out = {};
  const areas = sqlLabList.querySelectorAll("textarea[data-sqlkey]");
  for (const ta of areas) {
    const key = ta.dataset.sqlkey;
    const editor = sqlEditors.get(key);
    out[key] = editor ? editor.getValue() : ta.value;
  }
  return out;
}

async function loadSqlTemplates() {
  ensureSqlLabUI();
  setMsg(sqlLabMsg, "");
  const data = await api("/api/sql_templates");
  applySqlContract(data.contract);
  // remember what we loaded so we can detect real edits later
  const serverTemplates = normalizeSqlTemplates(data.templates || {});
  _lastSqlTemplates = serverTemplates;
  const defaultTemplates = buildDefaultSqlTemplates(data.contract);
  const draftState = loadSqlDraftState();
  const draftTemplates = normalizeSqlTemplates(draftState?.templates || {});
  const draftBaseline = normalizeSqlTemplates(draftState?.baseline || {});
  const canRestoreDraft = Boolean(
    draftState &&
    templatesDiffer(draftTemplates, serverTemplates) &&
    (!templatesDiffer(draftBaseline, serverTemplates) || !templatesDiffer(serverTemplates, defaultTemplates))
  );
  renderSqlLab(canRestoreDraft ? { ...serverTemplates, ...draftTemplates } : serverTemplates);
  if (canRestoreDraft) {
    setSqlDirtyState(true);
    setMsg(sqlLabMsg, "Restored local draft. Save SQL to sync it to the server.", true);
  } else if (draftState && templatesDiffer(draftTemplates, serverTemplates)) {
    setSqlDirtyState(false);
    setMsg(sqlLabMsg, "Server-saved SQL changed, so the local draft was not restored automatically.", false);
  } else {
    clearSqlDraftState();
    setSqlDirtyState(false);
  }
}



function normalizeSqlTemplateValue(value) {
  const trimmed = String(value ?? "").trimEnd();
  return trimmed.endsWith(";") ? trimmed.slice(0, -1).trimEnd() : trimmed;
}

function normalizeSqlTemplates(obj) {
  // ignore optional trailing semicolons so the dirty state matches server storage
  return Object.fromEntries(
    Object.entries(obj || {}).map(([k, v]) => [k, normalizeSqlTemplateValue(v)])
  );
}

function buildDefaultSqlTemplates(contract) {
  const out = {};
  for (const [key, entry] of Object.entries(contract || {})) {
    const words = Array.isArray(entry?.firstWords) ? entry.firstWords : [entry?.firstWords];
    const first = String(words.find(Boolean) || "select").trim().toUpperCase();
    out[key] = `${first} ''`;
  }
  return normalizeSqlTemplates(out);
}

function templatesDiffer(left, right) {
  const a = normalizeSqlTemplates(left);
  const b = normalizeSqlTemplates(right);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (normalizeSqlTemplateValue(a[key]) !== normalizeSqlTemplateValue(b[key])) return true;
  }
  return false;
}

function getSqlDraftStorageKey() {
  const dbUser = getDbUserFromSession() || getDbIdentity();
  return dbUser ? `info330_sql_draft:${dbUser}` : null;
}

function loadSqlDraftState() {
  const key = getSqlDraftStorageKey();
  if (!key) return null;
  const draftState = loadLocal(key, null);
  if (!draftState || typeof draftState !== "object") return null;
  return {
    templates: normalizeSqlTemplates(draftState.templates || {}),
    baseline: normalizeSqlTemplates(draftState.baseline || {})
  };
}

function saveSqlDraftState(templates) {
  const key = getSqlDraftStorageKey();
  if (!key) return;
  saveLocal(key, {
    templates: normalizeSqlTemplates(templates),
    baseline: normalizeSqlTemplates(_lastSqlTemplates || {})
  });
}

function clearSqlDraftState() {
  const key = getSqlDraftStorageKey();
  if (!key) return;
  try { localStorage.removeItem(key); } catch { }
}

function hasUnsavedSqlChanges(templates) {
  return templatesDiffer(templates, _lastSqlTemplates);
}

function setSqlDirtyState(isDirty) {
  const dirty = !!isDirty;
  if (sqlSaveBtn) sqlSaveBtn.disabled = !dirty;
  if (!sqlDirtyStateEl) return;
  sqlDirtyStateEl.textContent = dirty ? "Save status: Unsaved changes" : "Save status: All changes saved";
  sqlDirtyStateEl.classList.toggle("is-dirty", dirty);
}

function updateSqlDirtyState() {
  if (!sqlLabList) {
    setSqlDirtyState(false);
    return;
  }
  const current = collectSqlLabInputs();
  const dirty = hasUnsavedSqlChanges(current);
  setSqlDirtyState(dirty);
  if (dirty) saveSqlDraftState(current);
  else clearSqlDraftState();
}

async function saveSqlTemplatesIfChanged() {
  const templates = normalizeSqlTemplates(collectSqlLabInputs());
  const changed = hasUnsavedSqlChanges(templates);
  if (!changed) {
    clearSqlDraftState();
    setSqlDirtyState(false);
    return false;
  }

  await api("/api/sql_templates", "POST", { templates });
  _lastSqlTemplates = templates;
  clearSqlDraftState();
  setSqlLastSaved(new Date().toISOString());
  setSqlDirtyState(false);
  return true;
}

async function submitSqlSnapshot() {
  if (sqlSubmissionInFlight) return;
  sqlSubmissionInFlight = true;
  try {
    const data = await api("/api/sql_templates/submit", "POST");
    if (data?.filename) {
      console.info("SQL snapshot saved:", data.filename);
      setTimeout(() => {
        toast("Saved — your submission is on file.");
      }, 2200);
    }
  } catch (e) {
    console.warn("SQL snapshot submission failed:", e?.message || e);
  } finally {
    sqlSubmissionInFlight = false;
  }
}


// ----------------------------
// State
// ----------------------------
const state = {
  pollTimer: null,
  activeChannelId: null,
  channels: [],
  chatUsername: null,
  lastSeenByChannel: loadLocal("lastSeenByChannel", {})
};

// cache recent messages per-channel so we can detect changes and only
// re-render the messages list when the server response actually differs.
state.messagesByChannel = {};

const SQL_META_KEY = "info330_sql_meta";
const sqlMeta = loadLocal(SQL_META_KEY, {});
const SQL_LAST_SAVED_KEY = "info330_sql_last_saved";
const SQL_EDITOR_HEIGHT_KEY = "info330_sql_editor_heights";
const sqlEditorHeights = loadLocal(SQL_EDITOR_HEIGHT_KEY, {});

// ----------------------------
// Helpers
// ----------------------------
function getChannelSearchQuery() {
  return (channelSearchEl?.value || "").trim().toLowerCase();
}

function filterChannels(list, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return list || [];
  return (list || []).filter(c =>
    (c.name || "").toLowerCase().includes(q) ||
    (c.description || "").toLowerCase().includes(q)
  );
}

function updateChatEmptyState() {
  if (!chatEmptyState) return;
  const q = getChannelSearchQuery();
  const filtered = filterChannels(state.channels, q);
  const searchEmpty = !!q && filtered.length === 0;
  const shouldShow = !!state.chatUsername && !state.activeChannelId && !searchEmpty;
  chatEmptyState.classList.toggle("hidden", !shouldShow);
}

function setMessagesEmptyState(visible) {
  if (!messagesEmptyState) return;
  messagesEmptyState.classList.toggle("hidden", !visible);
}

const SQL_TAB_TIP_KEY = "info330_seen_sql_tab_tip";

function hasSeenSqlTabTip() {
  try { return localStorage.getItem(SQL_TAB_TIP_KEY) === "1"; } catch { return false; }
}

function markSqlTabTipSeen() {
  try { localStorage.setItem(SQL_TAB_TIP_KEY, "1"); } catch { }
}

function hideSqlTabTip() {
  if (!sqlTabTip) return;
  sqlTabTip.classList.add("hidden");
}

function maybeShowSqlTabTip() {
  if (!sqlTabTip || hasSeenSqlTabTip()) return;
  if (document.documentElement.classList.contains("sql-mode")) return;
  sqlTabTip.classList.remove("hidden");
  markSqlTabTipSeen();
  window.setTimeout(() => hideSqlTabTip(), 7000);
}

function setMsg(el, text, ok = false) {
  el.textContent = text || "";
  el.className = "msg " + (ok ? "ok" : "err");
  if (!text) el.className = "msg";
}

const SQL_TRACE_PREFIX = "Go to SQL tab to trace this error:";

function maybeAddSqlTraceHint(message, meta = null) {
  const text = String(message || "");
  if (!text) return text;
  if (text.startsWith(SQL_TRACE_PREFIX)) return text;
  const sqlError = meta?.sqlError;
  if (sqlError === false) return text;
  const hasSqlMeta = !!meta?.sqlKey || (Array.isArray(meta?.sqlTrace) && meta.sqlTrace.length > 0);
  if (!hasSqlMeta && sqlError !== true) return text;
  return `${SQL_TRACE_PREFIX} ${text}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(text, ms = 2200) {
  toastEl.textContent = text;
  toastEl.classList.remove("hidden");
  window.clearTimeout(toastEl._t);
  toastEl._t = window.setTimeout(() => toastEl.classList.add("hidden"), ms);
}

function clearToast() {
  toastEl.textContent = "";
  toastEl.classList.add("hidden");
  window.clearTimeout(toastEl._t);
}

function loadLocal(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

// function toChronological(messages) {
//   return messages.reverse();
// }

function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
}

function recordSqlInput(key, params) {
  if (!key) return;
  const next = Array.isArray(params) ? params : [params];
  const prev = sqlMeta[key]?.lastInput;
  if (prev && JSON.stringify(prev) === JSON.stringify(next)) return;
  sqlMeta[key] = {
    ...(sqlMeta[key] || {}),
    lastInput: next,
    lastInputAt: new Date().toISOString()
  };
  saveLocal(SQL_META_KEY, sqlMeta);
  updateSqlItemUI(key);
}

function recordSqlError(key, message) {
  if (!key || !state.isDbConnected) return;
  sqlMeta[key] = {
    ...(sqlMeta[key] || {}),
    lastError: String(message || ""),
    lastErrorAt: new Date().toISOString()
  };
  saveLocal(SQL_META_KEY, sqlMeta);
  updateSqlItemUI(key);
}

function recordSqlTip(key, message) {
  if (!key) return;
  sqlMeta[key] = {
    ...(sqlMeta[key] || {}),
    lastTip: String(message || ""),
    lastTipAt: new Date().toISOString()
  };
  saveLocal(SQL_META_KEY, sqlMeta);
  updateSqlItemUI(key);
}

function clearSqlError(key) {
  if (!key || !sqlMeta[key]) return;
  delete sqlMeta[key].lastError;
  delete sqlMeta[key].lastErrorAt;
  saveLocal(SQL_META_KEY, sqlMeta);
  updateSqlItemUI(key);
}

function clearSqlTip(key) {
  if (!key || !sqlMeta[key]) return;
  delete sqlMeta[key].lastTip;
  delete sqlMeta[key].lastTipAt;
  saveLocal(SQL_META_KEY, sqlMeta);
  updateSqlItemUI(key);
}

function resetSqlMeta() {
  Object.keys(sqlMeta).forEach((k) => delete sqlMeta[k]);
  try { localStorage.removeItem(SQL_META_KEY); } catch { }
}

function getSqlLastSaved() {
  try { return localStorage.getItem(SQL_LAST_SAVED_KEY); } catch { return null; }
}

function setSqlLastSaved(iso) {
  if (!iso) return;
  try { localStorage.setItem(SQL_LAST_SAVED_KEY, iso); } catch { }
  updateSqlLastSaved(iso);
}

function updateSqlLastSaved(iso) {
  if (!sqlLastSavedEl) return;
  if (!iso) {
    sqlLastSavedEl.textContent = "Last saved: —";
    return;
  }
  const d = new Date(iso);
  sqlLastSavedEl.textContent = isNaN(d)
    ? "Last saved: —"
    : `Last saved: ${d.toLocaleString()}`;
}

function clearSqlLastSaved() {
  try { localStorage.removeItem(SQL_LAST_SAVED_KEY); } catch { }
  updateSqlLastSaved(null);
}

function resetSqlStatus() {
  resetSqlMeta();
  clearSqlLastSaved();
  clearToast();
  setMsg(schemaMsg, "");
  resetSqlEditorHeights();
  SQL_LAB_ITEMS.forEach((item) => {
    item.status = null;
    updateSqlItemUI(item.key);
  });
  confettiShown = false;
  updateSqlProgress();
  lastProgressSignature = null;
  queueProgressReport();
}

function getSqlEditorHeight(key) {
  const v = sqlEditorHeights?.[key];
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function setSqlEditorHeight(key, px) {
  if (!key) return;
  const n = Math.max(80, Math.round(Number(px)));
  if (!Number.isFinite(n)) return;
  sqlEditorHeights[key] = n;
  saveLocal(SQL_EDITOR_HEIGHT_KEY, sqlEditorHeights);
}

function resetSqlEditorHeights() {
  Object.keys(sqlEditorHeights).forEach((k) => delete sqlEditorHeights[k]);
  saveLocal(SQL_EDITOR_HEIGHT_KEY, sqlEditorHeights);
  SQL_LAB_ITEMS.forEach((item) => {
    const editor = sqlEditors.get(item.key);
    if (editor) {
      const next = item.textAreaHeight || "100px";
      editor.setSize(null, next);
      editor.refresh();
    }
  });
}

function formatSqlValue(v) {
  if (v === null) return "NULL";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function formatSqlInputs(params) {
  if (!Array.isArray(params) || params.length === 0) return "";
  return params.map((v, i) => `$${i + 1} = ${formatSqlValue(v)}`).join("\n");
}

function inferMessagesSqlKey(errMsg) {
  const lower = String(errMsg || "").toLowerCase();
  const m = lower.match(/supplies\s+(\d+)\s+parameters/);
  if (m) {
    const n = Number(m[1]);
    if (n === 2) return "member_check";
    if (n === 1) return "messages_list";
  }
  return null;
}

function expandTo128(s) {
  if (!s || s.length === 0) throw new Error("Input string must be non-empty");
  const reps = Math.ceil(128 / s.length);
  return (s.repeat(reps)).slice(0, 128);
}

// --- SHA-512 hash (128 hex chars) using Web Crypto API ---
async function sha512Hex(input) {
  // return expandTo128(input);
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-512", enc.encode(input));
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function api(path, method = "GET", body = null) {
  // Ensure cookies/session are sent so server sees our session (group DB login, templates)
  const opts = { method, headers: {}, credentials: "same-origin" };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));

  // If unauthorized, decide *why* before hiding the chat UI
  if (r.status === 401 || r.status === 403) {
    const msg = String(data.error || data.detail || "").toLowerCase();

    const groupDbMissing =
      msg.includes("group database") ||
      msg.includes("not logged in to group") ||
      msg.includes("not logged in to group database") ||
      msg.includes("not logged in to group db");

    const chatUserMissing =
      msg.includes("chat user") ||
      msg.includes("not logged in as a chat user");

    if (groupDbMissing) {
      // DB session truly missing: hide chat + tabs
      state.isDbConnected = false;
      renderGate();
    } else if (chatUserMissing) {
      // DB still connected: keep chat visible + tabs
      state.isDbConnected = true;
      renderGate();
      // go back to chat tab and show chat-user auth
      setTab("chat");
      showUserAuth();
    }
  }

  if (!r.ok) {
    const err = new Error(data.detail || data.error || `Request failed (${r.status})`);
    if (data && data.sqlKey) err.sqlKey = data.sqlKey;
    if (data && data.sqlTrace) err.sqlTrace = data.sqlTrace;
    if (data && Object.prototype.hasOwnProperty.call(data, "sqlError")) {
      err.sqlError = data.sqlError;
    }
    throw err;
  }
  return data;
}

const BRAND_TITLE_DEFAULT = "SQL Chat";
const BRAND_SUB_DEFAULT = "UW INFO 330 • SQL-driven messaging";
// DB_USER_KEY is a session-only UI hint;
// DB_IDENTITY_KEY persists to detect DB switches.
const DB_USER_KEY = "info330_db_user";
const DB_IDENTITY_KEY = "info330_db_identity";

function formatBrandTitle(titleAppend) {
  const suffix = String(titleAppend || "").trim();
  return suffix ? `${BRAND_TITLE_DEFAULT} – ${suffix}` : BRAND_TITLE_DEFAULT;
}

function setBrandTitle(titleAppend) {
  if (!brandTitleEl) return;
  brandTitleEl.textContent = formatBrandTitle(titleAppend);
}

async function loadUiConfig() {
  try {
    const response = await fetch("/api/ui-config", { credentials: "same-origin" });
    if (!response.ok) return;
    const data = await response.json();
    setBrandTitle(data?.title);
  } catch {
    // Keep the default title when config loading fails.
  }
}

function getDbUserFromSession() {
  return sessionStorage.getItem(DB_USER_KEY);
}

function getDbIdentity() {
  try { return localStorage.getItem(DB_IDENTITY_KEY); } catch { return null; }
}

function setDbIdentity(dbUser) {
  if (!dbUser) return;
  try { localStorage.setItem(DB_IDENTITY_KEY, dbUser); } catch { }
}

function syncDbIdentity(dbUser) {
  if (!dbUser) return;
  const prev = getDbIdentity();
  if (prev && prev !== dbUser) resetSqlStatus();
  setDbIdentity(dbUser);
}

function setBrandSubFromSession() {
  if (!brandSubEl) return;
  const dbUser = getDbUserFromSession();
  brandSubEl.textContent = dbUser ? `UW INFO 330 – SQL chat for ${dbUser}` : BRAND_SUB_DEFAULT;
}

function setBrandSubDefault() {
  if (!brandSubEl) return;
  brandSubEl.textContent = BRAND_SUB_DEFAULT;
}

function showUserAuth() {
  sidebar.classList.remove("hidden");
  sidebar.classList.add("sidebar-locked");
  userAuthPanel.classList.remove("hidden");
  chatUI.classList.add("hidden");
  mainChatUI.classList.add("hidden");
  userPill.classList.add("pill-muted");
  userPill.textContent = "";
  userLabel.textContent = "";
  userAvatar.textContent = "";
  if (chatEmptyState) chatEmptyState.classList.add("hidden");
  setMessagesEmptyState(false);
}

function showMainUI(username) {
  sidebar.classList.remove("sidebar-locked");
  userAuthPanel.classList.add("hidden");
  chatUI.classList.remove("hidden");
  mainChatUI.classList.toggle("hidden", !state.activeChannelId);
  userPill.classList.remove("pill-muted");
  userPill.textContent = `@${username}`;
  userLabel.textContent = `@${username}`;
  userAvatar.textContent = (username?.[0] || "?").toUpperCase();
  updateChatEmptyState();
}

if (openSidebarBtn) {
  openSidebarBtn.addEventListener("click", () => {
    if (sidebar.classList.contains("open")) closeSidebarDrawer();
    else openSidebarDrawer();
  });
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", closeSidebarDrawer);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    if (state.activeChannelId) loadMessages(state.activeChannelId, { silent: true });
  }, 2500);
}

function setConnectedPill(connected) {
  connPill.classList.toggle("pill-muted", !connected);
  connPill.textContent = connected ? "Connected" : "Not connected";
}

function setActiveChannel(channel) {
  if (!channel) {
    state.activeChannelId = null;
    activeChannelLabel.textContent = "Select a channel";
    activeChannelSub.textContent = "Join a channel to read and post.";
    // Clear messages and hide the chat body so stale messages don't remain
    messagesEl.innerHTML = "";
    mainChatUI.classList.add("hidden");
    setMessagesEmptyState(false);
    updateChatEmptyState();
    stopPolling();
    return;
  }
  state.activeChannelId = channel.id;
  activeChannelLabel.textContent = `# ${channel.name}`;
  // Show description and, if provided by the backend, a clickable member count
  activeChannelSub.textContent = "";
  const desc = channel.description || "";
  const descSpan = document.createElement("span");
  descSpan.textContent = desc;
  activeChannelSub.appendChild(descSpan);
  setMessagesEmptyState(false);
  updateChatEmptyState();

  const count = (typeof channel.user_count !== 'undefined' && channel.user_count !== null)
    ? Number(channel.user_count)
    : null;
  if (count !== null) {
    const btn = document.createElement("button");
    btn.className = "memberCount";
    btn.type = "button";
    btn.title = `Show members (${count})`;
    btn.textContent = `${count} ${count === 1 ? 'member' : 'members'}`;
    btn.style.marginLeft = "10px";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      // open modal and load members
      await loadChannelMembers(channel.id, channel.name);
    });
    activeChannelSub.appendChild(btn);
  }
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatMessageTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const now = new Date();
  const todayKey = dayKey(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const msgKey = dayKey(d);

  if (msgKey === todayKey) return "Today";
  if (msgKey === dayKey(yesterday)) return "Yesterday";

  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "2-digit",
    ...(sameYear ? {} : { year: "numeric" })
  });
}

function isAtBottom(container) {
  const threshold = 80;
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

// autosize textarea
function autosizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

// ----------------------------
// DB-connected gate
// ----------------------------
state.isDbConnected = false;
state.demoMode = false;

function renderGate() {
  if (state.isDbConnected) {
    loginPanel.classList.add("hidden");
    chatPanel.classList.remove("hidden");
    setConnectedPill(true);
    setBrandSubFromSession();

    // show tabs (chat + sql lab) only when connected to schema / database
    setTabsVisible(true);
    if (state.demoMode) tabSqlBtn.classList.add("hidden");
    updateChatEmptyState();
    maybeShowSqlTabTip();
  } else {
    // show ONLY group db login
    chatPanel.classList.add("hidden");
    loginPanel.classList.remove("hidden");
    setConnectedPill(false);
    setBrandSubDefault();
    setMsg(loginMsg, "", true);
    sessionStorage.removeItem(DB_USER_KEY);

    setTabsVisible(false);

    // clear chat UI so nothing “leaks”
    stopPolling();
    state.activeChannelId = null;
    state.channels = [];
    state.chatUsername = null;
    messagesEl.innerHTML = "";
    channelsEl.innerHTML = "";
    updateChatEmptyState();
    setMessagesEmptyState(false);
    // logoutBtn.click(); // TBD revise
  }
}

// ----------------------------
// Rendering
// ----------------------------
function renderMessages(messages) {
  // Make sure the chat body is visible when rendering messages
  mainChatUI.classList.remove("hidden");
  const shouldStick = messagesEl.childElementCount === 0 || isAtBottom(messagesEl);

  messagesEl.innerHTML = "";
  if (!messages || messages.length === 0) {
    setMessagesEmptyState(true);
    return;
  }
  setMessagesEmptyState(false);
  let lastDay = null;
  for (const m of messages) {
    const created = m.created_at ? new Date(m.created_at) : null;
    const createdKey = created && !Number.isNaN(created.getTime()) ? dayKey(created) : null;
    const label = formatDayLabel(m.created_at);
    if (label && createdKey && createdKey !== lastDay) {
      const divider = document.createElement("div");
      divider.className = "dayDivider";
      divider.innerHTML = `<span>${escapeHtml(label)}</span>`;
      messagesEl.appendChild(divider);
      lastDay = createdKey;
    }

    const mine = state.chatUsername && m.username === state.chatUsername;
    const div = document.createElement("div");
    div.className = "msgRow" + (mine ? " me" : "");

    const bubble = document.createElement("div");
    bubble.className = "bubble" + (mine ? " me" : "");

    const when = formatMessageTime(m.created_at);

    bubble.innerHTML = `
      <div class="metaLine">
        <span class="metaUser">${escapeHtml(m.username ?? "")}</span>
        <span class="metaTime">${escapeHtml(when)}</span>
      </div>
      <div class="msgText">${escapeHtml(m.body ?? "")}</div>
    `;

    div.appendChild(bubble);
    messagesEl.appendChild(div);
  }

  if (shouldStick) scrollToBottom(messagesEl);
}

const INSERT_SQL_KEYS = new Set(["user_register", "channel_join", "channel_create", "message_post"]);

function flagQueryStatus(query, status) {
  if (!state.isDbConnected) return;
  for (const item of SQL_LAB_ITEMS) {
    if (item.key == query) {
      item.status = status
    }
  }
  if (status === true) clearSqlError(query);
  // console.log(query, status);
  updateSqlProgress();
  updateSqlItemUI(query);
  queueProgressReport();
  if (INSERT_SQL_KEYS.has(query)) {
    if (status === true) {
      recordSqlTip(query, "Insert succeeded. Open pgAdmin and run a SELECT to verify.");
    } else {
      clearSqlTip(query);
    }
  }
}

function launchConfetti() {
  if (!confettiEl) return;
  confettiEl.innerHTML = "";
  confettiEl.classList.remove("hidden");

  toast("Congrats! All queries passed!");

  const colors = ["var(--accent)", "var(--accent2)", "var(--accent3)", "var(--good)"];
  const count = 70;
  const maxDelay = 700;
  const maxDuration = 1800;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    const left = Math.random() * 100;
    const delay = Math.random() * maxDelay;
    const duration = 1200 + Math.random() * 800;
    const rotate = Math.random() * 360;
    const scale = 0.8 + Math.random() * 0.6;
    const color = colors[i % colors.length];

    piece.style.left = `${left}%`;
    piece.style.animationDelay = `${delay}ms`;
    piece.style.animationDuration = `${duration}ms`;
    piece.style.transform = `translate3d(0, -10vh, 0) rotate(${rotate}deg) scale(${scale})`;
    piece.style.setProperty("--c", color);

    confettiEl.appendChild(piece);
  }

  const totalTime = maxDelay + maxDuration;
  window.setTimeout(() => {
    confettiEl.classList.add("hidden");
    confettiEl.innerHTML = "";
  }, totalTime);
}

function renderChannels(list) {
  channelsEl.innerHTML = "";

  const q = getChannelSearchQuery();
  const filtered = filterChannels(list, q);
  const hasSearch = !!q;

  // If the server returned no channels (for example because the SQL template
  // was changed to return none), show a friendly empty state rather than an
  // empty sidebar.
  if (!filtered || filtered.length === 0) {
    // No channels are visible in the sidebar. If this is due to search
    // filtering, keep the active channel state but hide the main UI so
    // the empty guidance shows. If it's truly empty, clear the active
    // channel to avoid stale messages.
    if (!hasSearch || !(list && list.length)) {
      setActiveChannel(null); // clears messages and stops polling
    } else {
      mainChatUI.classList.add("hidden");
      setMessagesEmptyState(false);
      updateChatEmptyState();
    }
    const empty = document.createElement('div');
    empty.className = 'channelEmpty';

    const title = document.createElement('div');
    title.className = 'channelEmptyTitle';
    title.textContent = q ? 'No channels match your search' : 'No channels yet';

    const hint = document.createElement('div');
    hint.className = 'mutedSmall';
    hint.textContent = q
      ? 'Clear the search to see all channels.'
      : 'Try refreshing or create one. If you’re stuck, check SQL Lab → Display channel.';

    empty.appendChild(title);
    empty.appendChild(hint);
    channelsEl.appendChild(empty);
    return;
  }

  for (const ch of filtered) {
    const item = document.createElement("div");
    item.className = "channelItem";

    const left = document.createElement("div");
    left.className = "channelLeft";

    const name = document.createElement("div");
    name.className = "channelName";
    name.textContent = `# ${ch.name}`;
    name.title = ch.description || "";

    const desc = document.createElement("div");
    desc.className = "channelDesc";
    desc.textContent = ch.description || "";

    left.appendChild(name);
    left.appendChild(desc);

    const right = document.createElement("div");
    right.className = "channelRight";

    const lastSeen = state.lastSeenByChannel[String(ch.id)];
    const hasUnread = lastSeen && ch.latest_created_at && new Date(ch.latest_created_at) > new Date(lastSeen);
    const badge = document.createElement("div");
    badge.className = "channelBadge " + (hasUnread ? "on" : "off");
    badge.title = hasUnread ? "New messages" : "";

    const btn = document.createElement("button");
    btn.className = "btn " + (ch.is_member ? "btn-ghost" : "btn-primary");
    btn.classList.add("channelActionBtn");
    btn.textContent = ch.is_member ? "Leave" : "Join";

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        btn.disabled = true;
        if (ch.is_member) {
          recordSqlInput("channel_leave", [state.chatUsername, ch.id]);
          await api("/api/channels/leave", "POST", { channel_id: ch.id }); // KEY: "channel_leave"
          toast(`Left #${ch.name}`);
          flagQueryStatus("channel_leave", true);
          if (state.activeChannelId === ch.id) setActiveChannel(null);
        } else {
          recordSqlInput("channel_join", [state.chatUsername, ch.id]);
          await api("/api/channels/join", "POST", { channel_id: ch.id }); // KEY: "channel_join"
          flagQueryStatus("channel_join", true);
          toast(`Joined #${ch.name}`);
        }
        await loadChannels();
        if (!ch.is_member) {
          const joined = state.channels.find(c => c.id === ch.id) || ch;
          setActiveChannel(joined);
          state.lastSeenByChannel[String(ch.id)] = new Date().toISOString();
          saveLocal("lastSeenByChannel", state.lastSeenByChannel);
          await loadMessages(ch.id);
          startPolling();
          closeSidebarDrawer();
        }
      } catch (err) {
        const rawMsg = err.message || String(err);
        const displayMsg = maybeAddSqlTraceHint(rawMsg, err);
        setMsg(channelMsg, displayMsg, false);
        if (ch.is_member) {
          flagQueryStatus("channel_leave", false);
          recordSqlError("channel_leave", rawMsg);
        } else {
          flagQueryStatus("channel_join", false);
          recordSqlError("channel_join", rawMsg);
        }
      } finally {
        btn.disabled = false;
      }
    });

    item.addEventListener("click", async () => {
      if (!ch.is_member) {
        setMsg(channelMsg, "Join the channel to view messages.", false);
        toast("Join the channel to view messages");
        return;
      }
      setMsg(channelMsg, "", true);
      setMsg(postMsg, "", true);

      setActiveChannel(ch);
      renderChannels(state.channels);

      state.lastSeenByChannel[String(ch.id)] = new Date().toISOString();
      saveLocal("lastSeenByChannel", state.lastSeenByChannel);

      await loadMessages(ch.id);
      startPolling();
      closeSidebarDrawer();
    });

    right.appendChild(badge);
    right.appendChild(btn);

    item.appendChild(left);
    item.appendChild(right);

    if (state.activeChannelId === ch.id) {
      item.classList.add("active");
    }

    channelsEl.appendChild(item);
  }

  if (state.activeChannelId) mainChatUI.classList.remove("hidden");
  updateChatEmptyState();
}

// ----------------------------
// Data Loading
// ----------------------------
async function loadChannels() {
  setMsg(channelMsg, "");
  if (state.chatUsername) recordSqlInput("channels_list", [state.chatUsername]);
  try {
    const data = await api("/api/channels"); // KEY: channels_list
    // Debug: log the raw response so we can confirm the server returned the
    // updated channels after you changed the query.
    console.debug("loadChannels: server response:", data);
    state.channels = (data.channels || []).map(c => ({
      ...c,
      latest_created_at: c.latest_created_at || null
    }));
    renderChannels(state.channels);
    updateChatEmptyState();
    flagQueryStatus("channels_list", true);
  } catch (e) {
    const rawMsg = e.message || String(e);
    const displayMsg = maybeAddSqlTraceHint(rawMsg, e);
    // On error, clear any previously rendered channels so the sidebar
    // doesn't show stale data from a prior successful load.
    state.channels = [];
    channelsEl.innerHTML = "";
    // Hide the chat body when channels cannot be loaded so previous
    // messages don't remain visible.
    mainChatUI.classList.add("hidden");
    setMsg(channelMsg, displayMsg, false);
    // Stop polling since we don't have a valid channel context
    stopPolling();
    flagQueryStatus("channels_list", false);
    recordSqlError("channels_list", rawMsg);
    throw e; // rethrow so callers can handle additional UI changes if needed
  }

  // Ensure we have an active channel when possible. If the server now
  // reports that the user is a member of one or more channels, pick the
  // first joined channel and load its messages. This covers the case where
  // the channels SQL was changed and previously the UI had no joined
  // channels (so no activeChannelId); when the student fixes the SQL and
  // returns to Chat we must show messages.
  const activeJoined = state.activeChannelId
    ? state.channels.find(c => c.id === state.activeChannelId && c.is_member)
    : null;
  const firstJoined = state.channels.find(c => c.is_member);
  if (activeJoined) {
    startPolling();
  } else if (firstJoined) {
    setActiveChannel(firstJoined);
    await loadMessages(firstJoined.id);
    startPolling();
  } else {
    // If there are no joined channels, clear any previously active channel
    // so the main chat UI doesn't show stale content.
    if (state.activeChannelId) setActiveChannel(null);
  }
}

async function loadMessages(channelId, { silent = false } = {}) {
  try {
    if (!silent) {
      messagesEl.innerHTML = `<div class="mutedSmall">Loading…</div>`;
      setMessagesEmptyState(false);
    }
    recordSqlInput("member_check", [state.chatUsername, channelId]);
    recordSqlInput("messages_list", [channelId]);
    const data = await api(`/api/messages?channel_id=${encodeURIComponent(channelId)}`); // KEY: member_check, messages_list
    const messages = data.messages;

    // Serialize to a compact string to detect changes. Avoids re-rendering
    // identical message lists and ensures the UI updates when the server
    // returns a different set.
    const key = String(channelId);
    const serialized = JSON.stringify(messages);
    const prev = state.messagesByChannel[key];
    if (serialized !== prev) {
      // only re-render when messages changed
      renderMessages(messages);
      state.messagesByChannel[key] = serialized;

      state.lastSeenByChannel[key] = new Date().toISOString();
      saveLocal("lastSeenByChannel", state.lastSeenByChannel);

      renderChannels(state.channels);
    } else {
      // If the server returned the same set as before but this load was
      // explicit (non-silent), re-render the cached messages so the UI is
      // visible (for example when the user clicks a channel). This avoids
      // leaving the "Loading…" placeholder visible when nothing changed.
      if (!silent && prev) {
        try {
          const cached = JSON.parse(prev);
          renderMessages(cached);
        } catch (err) {
          // fallback: no-op
        }
      }
    }

    setMsg(channelMsg, "", true);
    setMsg(postMsg, "", true);
    flagQueryStatus("member_check", true);
    flagQueryStatus("messages_list", true);

  } catch (e) {
    const errMsg = e.message || String(e);
    // Clear messages UI on error so stale messages from a previous
    // successful load aren't shown when the request fails.
    messagesEl.innerHTML = "";
    setMessagesEmptyState(false);
    // Also hide the chat body so no stale UI remains visible
    mainChatUI.classList.add("hidden");

    const trace = Array.isArray(e.sqlTrace) ? e.sqlTrace : null;
    if (trace) {
      const keys = new Set(["member_check", "messages_list"]);
      const seen = new Set();
      for (const entry of trace) {
        if (!entry?.key) continue;
        seen.add(entry.key);
        if (entry.status === "ok") {
          flagQueryStatus(entry.key, true);
          clearSqlError(entry.key);
        } else if (entry.status === "error") {
          flagQueryStatus(entry.key, false);
          recordSqlError(entry.key, errMsg);
        }
      }
      for (const key of keys) {
        if (!seen.has(key)) {
          flagQueryStatus(key, null);
          clearSqlError(key);
        }
      }
    }

    let sqlKey = e.sqlKey;
    if (!sqlKey && trace) {
      const lastErr = trace.slice().reverse().find((t) => t && t.status === "error");
      if (lastErr?.key) sqlKey = lastErr.key;
    }
    if (!sqlKey) sqlKey = inferMessagesSqlKey(errMsg);

    const displayMsg = maybeAddSqlTraceHint(errMsg, { sqlKey, sqlTrace: trace, sqlError: e.sqlError });
    setMsg(postMsg, displayMsg, false);

    if (sqlKey === "member_check") {
      setMsg(channelMsg, displayMsg, false); // surface membership error in chat tab
      if (!trace) {
        flagQueryStatus("member_check", false);
        recordSqlError("member_check", errMsg);
        flagQueryStatus("messages_list", null);
        clearSqlError("messages_list");
      }
    } else if (sqlKey === "messages_list") {
      if (!trace) {
        flagQueryStatus("messages_list", false);
        recordSqlError("messages_list", errMsg);
        flagQueryStatus("member_check", true);
        clearSqlError("member_check");
      }
    } else {
      const lower = errMsg.toLowerCase();
      const isMemberErr =
        lower.includes("join this channel") ||
        lower.includes("must join") ||
        lower.includes("not a member");

      if (isMemberErr) {
        setMsg(channelMsg, displayMsg, false);
        if (!trace) {
          flagQueryStatus("member_check", false);
          recordSqlError("member_check", errMsg);
          flagQueryStatus("messages_list", null);
          clearSqlError("messages_list");
        }
      } else if (!trace) {
        flagQueryStatus("messages_list", false);
        recordSqlError("messages_list", errMsg);
      }
    }
    stopPolling();
  }
}

// Modal helpers: load and display channel members
async function loadChannelMembers(channelId, channelName) {
  if (!memberModal || !memberModalList) return;
  memberModalList.innerHTML = `<div class="mutedSmall">Loading…</div>`;
  if (memberModalMsg) setMsg(memberModalMsg, "");
  memberModalTitle.textContent = `Members • # ${channelName}`;
  memberModal.classList.remove("hidden");

  try {
    recordSqlInput("channel_members_list", [channelId]);
    const data = await api(`/api/channels/members?channel_id=${encodeURIComponent(channelId)}`); // KEY: channel_members_list
    const members = data.members || [];
    if (!members || members.length === 0) {
      memberModalList.innerHTML = `<div class="mutedSmall">No members found.</div>`;
      return;
    }
    memberModalList.innerHTML = "";
    for (const m of members) {
      const item = document.createElement("div");
      item.className = "memberItem";
      item.textContent = m;
      memberModalList.appendChild(item);
    }
    flagQueryStatus("channel_members_list", true);
  } catch (err) {
    memberModalList.innerHTML = "";
    const msg = err.message || String(err);
    const displayMsg = maybeAddSqlTraceHint(msg, err);
    if (memberModalMsg) setMsg(memberModalMsg, displayMsg, false);
    else setMsg(channelMsg, displayMsg, false);
    flagQueryStatus("channel_members_list", false);
    recordSqlError("channel_members_list", msg);
  }
}

function hideMemberModal() {
  if (!memberModal) return;
  memberModal.classList.add("hidden");
  if (memberModalMsg) setMsg(memberModalMsg, "");
}

// hook up modal close events
memberModalClose?.addEventListener("click", hideMemberModal);
memberModalOverlay?.addEventListener("click", hideMemberModal);

// Modal helpers: allow to create new channels
async function createNewChannelModal() {
  if (!newChannelModal) return;
  newChannelModalTitle.textContent = `Creating new channel`;
  newChannelModal.classList.remove("hidden");
  if (newChannelMsg) setMsg(newChannelMsg, "");

  try {

  } catch (err) {
    newChannelModalList.innerHTML = "";
    if (newChannelMsg) {
      setMsg(newChannelMsg, err.message || String(err), false);
    } else {
      setMsg(channelMsg, err.message || String(err), false);
    }
  }
}

function hidechannelModal() {
  if (!newChannelModal) return;
  newChannelModal.classList.add("hidden");
  if (newChannelName) newChannelName.value = "";
  if (newChannelDescription) newChannelDescription.value = "";
  if (newChannelMsg) setMsg(newChannelMsg, "");
}

// hook up modal close events
newChannelModalClose?.addEventListener("click", hidechannelModal);
newChannelModalOverlay?.addEventListener("click", hidechannelModal);


// ----------------------------
// Events: DB / Group login
// ----------------------------
loginBtn.addEventListener("click", async () => {
  setMsg(loginMsg, "");
  loginBtn.disabled = true;
  try {
    const data = await api("/api/login", "POST", {
      username: usernameEl.value.trim(),
      password: passwordEl.value
    });
    const dbUser = usernameEl.value.trim();
    sessionStorage.setItem(DB_USER_KEY, dbUser);
    syncDbIdentity(dbUser);
    setBrandSubFromSession();
    setMsg(loginMsg, "Connected to your group database.", true);
    state.isDbConnected = true;
    state.demoMode = !!data?.demoMode;
    renderGate();
    await setTab("chat");
    toast("Connected");
  } catch (e) {
    state.isDbConnected = false;
    renderGate();
    setMsg(loginMsg, e.message || String(e), false);
    sessionStorage.removeItem(DB_USER_KEY);
    setBrandSubDefault();
  } finally {
    loginBtn.disabled = false;
  }
});

async function tryDBCredentials() {
  setMsg(loginMsg, "");
  loginBtn.disabled = true;
  try {
    const data = await api("/api/credentials_login", "POST");
    if (data?.dbUser) {
      sessionStorage.setItem(DB_USER_KEY, data.dbUser);
      syncDbIdentity(data.dbUser);
    } else {
      // If the browser already knows the username (e.g. autofill), mirror it into sessionStorage
      const existing = getDbUserFromSession();
      const candidate = usernameEl?.value?.trim();
      if (!existing && candidate) {
        sessionStorage.setItem(DB_USER_KEY, candidate);
      }
    }
    setBrandSubFromSession();
    setMsg(loginMsg, "Connected to your group database.", true);
    state.isDbConnected = true;
    state.demoMode = !!data?.demoMode;
    renderGate();
    await setTab("chat");
    toast("Connected");
  } catch (e) {
    state.isDbConnected = false;
    renderGate();
    setMsg(loginMsg, e.message || String(e), false);
    sessionStorage.removeItem(DB_USER_KEY);
    setBrandSubDefault();
  } finally {
    loginBtn.disabled = false;
  }
}


logoutBtn.addEventListener("click", async () => {
  // Sign out chat user only (keep DB session)
  try { await api("/api/user/logout", "POST"); } catch { }

  stopPolling();

  state.chatUsername = null;
  state.activeChannelId = null;
  state.channels = [];

  setActiveChannel(null);
  showUserAuth();
  channelsEl.innerHTML = "";
  setMsg(channelMsg, "Signed out. Log in to load channels.", true);
  setMsg(postMsg, "", true);

  // Keep DB connection indicator ON
  setConnectedPill(true);

  // ensure we're not stuck in SQL tab after user logout
  setTab("chat");

  toast("Signed out");
});

// ----------------------------
// Events: Chat user auth
// ----------------------------
registerBtn.addEventListener("click", async () => {
  setMsg(userAuthMsg, "");
  registerBtn.disabled = true;
  userLoginBtn.disabled = true;

  const u = chatUsernameEl.value.trim();
  const p = chatPasswordEl.value;
  if (!u || !p) {
    setMsg(userAuthMsg, "Username and password are required.", false);
    registerBtn.disabled = false;
    userLoginBtn.disabled = false;
    return;
  }

  let step = "user_register";
  try {
    const hash = await sha512Hex(p);
    recordSqlInput("user_register", [u, hash]);
    await api("/api/user/register", "POST", { username: u, password_hash: hash }); // KEY: user_register
    flagQueryStatus("user_register", true);
    setMsg(userAuthMsg, "Registered. Logging you in…", true);

    step = "user_login";
    recordSqlInput("user_login", [u]);
    await api("/api/user/login", "POST", { username: u, password_hash: hash }); // KEY: user_login
    flagQueryStatus("user_login", true);

    state.chatUsername = u;
    showMainUI(u);
    await loadChannels();
    toast(`Welcome @${u}`);
  } catch (e) {
    const msg = e.message || String(e);
    const displayMsg = maybeAddSqlTraceHint(msg, e);
    setMsg(userAuthMsg, displayMsg, false);
    if (step === "user_register") {
      flagQueryStatus("user_register", false);
      recordSqlError("user_register", msg);
    } else {
      flagQueryStatus("user_login", false);
      recordSqlError("user_login", msg);
    }
  } finally {
    registerBtn.disabled = false;
    userLoginBtn.disabled = false;
  }
});

userLoginBtn.addEventListener("click", async () => {
  setMsg(userAuthMsg, "");
  registerBtn.disabled = true;
  userLoginBtn.disabled = true;
  let loggedIn = false;

  const u = chatUsernameEl.value.trim();
  const p = chatPasswordEl.value;
  if (!u || !p) {
    setMsg(userAuthMsg, "Username and password are required.", false);
    registerBtn.disabled = false;
    userLoginBtn.disabled = false;
    return;
  }

  try {
    const hash = await sha512Hex(p);
    recordSqlInput("user_login", [u]);
    await api("/api/user/login", "POST", { username: u, password_hash: hash }); // KEY: user_login
    flagQueryStatus("user_login", true);

    state.chatUsername = u;
    showMainUI(u);
    await setTab("chat");
    loggedIn = true;
  } catch (e) {
    const m = String(e.message || "");
    const isInvalid =
      m.toLowerCase().includes("invalid username") ||
      m.toLowerCase().includes("does not exist");
    const displayMsg = isInvalid ? "Invalid username or password." : maybeAddSqlTraceHint(m, e);
    setMsg(userAuthMsg, displayMsg, false);
    if (e?.sqlError === true) {
      flagQueryStatus("user_login", false);
      recordSqlError("user_login", m);
    }
    state.chatUsername = null;
    state.activeChannelId = null;
    state.channels = [];
    stopPolling();
    setActiveChannel(null);
    channelsEl.innerHTML = "";
    showUserAuth();
  } finally {
    registerBtn.disabled = false;
    userLoginBtn.disabled = false;
    if (loggedIn) await loadChannels(); // channels_list
  }
});

// ----------------------------
// Events: Create Channel
// ----------------------------
createChannelBtn.addEventListener("click", async () => {
  setMsg(userAuthMsg, "");
  if (state.chatUsername) await createNewChannelModal();
});

if (emptyRefreshBtn) {
  emptyRefreshBtn.addEventListener("click", async () => {
    try {
      setMsg(channelMsg, "");
      await loadChannels();
      toast("Channels refreshed");
    } catch (err) {
      const rawMsg = err.message || String(err);
      setMsg(channelMsg, maybeAddSqlTraceHint(rawMsg, err), false);
    }
  });
}

if (emptyCreateBtn) {
  emptyCreateBtn.addEventListener("click", async () => {
    if (!state.chatUsername) return toast("Log in to create a channel");
    await createNewChannelModal();
  });
}


postNewChannelBtn.addEventListener("click", async () => {
  if (newChannelMsg) setMsg(newChannelMsg, "");
  registerBtn.disabled = true;

  const n = newChannelName.value.trim();
  const d = newChannelDescription.value.trim();

  if (!n || !d) {
    if (newChannelMsg) {
      setMsg(newChannelMsg, "Channel name and description are required.", false);
    } else {
      setMsg(userAuthMsg, "Channel name and description are required.", false);
    }
    return;
  }

  try {
    // console.log("Creating channel:", n, d);
    recordSqlInput("channel_create", [n, d]);
    await api("/api/channels/create", "POST", { name: n, description: d }); // KEY: channel_create
    if (newChannelMsg) {
      setMsg(newChannelMsg, `Channel #${n} created.`, true);
    } else {
      setMsg(userAuthMsg, `Channel #${n} created.`, true);
    }
    hidechannelModal();
    await loadChannels();
    toast(`Channel #${n} created.`);
    flagQueryStatus("channel_create", true);
  } catch (e) {
    const rawMsg = e.message || String(e);
    const displayMsg = maybeAddSqlTraceHint(rawMsg, e);
    if (newChannelMsg) {
      setMsg(newChannelMsg, displayMsg, false);
    } else {
      setMsg(userAuthMsg, displayMsg, false);
    }
    flagQueryStatus("channel_create", false);
    recordSqlError("channel_create", rawMsg);
  } finally {
    registerBtn.disabled = false;
    userLoginBtn.disabled = false;
  }
});


// ----------------------------
// Events: Channel search
// ----------------------------
channelSearchEl.addEventListener("input", () => renderChannels(state.channels));

// ----------------------------
// Events: Composer
// ----------------------------
composerInput.addEventListener("input", () => autosizeTextarea(composerInput));

composerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

sendBtn.addEventListener("click", async () => {
  setMsg(postMsg, "");
  const body = composerInput.value.trim();

  if (!state.activeChannelId) return setMsg(postMsg, "Select a channel first.", false);
  if (!body) return setMsg(postMsg, "Message body is required.", false);

  sendBtn.disabled = true;

  const optimistic = {
    username: state.chatUsername,
    body,
    created_at: new Date().toISOString()
  };

  const stick = isAtBottom(messagesEl);
  let optimisticRow = null;

  try {
    const row = document.createElement("div");
    row.className = "msgRow me";
    const bubble = document.createElement("div");
    bubble.className = "bubble me";
    bubble.innerHTML = `
      <div class="metaLine">
        <span class="metaUser">${escapeHtml(optimistic.username)}</span>
        <span class="metaTime">${escapeHtml(formatMessageTime(optimistic.created_at))}</span>
      </div>
      <div class="msgText">${escapeHtml(optimistic.body)}</div>
    `;
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    optimisticRow = row;
    if (stick) scrollToBottom(messagesEl);

    recordSqlInput("message_post", [state.chatUsername, state.activeChannelId, body]);
    await api("/api/message", "POST", { channel_id: state.activeChannelId, body }); // KEY: message_post
    composerInput.value = "";
    autosizeTextarea(composerInput);
    setMsg(postMsg, "Sent", true);
    flagQueryStatus("message_post", true);

    try {
      await loadMessages(state.activeChannelId, { silent: true });
    } catch (e) {
      // loadMessages already handles its own status/errors
    }
  } catch (e) {
    const errMsg = e.message || String(e);
    const displayMsg = maybeAddSqlTraceHint(errMsg, e);
    setMsg(postMsg, displayMsg, false);
    toast("Send failed");
    flagQueryStatus("message_post", false);
    recordSqlError("message_post", errMsg);
    if (optimisticRow && optimisticRow.parentElement) {
      optimisticRow.remove();
      if (messagesEl.childElementCount === 0) setMessagesEmptyState(true);
    }
  } finally {
    sendBtn.disabled = false;
  }
});

// -------------------------
// Update password handler
// -------------------------

const resetPwdBtn = el("resetPwdBtn");

let resetModal = null;
let resetOldEl, resetNew1El, resetNew2El, resetCancelBtn, resetSaveBtn, resetMsgEl;

function ensureResetModal() {
  if (resetModal) return;

  resetModal = document.createElement("div");
  resetModal.className = "modalBackdrop hidden";
  resetModal.id = "resetPwdModal";

  resetModal.innerHTML = `
    <div class="modalCard" role="dialog" aria-modal="true" aria-labelledby="resetPwdTitle">
      <div class="modalTitle" id="resetPwdTitle">Reset password</div>
      <div class="modalSub">Enter your current password and choose a new one.</div>

      <div class="modalGrid">
        <input id="resetOldPwd" type="password" placeholder="Current password" autocomplete="current-password" />
        <input id="resetNewPwd1" type="password" placeholder="New password" autocomplete="new-password" />
        <input id="resetNewPwd2" type="password" placeholder="Repeat new password" autocomplete="new-password" />
      </div>

      <div id="resetPwdMsg" class="msg modalMsg"></div>

      <div class="modalRow">
        <button id="resetCancelBtn" class="btn btn-ghost" type="button">Cancel</button>
        <button id="resetSaveBtn" class="btn btn-primary" type="button">Update</button>
      </div>
    </div>
  `;

  document.body.appendChild(resetModal);

  resetOldEl = el("resetOldPwd");
  resetNew1El = el("resetNewPwd1");
  resetNew2El = el("resetNewPwd2");
  resetCancelBtn = el("resetCancelBtn");
  resetSaveBtn = el("resetSaveBtn");
  resetMsgEl = el("resetPwdMsg");

  function close() {
    resetModal.classList.add("hidden");
    resetOldEl.value = "";
    resetNew1El.value = "";
    resetNew2El.value = "";
    setMsg(resetMsgEl, "");
  }

  // close on backdrop click
  resetModal.addEventListener("click", (e) => {
    if (e.target === resetModal) close();
  });

  // close on ESC
  document.addEventListener("keydown", (e) => {
    if (!resetModal.classList.contains("hidden") && e.key === "Escape") close();
  });

  resetCancelBtn.addEventListener("click", close);

  resetSaveBtn.addEventListener("click", async () => {
    setMsg(resetMsgEl, "");
    const u = chatUsernameEl.value.trim(); // reuse existing username field
    const oldP = resetOldEl.value;
    const n1 = resetNew1El.value;
    const n2 = resetNew2El.value;

    if (!u) return setMsg(resetMsgEl, "Username is required (in the main form).", false);
    if (!oldP || !n1 || !n2) return setMsg(resetMsgEl, "Fill all fields.", false);
    if (n1 !== n2) return setMsg(resetMsgEl, "New passwords do not match.", false);
    if (n1 === oldP) return setMsg(resetMsgEl, "New password must be different.", false);

    try {
      resetSaveBtn.disabled = true;
      const oldH = await sha512Hex(oldP);
      const newH = await sha512Hex(n1);

      recordSqlInput("update_password", [u, newH, oldH]);
      await api("/api/user/reset_password", "POST", {
        username: u,
        old_password_hash: oldH,
        new_password_hash: newH
      });

      setMsg(resetMsgEl, "Password updated. You can log in with the new password.", true);
      flagQueryStatus("update_password", true);
      setTimeout(close, 700);
    } catch (err) {
      const rawMsg = err.message || String(err);
      const displayMsg = maybeAddSqlTraceHint(rawMsg, err);
      setMsg(resetMsgEl, displayMsg, false);
      flagQueryStatus("update_password", false);
      recordSqlError("update_password", rawMsg);
    } finally {
      resetSaveBtn.disabled = false;
    }
  });

  // expose close for button handler
  resetModal._close = close;
}

function openResetModal() {
  ensureResetModal();
  resetModal.classList.remove("hidden");
  resetOldEl.focus();
}

resetPwdBtn.addEventListener("click", () => {
  // Only allow if DB connected (you already have state.isDbConnected)
  if (!state.isDbConnected) return toast("Connect to group DB first");
  if (chatPasswordEl) chatPasswordEl.value = "";
  openResetModal();
});




// ----------------------------
// Logout handlers
// -------------------------------

function openConnMenu() {
  if (!state.isDbConnected) return; // only when connected
  connMenu.classList.toggle("hidden");
}

function closeConnMenu() {
  connMenu.classList.add("hidden");
}

// Toggle menu when clicking the pill
connPill.addEventListener("click", (e) => {
  e.stopPropagation();
  openConnMenu();
});

// Click outside closes it
document.addEventListener("click", () => {
  closeConnMenu();
  hideSqlTabTip();
});

// 1) Sign out chat user only
connMenuUserLogout.addEventListener("click", async () => {
  closeConnMenu();
  try { await api("/api/user/logout", "POST"); } catch { }

  stopPolling();
  state.chatUsername = null;
  state.activeChannelId = null;
  state.channels = [];
  setActiveChannel(null);

  showUserAuth();
  channelsEl.innerHTML = "";
  setMsg(channelMsg, "Signed out. Log in to load channels.", true);
  setMsg(postMsg, "", true);
  setConnectedPill(true);
  toast("Signed out (chat user)");
});

// 2) Log out from DB (full reset)
connMenuDbLogout.addEventListener("click", async () => {
  closeConnMenu();
  try { await api("/api/logout", "POST"); } catch { }

  // full reset to group login
  stopPolling();
  state.chatUsername = null;
  state.activeChannelId = null;
  state.channels = [];
  state.isDbConnected = false;
  state.demoMode = false;
  ensureSqlLabUI();
  resetSqlStatus();

  setActiveChannel(null);
  sessionStorage.removeItem(DB_USER_KEY);
  sessionStorage.removeItem(THEME_KEY);
  setBrandSubFromSession();
  renderGate();           // shows only group login
  toast("Logged out (DB)");
});

// ----------------------------
// THEME TOGGLING
// ----------------------------

const THEME_KEY = "info330_theme"; // session-only
const root = document.documentElement;
const themeSelect = el("themeSelect");

const THEMES = {
  "studio-light": { family: "studio", tone: "light" },
  "studio-dark": { family: "studio", tone: "dark" },
  "classic-light": { family: "classic", tone: "light" },
  "classic-dark": { family: "classic", tone: "dark" }
};

function normalizeTheme(theme) {
  if (!theme) return null;
  if (theme === "light") return "classic-light";
  if (theme === "dark") return "classic-dark";
  return THEMES[theme] ? theme : null;
}

function applyTheme(theme) {
  const next = normalizeTheme(theme) || "classic-light";
  root.setAttribute("data-theme", next);
  if (themeSelect) themeSelect.value = next;
}

function getInitialTheme() {
  const saved = normalizeTheme(sessionStorage.getItem(THEME_KEY));
  if (saved) return saved;
  return "classic-light";
}

// init on page load
applyTheme(getInitialTheme());

if (themeSelect) {
  themeSelect.addEventListener("change", () => {
    const next = themeSelect.value;
    sessionStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}




// ----------------------------
// Init
// ----------------------------
state.isDbConnected = false;
setBrandTitle("");
void loadUiConfig();
renderGate();
autosizeTextarea(composerInput);
tryDBCredentials();
