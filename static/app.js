import { allowedUserEmails, dataMode, firebaseConfig, tasksCollection } from "./firebase-config.js";

const statusLabels = {
  todo: "待處理",
  in_progress: "作業中",
  done: "已完成",
  closed: "結案",
};

const form = document.querySelector("#taskForm");
const rows = document.querySelector("#taskRows");
const count = document.querySelector("#taskCount");
const message = document.querySelector("#formMessage");
const gantt = document.querySelector("#ganttChart");
const dateRange = document.querySelector("#dateRange");
const refreshButton = document.querySelector("#refreshButton");
const submitButton = document.querySelector("#submitButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const dataSourceBadge = document.querySelector("#dataSourceBadge");
const signInButton = document.querySelector("#signInButton");
const signOutButton = document.querySelector("#signOutButton");
const userEmailBadge = document.querySelector("#userEmailBadge");

let editingTaskId = null;
let currentTasks = [];
let taskStore;

class LocalApiTaskStore {
  label = "本機 SQLite";

  async init() {}

  async signIn() {}

  async signOut() {}

  get user() {
    return { email: "local" };
  }

  async request(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "操作失敗");
    }
    return body;
  }

  list() {
    return this.request("/api/tasks");
  }

  create(payload) {
    return this.request("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  update(id, payload) {
    return this.request(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  delete(id) {
    return this.request(`/api/tasks/${id}`, { method: "DELETE" });
  }
}

class FirestoreTaskStore {
  label = "Firebase Firestore";

  async init() {
    if (!firebaseConfig?.apiKey || firebaseConfig.apiKey.includes("YOUR_")) {
      throw new Error("請先在 static/firebase-config.js 填入 Firebase 專案設定。");
    }

    const appModule = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js");
    const authModule = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js");
    const app = appModule.getApps().length ? appModule.getApps()[0] : appModule.initializeApp(firebaseConfig);
    this.auth = authModule.getAuth(app);
    this.authModule = authModule;
    this.provider = new authModule.GoogleAuthProvider();
    this.collectionName = tasksCollection || "tasks";
    this.baseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${this.collectionName}`;
    const redirectResult = await authModule.getRedirectResult(this.auth);
    if (redirectResult?.user && !this.isAllowedUser(redirectResult.user)) {
      await this.signOut();
      throw new Error("這個 Google 帳號沒有此系統的操作權限。");
    }
  }

  get user() {
    return this.auth.currentUser;
  }

  isAllowedUser(user) {
    return Boolean(user?.email && allowedUserEmails.includes(user.email));
  }

  async waitForAuthState() {
    return new Promise((resolve) => {
      const unsubscribe = this.authModule.onAuthStateChanged(this.auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  async signIn() {
    const popupResult = this.authModule.signInWithPopup(this.auth, this.provider);
    const timeout = new Promise((resolve) => {
      setTimeout(() => resolve(null), 8000);
    });
    const result = await Promise.race([popupResult, timeout]);
    if (!result) {
      await this.authModule.signInWithRedirect(this.auth, this.provider);
      return null;
    }
    if (!this.isAllowedUser(result.user)) {
      await this.signOut();
      throw new Error("這個 Google 帳號沒有此系統的操作權限。");
    }
    return result.user;
  }

  signOut() {
    return this.authModule.signOut(this.auth);
  }

  async requireUser() {
    const user = this.user || (await this.waitForAuthState());
    if (!this.isAllowedUser(user)) {
      throw new Error("請使用授權的 Google 帳號登入。");
    }
    return user;
  }

  async headers() {
    const user = await this.requireUser();
    const token = await user.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: await this.headers(),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error?.message || "Firebase 操作失敗");
    }
    return body;
  }

  toFields(payload) {
    return {
      title: { stringValue: payload.title || "" },
      description: { stringValue: payload.description || "" },
      owner: { stringValue: payload.owner || "" },
      status: { stringValue: payload.status || "todo" },
      start_date: { stringValue: payload.start_date || "" },
      end_date: { stringValue: payload.end_date || "" },
      updated_at: { timestampValue: new Date().toISOString() },
      ...(payload.created_at ? { created_at: { timestampValue: payload.created_at } } : {}),
    };
  }

  fromFields(document) {
    const fields = document.fields || {};
    const value = (name) => fields[name]?.stringValue || "";
    return {
      id: document.name.split("/").at(-1),
      title: value("title"),
      description: value("description"),
      owner: value("owner"),
      status: value("status") || "todo",
      start_date: value("start_date"),
      end_date: value("end_date"),
    };
  }

  async list() {
    const body = await this.request(`${this.baseUrl}?orderBy=start_date`);
    return (body.documents || []).map((document) => this.fromFields(document));
  }

  create(payload) {
    return this.request(this.baseUrl, {
      method: "POST",
      body: JSON.stringify({
        fields: this.toFields({
          ...payload,
          created_at: new Date().toISOString(),
        }),
      }),
    });
  }

  update(id, payload) {
    const params = new URLSearchParams();
    Object.keys(payload).forEach((key) => params.append("updateMask.fieldPaths", key));
    params.append("updateMask.fieldPaths", "updated_at");
    return this.request(`${this.baseUrl}/${id}?${params.toString()}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: this.toFields(payload) }),
    });
  }

  delete(id) {
    return this.request(`${this.baseUrl}/${id}`, { method: "DELETE" });
  }
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateToUtc(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function daysBetween(start, end) {
  const day = 24 * 60 * 60 * 1000;
  return Math.round((dateToUtc(end) - dateToUtc(start)) / day);
}

function addDays(dateText, amount) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  const resultYear = date.getUTCFullYear();
  const resultMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const resultDay = String(date.getUTCDate()).padStart(2, "0");
  return `${resultYear}-${resultMonth}-${resultDay}`;
}

