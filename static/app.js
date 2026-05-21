import { dataMode, firebaseConfig, tasksCollection, useAnonymousAuth } from "./firebase-config.js";

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

let editingTaskId = null;
let currentTasks = [];
let taskStore;

class LocalApiTaskStore {
  label = "本機 SQLite";

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
    const app = appModule.initializeApp(firebaseConfig);
    this.auth = authModule.getAuth(app);
    if (useAnonymousAuth && !this.auth.currentUser) {
      await authModule.signInAnonymously(this.auth);
    }
    this.collectionName = tasksCollection || "tasks";
    this.baseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${this.collectionName}`;
  }

  async headers() {
    const token = await this.auth.currentUser.getIdToken();
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

function getPayload() {
  const payload = Object.fromEntries(new FormData(form).entries());
  if (payload.end_date < payload.start_date) {
    throw new Error("結束日期不能早於開始日期。");
  }
  return payload;
}

async function createTaskStore() {
  if (dataMode === "firestore") {
    const store = new FirestoreTaskStore();
    await store.init();
    return store;
  }
  return new LocalApiTaskStore();
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
  const gridTemplate = `180px repeat(${totalDays}, minmax(44px, 1fr))`;

  const header = `
    <div class="gantt-grid gantt-header-row" style="grid-template-columns: ${gridTemplate};">
      <div class="gantt-corner">項目</div>
      ${dayColumns
        .map((dateText) => `<div class="gantt-day" title="${dateText}">${formatShortDate(dateText)}</div>`)
        .join("")}
    </div>
  `;

  const body = tasks
    .map((task) => {
      const offset = daysBetween(minStart, task.start_date);
      const duration = Math.max(daysBetween(task.start_date, task.end_date) + 1, 1);
      const startColumn = offset + 2;
      const endColumn = startColumn + duration;
      return `
        <div class="gantt-grid gantt-task-row" style="grid-template-columns: ${gridTemplate};">
          <div class="gantt-label" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</div>
          <div class="gantt-track-lines" style="grid-column: 2 / -1;"></div>
          <div
            class="gantt-bar status-${task.status}"
            style="grid-column: ${startColumn} / ${endColumn};"
            title="${escapeHtml(task.title)} - ${statusLabels[task.status]} - ${task.start_date} 到 ${task.end_date}"
          >
            ${escapeHtml(statusLabels[task.status])}
          </div>
        </div>
      `;
    })
    .join("");
  gantt.innerHTML = header + body;
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

cancelEditButton.addEventListener("click", () => {
  resetFormMode();
  message.textContent = "已取消修改。";
});

resetFormMode();
createTaskStore()
  .then((store) => {
    taskStore = store;
    dataSourceBadge.textContent = store.label;
    return loadTasks();
  })
  .catch((error) => {
    message.textContent = error.message;
    rows.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
    gantt.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  });
