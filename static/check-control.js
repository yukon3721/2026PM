import {
  allowedUserEmails,
  checkProjectId,
  checkProjectsCollection,
  firebaseConfig,
} from "./firebase-config.js";

const statusOptions = ["未填報", "未開始", "進行中", "已完成"];
const defaultCategories = ["職安查核", "營運安全查核", "系統服務指標查核", "環境衛生查核"];
const editableFields = [
  "status",
  "progress",
  "actualDateText",
  "riskNote",
  "improvementAction",
  "recheckDateText",
  "recheckResult",
];

const rows = document.querySelector("#checkRows");
const count = document.querySelector("#checkCount");
const stats = document.querySelector("#checkStats");
const message = document.querySelector("#checkMessage");
const statusFilter = document.querySelector("#checkStatusFilter");
const categoryFilter = document.querySelector("#checkCategoryFilter");
const categoryInput = document.querySelector("#checkCategoryInput");
const searchInput = document.querySelector("#checkSearchInput");
const editForm = document.querySelector("#checkEditForm");
const calendarPopover = document.querySelector("#calendarPopover");
const calendarInputs = document.querySelectorAll("[data-calendar-input]");
const refreshButton = document.querySelector("#checkRefreshButton");
const newButton = document.querySelector("#checkNewButton");
const exportButton = document.querySelector("#checkExportButton");
const importFile = document.querySelector("#checkImportFile");
const importButton = document.querySelector("#checkImportButton");
const signInButton = document.querySelector("#checkSignInButton");
const signOutButton = document.querySelector("#checkSignOutButton");
const userEmailBadge = document.querySelector("#checkUserEmailBadge");

let checkStore;
let currentItems = [];
let editingItem = null;
let activeCalendarInput = null;
let calendarMonth = new Date();