function formatShortDate(dateText) {
  const [, month, day] = dateText.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatMonthLabel(dateText) {
  const [year, month] = dateText.split("-");
  return `${year}/${month}`;
}

function getIsoWeek(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNumber = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function buildMonthSpans(dayColumns) {
  const spans = [];
  dayColumns.forEach((dateText, index) => {
    const label = formatMonthLabel(dateText);
    const current = spans.at(-1);
    if (current?.label === label) {
      current.count += 1;
      return;
    }
    spans.push({ label, start: index + 2, count: 1 });
  });
  return spans;
}

function getStatusPercent(status) {
  return {
    todo: 0,
    in_progress: 30,
    done: 100,
    closed: 100,
  }[status] ?? 0;
}

function setFormEnabled(enabled) {
  Array.from(form.elements).forEach((element) => {
    element.disabled = !enabled;
  });
  refreshButton.disabled = !enabled;
}

function setSignedOutView() {
  setFormEnabled(false);
  signInButton.hidden = false;
  signOutButton.hidden = true;
  userEmailBadge.hidden = true;
  count.textContent = "0 筆項目";
  rows.innerHTML = `<tr><td colspan="5" class="empty-state">請使用授權的 Google 帳號登入。</td></tr>`;
  gantt.innerHTML = `<div class="empty-state">登入後會顯示甘特圖。</div>`;
  dateRange.textContent = "尚未登入";
}

function setSignedInView(user) {
  setFormEnabled(true);
  signInButton.hidden = true;
  signOutButton.hidden = false;
  userEmailBadge.textContent = user.email;
  userEmailBadge.hidden = false;
}

function getPayload() {
  const payload = Object.fromEntries(new FormData(form).entries());
  if (payload.end_date < payload.start_date) {
    throw new Error("結束日期不能早於開始日期。");
  }
  return payload;
}

async function createTaskStore() {
  const store = dataMode === "firestore" ? new FirestoreTaskStore() : new LocalApiTaskStore();
  await store.init();
  return store;
}

async function loadTasks() {
  const tasks = await taskStore.list();
  currentTasks = tasks;
  renderTable(tasks);
  renderGantt(tasks);
}

function renderTable(tasks) {
  count.textContent = `${tasks.length} 筆項目`;
  if (tasks.length === 0) {
    rows.innerHTML = `<tr><td colspan="5" class="empty-state">尚無項目</td></tr>`;
    return;
  }

  rows.innerHTML = tasks
    .map(
      (task) => `
        <tr>
          <td>
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="task-description">${escapeHtml(task.description || "無作業內容")}</div>
          </td>
          <td>${escapeHtml(task.owner || "-")}</td>
          <td>
            <select class="status-select" data-id="${task.id}">
              ${Object.entries(statusLabels)
                .map(
                  ([value, label]) =>
                    `<option value="${value}" ${task.status === value ? "selected" : ""}>${label}</option>`
                )
                .join("")}
            </select>
          </td>
          <td>${task.start_date}<br>${task.end_date}</td>
          <td>
            <div class="row-actions">
              <button class="edit-button" type="button" data-id="${task.id}">修改</button>
              <button class="delete-button" type="button" data-id="${task.id}">刪除</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderGantt(tasks) {
  if (tasks.length === 0) {
    gantt.innerHTML = `<div class="empty-state">新增項目後會顯示甘特圖。</div>`;
    dateRange.textContent = "尚無資料";
    return;
  }

  const minStart = tasks.reduce((min, task) => (task.start_date < min ? task.start_date : min), tasks[0].start_date);
  const maxEnd = tasks.reduce((max, task) => (task.end_date > max ? task.end_date : max), tasks[0].end_date);
  const totalDays = Math.max(daysBetween(minStart, maxEnd) + 1, 1);
  dateRange.textContent = `${minStart} 到 ${maxEnd}`;
  const dayColumns = Array.from({ length: totalDays }, (_, index) => addDays(minStart, index));
  const monthSpans = buildMonthSpans(dayColumns);
  const gridTemplate = `168px repeat(${totalDays}, minmax(36px, 38px))`;

  const header = `
    <div class="gantt-grid gantt-month-row" style="grid-template-columns: ${gridTemplate};">
      <div class="gantt-corner">工項名稱</div>
      ${monthSpans
        .map(
          (span) =>
            `<div class="gantt-month" style="grid-column: ${span.start} / ${span.start + span.count};">${span.label}</div>`
        )
        .join("")}
    </div>
    <div class="gantt-grid gantt-week-row" style="grid-template-columns: ${gridTemplate};">
      <div class="gantt-corner gantt-corner-sub">階段</div>
      ${dayColumns
        .map((dateText) => {
          const day = new Date(`${dateText}T00:00:00Z`).getUTCDay();
          const label = day === 1 || dateText === minStart ? `W${getIsoWeek(dateText)}` : "";
          return `<div class="gantt-day" title="${dateText}">${label}</div>`;
        })
        .join("")}
    </div>
  `;

  const body = tasks
    .map((task, index) => {
      const offset = daysBetween(minStart, task.start_date);
      const duration = Math.max(daysBetween(task.start_date, task.end_date) + 1, 1);
      const startColumn = offset + 2;
      const endColumn = startColumn + duration;
      const percent = getStatusPercent(task.status);
      const linkEndColumn = Math.min(endColumn + 2, totalDays + 2);
      const link =
        index < tasks.length - 1 && endColumn < totalDays + 2
          ? `<div class="gantt-link" style="grid-column: ${endColumn} / ${linkEndColumn};"></div>`
          : "";
      return `
        <div class="gantt-grid gantt-task-row" style="grid-template-columns: ${gridTemplate};">
          <div class="gantt-label" title="${escapeHtml(task.title)}">
            <span class="gantt-disclosure">${index === 0 ? "▾" : ""}</span>
            <span>${escapeHtml(task.title)}</span>
          </div>
          <div class="gantt-track-lines" style="grid-column: 2 / -1;"></div>
          ${link}
          <div
            class="gantt-bar status-${task.status}"
            style="grid-column: ${startColumn} / ${endColumn};"
            title="${escapeHtml(task.title)} - ${statusLabels[task.status]} - ${task.start_date} 到 ${task.end_date}"
          >
            <span>${escapeHtml(statusLabels[task.status])}</span>
            <strong>${percent}%</strong>
          </div>
        </div>
      `;
    })
    .join("");
  gantt.innerHTML = `
    <div class="gantt-shell">
      <div class="gantt-toolbar">
        <div class="gantt-brand">
          <span class="gantt-brand-mark">≈</span>
          <div>
            <strong>FlowWise</strong>
            <span>排程</span>
          </div>
        </div>
        <div class="gantt-search">搜尋工項...</div>
        <div class="gantt-segments" aria-label="甘特圖檢視模式">
          <span>專案</span>
          <span>負責人</span>
          <span>工程</span>
        </div>
        <div class="gantt-range-controls" aria-label="甘特圖日期範圍">
          <span>${minStart}</span>
          <span>${maxEnd}</span>
          <span>套用</span>
        </div>
      </div>
      <div class="gantt-planner">
        ${header}${body}
      </div>
    </div>
  `;
}

function resetFormMode() {
  editingTaskId = null;
  form.reset();
  form.elements.start_date.value = today();
  form.elements.end_date.value = today();
  submitButton.textContent = "新增項目";
  cancelEditButton.hidden = true;
}

function startEditing(task) {
  editingTaskId = task.id;
  form.elements.title.value = task.title;
  form.elements.description.value = task.description || "";
  form.elements.owner.value = task.owner || "";
  form.elements.status.value = task.status;
  form.elements.start_date.value = task.start_date;
  form.elements.end_date.value = task.end_date;
  submitButton.textContent = "儲存修改";
  cancelEditButton.hidden = false;
  message.textContent = `正在修改：${task.title}`;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = getPayload();
    if (editingTaskId) {
      await taskStore.update(editingTaskId, payload);
      message.textContent = "修改已儲存。";
    } else {
      await taskStore.create(payload);
      message.textContent = "項目已新增。";
    }
    resetFormMode();
    await loadTasks();
  } catch (error) {
    message.textContent = error.message;
  }
});

rows.addEventListener("change", async (event) => {
  if (!event.target.matches(".status-select")) {
    return;
  }
  try {
    await taskStore.update(event.target.dataset.id, { status: event.target.value });
    await loadTasks();
  } catch (error) {
    message.textContent = error.message;
  }
});

rows.addEventListener("click", async (event) => {
  if (event.target.matches(".edit-button")) {
    const task = currentTasks.find((item) => String(item.id) === event.target.dataset.id);
    if (task) {
      startEditing(task);
    }
    return;
  }

  if (!event.target.matches(".delete-button")) {
    return;
  }

  try {
    const id = event.target.dataset.id;
    await taskStore.delete(id);
    if (String(editingTaskId) === id) {
      resetFormMode();
    }
    await loadTasks();
  } catch (error) {
    message.textContent = error.message;
  }
});

refreshButton.addEventListener("click", () => {
  loadTasks().catch((error) => {
    message.textContent = error.message;
  });
});

signInButton.addEventListener("click", async () => {
  try {
    const user = await taskStore.signIn();
    if (!user) {
      message.textContent = "正在前往 Google 登入。";
      return;
    }
    setSignedInView(user);
    message.textContent = "登入成功。";
    await loadTasks();
  } catch (error) {
    message.textContent = error.message;
    setSignedOutView();
  }
});

signOutButton.addEventListener("click", async () => {
  await taskStore.signOut();
  resetFormMode();
  setSignedOutView();
  message.textContent = "已登出。";
});

cancelEditButton.addEventListener("click", () => {
  resetFormMode();
  message.textContent = "已取消修改。";
});

resetFormMode();
setSignedOutView();
createTaskStore()
  .then(async (store) => {
    taskStore = store;
    dataSourceBadge.textContent = store.label;
    if (store.user && (!store.isAllowedUser || store.isAllowedUser(store.user))) {
      setSignedInView(store.user);
      await loadTasks();
    } else {
      setSignedOutView();
    }
  })
  .catch((error) => {
    message.textContent = error.message;
    rows.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
    gantt.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  });