class FirestoreCheckControlStore {
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
    this.projectId = checkProjectId || "xinyi-extension-safety-1150518";
    this.collectionName = checkProjectsCollection || "checkProjects";
    this.baseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${this.collectionName}/${this.projectId}`;
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

  scalarToField(value) {
    if (typeof value === "number") {
      return { integerValue: String(value) };
    }
    if (Array.isArray(value)) {
      return { arrayValue: { values: value.map((item) => ({ stringValue: String(item) })) } };
    }
    if (value === null || value === undefined) {
      return { nullValue: null };
    }
    return { stringValue: String(value) };
  }

  toFields(payload) {
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, this.scalarToField(value)]),
    );
  }

  fieldValue(field) {
    if (!field) return "";
    if ("stringValue" in field) return field.stringValue;
    if ("integerValue" in field) return Number(field.integerValue);
    if ("doubleValue" in field) return Number(field.doubleValue);
    if ("nullValue" in field) return null;
    if ("arrayValue" in field) {
      return (field.arrayValue.values || []).map((value) => this.fieldValue(value));
    }
    return "";
  }

  fromFields(document) {
    const fields = document.fields || {};
    const value = (name) => this.fieldValue(fields[name]);
    return {
      id: document.name.split("/").at(-1),
      itemNo: value("itemNo"),
      sequence: value("sequence"),
      category: value("category"),
      focus: value("focus"),
      method: value("method"),
      supervisor: value("supervisor"),
      assigneeText: value("assigneeText"),
      assignees: value("assignees") || [],
      plannedDateText: value("plannedDateText"),
      plannedDate: value("plannedDate"),
      actualDateText: value("actualDateText"),
      actualDate: value("actualDate"),
      status: value("status") || "未填報",
      progress: value("progress"),
      riskNote: value("riskNote"),
      handlingMethod: value("handlingMethod"),
      improvementAction: value("improvementAction"),
      recheckDateText: value("recheckDateText"),
      recheckDate: value("recheckDate"),
      recheckResult: value("recheckResult"),
      attachmentUrl: value("attachmentUrl"),
    };
  }

  async listItems() {
    const body = await this.request(`${this.baseUrl}/items?orderBy=sequence`);
    return (body.documents || []).map((document) => this.fromFields(document));
  }

  async createItem(payload) {
    const user = await this.requireUser();
    const createPayload = {
      ...payload,
      sequence: payload.sequence || Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: user.email,
    };
    const result = await this.request(`${this.baseUrl}/items`, {
      method: "POST",
      body: JSON.stringify({ fields: this.toFields(createPayload) }),
    });
    const createdItem = {
      id: result.name?.split("/").at(-1) || "",
      ...createPayload,
    };
    await this.createAuditLog(createdItem, payload, user.email, "create");
    return createdItem;
  }

  async updateItem(item, payload) {
    const user = await this.requireUser();
    const params = new URLSearchParams();
    Object.keys(payload).forEach((key) => params.append("updateMask.fieldPaths", key));
    params.append("updateMask.fieldPaths", "updatedAt");
    params.append("updateMask.fieldPaths", "updatedBy");
    const updatePayload = {
      ...payload,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email,
    };
    await this.request(`${this.baseUrl}/items/${item.id}?${params.toString()}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: this.toFields(updatePayload) }),
    });
    await this.createAuditLog(item, payload, user.email, "update");
  }

  async deleteItem(item) {
    const user = await this.requireUser();
    await this.request(`${this.baseUrl}/items/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    await this.createAuditLog(item, { deletedItemNo: item.itemNo, deletedFocus: item.focus }, user.email, "delete");
  }

  async upsertProject(project, importBatchId) {
    const user = await this.requireUser();
    const payload = {
      ...project,
      importBatchId,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email,
    };
    return this.request(this.baseUrl, {
      method: "PATCH",
      body: JSON.stringify({ fields: this.toFields(payload) }),
    });
  }

  async upsertItem(item, importBatchId) {
    const user = await this.requireUser();
    const itemId = String(item.sequence || item.itemNo || Date.now()).padStart(3, "0");
    const payload = {
      ...item,
      importBatchId,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email,
    };
    return this.request(`${this.baseUrl}/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: this.toFields(payload) }),
    });
  }

  async createImportAuditLog(importBatchId, recordCount) {
    const user = await this.requireUser();
    return this.request(`${this.baseUrl}/auditLogs/import-${encodeURIComponent(importBatchId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        fields: this.toFields({
          itemId: "*",
          action: "import",
          changedFields: ["items"],
          changedBy: user.email,
          changedAt: new Date().toISOString(),
          importBatchId,
          recordCount,
        }),
      }),
    });
  }

  async importPreviewJson(preview) {
    const importBatchId = preview?.control?.items?.[0]?.importBatchId || `browser-import-${Date.now()}`;
    const items = preview?.control?.items || [];
    await this.upsertProject(preview.project || {}, importBatchId);
    for (const item of items) {
      await this.upsertItem(item, importBatchId);
    }
    await this.createImportAuditLog(importBatchId, items.length);
    return items.length;
  }

  createAuditLog(item, payload, email, action = "update") {
    return this.request(`${this.baseUrl}/auditLogs`, {
      method: "POST",
      body: JSON.stringify({
        fields: this.toFields({
          itemId: item.id,
          action,
          changedFields: Object.keys(payload),
          changedBy: email,
          changedAt: new Date().toISOString(),
        }),
      }),
    });
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getFilteredItems() {
  const status = statusFilter.value;
  const category = categoryFilter.value;
  const query = searchInput.value.trim().toLowerCase();
  return currentItems.filter((item) => {
    const matchesStatus = status === "all" || item.status === status;
    const matchesCategory = category === "all" || item.category === category;
    const haystack = [
      item.itemNo,
      item.category,
      item.focus,
      item.supervisor,
      item.assigneeText,
      item.riskNote,
      item.improvementAction,
      item.recheckResult,
    ].join(" ").toLowerCase();
    return matchesStatus && matchesCategory && (!query || haystack.includes(query));
  });
}

function renderStats(items) {
  const counts = Object.fromEntries(statusOptions.map((status) => [status, 0]));
  items.forEach((item) => {
    counts[item.status || "未填報"] = (counts[item.status || "未填報"] || 0) + 1;
  });
  stats.innerHTML = statusOptions
    .map(
      (status) => `
        <div class="stat-item">
          <span>${escapeHtml(status)}</span>
          <strong>${counts[status] || 0}</strong>
        </div>
      `,
    )
    .join("");
}

function renderCategoryOptions(items) {
  const selected = categoryFilter.value;
  const categories = [...new Set(items.map((item) => normalizeCategory(item.category)).filter(Boolean))].sort();
  categoryFilter.innerHTML = '<option value="all">全部類別</option>';
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category.replace(/\n/g, "");
    categoryFilter.append(option);
  });
  categoryFilter.value = categories.includes(selected) ? selected : "all";
  renderEditorCategoryOptions(categories);
}

function renderEditorCategoryOptions(categories = []) {
  const selected = categoryInput.value;
  const merged = [...new Set([...defaultCategories, ...categories].map(normalizeCategory).filter(Boolean))].sort();
  categoryInput.innerHTML = '<option value="">請選擇類別</option>';
  merged.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category.replace(/\n/g, "");
    categoryInput.append(option);
  });
  categoryInput.value = merged.includes(selected) ? selected : "";
}

function normalizeCategory(value) {
  return String(value || "").replace(/\s+/g, "");
}

function renderRows(items) {
  count.textContent = `${items.length} 筆項目`;
  if (!items.length) {
    rows.innerHTML = '<tr><td class="empty-state" colspan="6">目前沒有符合條件的查核項目</td></tr>';
    return;
  }
  rows.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.itemNo)}</td>
          <td>
            <div class="task-title">${escapeHtml(item.focus)}</div>
            <div class="task-description">${escapeHtml(item.category)} / ${escapeHtml(item.method)}</div>
          </td>
          <td class="check-owner-cell">
            <span class="check-owner-name">${escapeHtml(item.supervisor)}</span>
            <div class="task-description">${escapeHtml(item.assigneeText)}</div>
          </td>
          <td>${escapeHtml(item.plannedDateText || "未填")}<div class="task-description">實際：${escapeHtml(item.actualDateText || "未填")}</div></td>
          <td><span class="check-status">${escapeHtml(item.status || "未填報")}</span></td>
          <td>
            <div class="row-actions">
              <button class="edit-button" type="button" data-edit-check="${escapeHtml(item.id)}">編輯</button>
              <button class="delete-button" type="button" data-delete-check="${escapeHtml(item.id)}">刪除</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function render() {
  renderCategoryOptions(currentItems);
  const filtered = getFilteredItems();
  renderStats(currentItems);
  renderRows(filtered);
}

function fillEditForm(item) {
  editingItem = item;
  document.querySelector("#checkEditorTitle").textContent = "更新查核項目";
  document.querySelector("#checkSaveButton").textContent = "儲存更新";
  editForm.elements.id.value = item.id;
  editForm.elements.itemNo.value = item.itemNo || "";
  editForm.elements.category.value = item.category || "";
  editForm.elements.focus.value = item.focus || "";
  editForm.elements.method.value = item.method || "";
  editForm.elements.supervisor.value = item.supervisor || "";
  editForm.elements.assigneeText.value = item.assigneeText || "";
  editForm.elements.plannedDateText.value = item.plannedDateText || "";
  editForm.elements.status.value = item.status || "未填報";
  editForm.elements.progress.value = item.progress ?? "";
  editForm.elements.actualDateText.value = item.actualDateText || "";
  editForm.elements.riskNote.value = item.riskNote || "";
  editForm.elements.improvementAction.value = item.improvementAction || "";
  editForm.elements.recheckDateText.value = item.recheckDateText || "";
  editForm.elements.recheckResult.value = item.recheckResult || "";
  editForm.elements.attachmentUrl.value = item.attachmentUrl || "";
}

function clearEditForm() {
  editingItem = null;
  editForm.reset();
  renderEditorCategoryOptions(currentItems.map((item) => item.category));
  editForm.elements.status.value = "未填報";
  document.querySelector("#checkEditorTitle").textContent = "新增查核項目";
  document.querySelector("#checkSaveButton").textContent = "新增查核項目";
}

function payloadFromForm() {
  const formData = new FormData(editForm);
  const progressText = String(formData.get("progress") || "").trim();
  const assigneeText = String(formData.get("assigneeText") || "").trim();
  return {
    itemNo: String(formData.get("itemNo") || "").trim(),
    category: String(formData.get("category") || "").trim(),
    focus: String(formData.get("focus") || "").trim(),
    method: String(formData.get("method") || "").trim(),
    supervisor: String(formData.get("supervisor") || "").trim(),
    assigneeText,
    assignees: splitAssignees(assigneeText),
    plannedDateText: String(formData.get("plannedDateText") || "").trim(),
    plannedDate: null,
    status: formData.get("status") || "未填報",
    progress: progressText ? Number(progressText) : null,
    actualDateText: String(formData.get("actualDateText") || "").trim(),
    actualDate: null,
    riskNote: String(formData.get("riskNote") || "").trim(),
    handlingMethod: "",
    improvementAction: String(formData.get("improvementAction") || "").trim(),
    recheckDateText: String(formData.get("recheckDateText") || "").trim(),
    recheckDate: null,
    recheckResult: String(formData.get("recheckResult") || "").trim(),
    attachmentUrl: String(formData.get("attachmentUrl") || "").trim(),
  };
}

function splitAssignees(value) {
  return value
    .split(/[\/,，、]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseCalendarDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatCalendarDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function openCalendar(input) {
  activeCalendarInput = input;
  calendarMonth = parseCalendarDate(input.value);
  renderCalendar();
  const rect = input.getBoundingClientRect();
  calendarPopover.style.left = `${rect.left + window.scrollX}px`;
  calendarPopover.style.top = `${rect.bottom + window.scrollY + 6}px`;
  calendarPopover.hidden = false;
}

function closeCalendar() {
  calendarPopover.hidden = true;
  activeCalendarInput = null;
}

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const selectedValue = activeCalendarInput?.value || "";
  const cells = [];

  for (let index = 0; index < leadingBlanks; index += 1) {
    cells.push('<span class="calendar-day calendar-day-empty"></span>');
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const value = formatCalendarDate(date);
    const selectedClass = value === selectedValue ? " is-selected" : "";
    cells.push(`<button class="calendar-day${selectedClass}" type="button" data-calendar-date="${value}">${day}</button>`);
  }

  calendarPopover.innerHTML = `
    <div class="calendar-header">
      <button type="button" data-calendar-nav="-1" aria-label="上一個月">‹</button>
      <strong>${year} / ${String(month + 1).padStart(2, "0")}</strong>
      <button type="button" data-calendar-nav="1" aria-label="下一個月">›</button>
    </div>
    <div class="calendar-weekdays">
      <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
    </div>
    <div class="calendar-grid">${cells.join("")}</div>
  `;
}

function exportChecksToCsv(items) {
  const headers = ["項次", "類別", "查核重點", "主管", "執行人員", "預計完成日", "實際完成日", "辦理狀態", "完成率", "異常/風險說明", "改善措施", "複查日期", "複查結果", "相關檔案連結"];
  const rowsForCsv = items.map((item) => [
    item.itemNo,
    item.category,
    item.focus,
    item.supervisor,
    item.assigneeText,
    item.plannedDateText,
    item.actualDateText,
    item.status,
    item.progress ?? "",
    item.riskNote,
    item.improvementAction,
    item.recheckDateText,
    item.recheckResult,
    item.attachmentUrl,
  ]);
  return [headers, ...rowsForCsv]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function downloadCsv() {
  const csv = exportChecksToCsv(getFilteredItems());
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "通車前查核管控匯出.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (error) {
        reject(new Error("JSON 檔案格式無法解析。"));
      }
    });
    reader.addEventListener("error", () => reject(new Error("讀取 JSON 檔案失敗。")));
    reader.readAsText(file, "utf-8");
  });
}

function formatAuthError(error) {
  const code = error?.code || "";
  const rawMessage = error?.message || String(error);
  if (code === "auth/unauthorized-domain" || rawMessage.includes("unauthorized-domain")) {
    return "目前網址未列入 Firebase Authentication 的 Authorized domains。請到 Firebase Console > Authentication > Settings > Authorized domains，加入 localhost、127.0.0.1，以及正式 GitHub Pages 網域。";
  }
  if (code === "auth/popup-blocked") {
    return "瀏覽器阻擋 Google 登入視窗，請允許此網站彈出視窗後再試一次。";
  }
  if (code === "auth/operation-not-allowed") {
    return "Firebase Authentication 尚未啟用 Google 登入，請到 Firebase Console 啟用 Google provider。";
  }
  return rawMessage;
}

async function loadItems() {
  message.textContent = "正在讀取資料...";
  currentItems = await checkStore.listItems();
  render();
  message.textContent = "已重新整理。";
}

async function init() {
  checkStore = new FirestoreCheckControlStore();
  try {
    await checkStore.init();
    const user = checkStore.user || (await checkStore.waitForAuthState());
    if (checkStore.isAllowedUser(user)) {
      userEmailBadge.hidden = false;
      userEmailBadge.textContent = user.email;
      signInButton.hidden = true;
      signOutButton.hidden = false;
      await loadItems();
    } else {
      message.textContent = "請先使用授權的 Google 帳號登入。";
    }
  } catch (error) {
    message.textContent = formatAuthError(error);
  }
}

signInButton.addEventListener("click", async () => {
  try {
    const user = await checkStore.signIn();
    if (user) {
      userEmailBadge.hidden = false;
      userEmailBadge.textContent = user.email;
      signInButton.hidden = true;
      signOutButton.hidden = false;
      await loadItems();
    }
  } catch (error) {
    message.textContent = formatAuthError(error);
  }
});

signOutButton.addEventListener("click", async () => {
  await checkStore.signOut();
  userEmailBadge.hidden = true;
  signInButton.hidden = false;
  signOutButton.hidden = true;
  currentItems = [];
  render();
  message.textContent = "已登出。";
});

refreshButton.addEventListener("click", () => {
  loadItems().catch((error) => {
    message.textContent = error.message;
  });
});

rows.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-check]");
  if (editButton) {
    const item = currentItems.find((candidate) => candidate.id === editButton.dataset.editCheck);
    if (item) fillEditForm(item);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-check]");
  if (deleteButton) {
    const item = currentItems.find((candidate) => candidate.id === deleteButton.dataset.deleteCheck);
    if (!item) return;
    const confirmed = window.confirm(`確定刪除「${item.itemNo} ${item.focus}」？`);
    if (!confirmed) return;
    checkStore
      .deleteItem(item)
      .then(loadItems)
      .then(() => {
        clearEditForm();
        message.textContent = "已刪除查核項目。";
      })
      .catch((error) => {
        message.textContent = error.message;
      });
  }
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = payloadFromForm();
  if (!payload.itemNo || !payload.category || !payload.focus) {
    message.textContent = "請填寫項次、類別與查核重點。";
    return;
  }
  try {
    const successMessage = editingItem ? "已儲存更新。" : "已新增查核項目。";
    if (editingItem) {
      await checkStore.updateItem(editingItem, payload);
    } else {
      await checkStore.createItem(payload);
    }
    clearEditForm();
    await loadItems();
    message.textContent = successMessage;
  } catch (error) {
    message.textContent = error.message;
  }
});

newButton.addEventListener("click", clearEditForm);
document.querySelector("#checkCancelButton").addEventListener("click", clearEditForm);
statusFilter.addEventListener("change", render);
categoryFilter.addEventListener("change", render);
searchInput.addEventListener("input", render);
exportButton.addEventListener("click", downloadCsv);
calendarInputs.forEach((input) => {
  input.addEventListener("focus", () => openCalendar(input));
  input.addEventListener("click", () => openCalendar(input));
});
calendarPopover.addEventListener("click", (event) => {
  const navButton = event.target.closest("[data-calendar-nav]");
  if (navButton) {
    calendarMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + Number(navButton.dataset.calendarNav),
      1,
    );
    renderCalendar();
    return;
  }

  const dayButton = event.target.closest("[data-calendar-date]");
  if (dayButton && activeCalendarInput) {
    activeCalendarInput.value = dayButton.dataset.calendarDate;
    activeCalendarInput.dispatchEvent(new Event("change", { bubbles: true }));
    closeCalendar();
  }
});
document.addEventListener("click", (event) => {
  if (
    calendarPopover.hidden ||
    calendarPopover.contains(event.target) ||
    event.target.closest("[data-calendar-input]")
  ) {
    return;
  }
  closeCalendar();
});
importButton.addEventListener("click", async () => {
  const file = importFile.files?.[0];
  if (!file) {
    message.textContent = "請先選擇 JSON 預覽檔。";
    return;
  }
  try {
    message.textContent = "正在匯入 Firestore...";
    const preview = await readJsonFile(file);
    const count = await checkStore.importPreviewJson(preview);
    await loadItems();
    message.textContent = `已匯入 ${count} 筆查核項目。`;
  } catch (error) {
    message.textContent = error.message;
  }
});

clearEditForm();
init();
