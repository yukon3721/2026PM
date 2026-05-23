# 通車前查核管控網站規格草案

## 來源檔案

- `F:\0000_餵\通車前查核管控表_安全衛生處-1150518(填報說明).csv`
- `F:\0000_餵\通車前查核管控表_安全衛生處-1150518(管控總表).csv`

本文件只做資料盤點與網站規格，不匯入 Firebase，也不修改現有前端程式。

## CSV 盤點結果

### 填報說明

用途：作為欄位填寫規則、狀態選項與前端提示文字來源。

欄位：

| 欄位 | 說明 |
| --- | --- |
| 預計完成日 | 依時程填入 |
| 實際完成日 | 實際完成後由執行人員填入日期 |
| 辦理狀態 | 從下拉選單選擇：未開始 / 進行中 / 已完成 / 待複查 / 有異常 |
| 完成率 | 以百分比填入，例如 50%、100% |
| 異常/風險說明 | 若發現缺失、異常或無法如期完成，請詳填說明 |
| 改善措施 | 針對異常說明填入具體改善行動及負責人 |
| 複查日期 | 職安查核第 2 次或其他複查時填入 |
| 複查結果 | 填入複查後確認狀況，例如合格、仍有缺失、已改善 |

狀態選項：

- `未開始`
- `進行中`
- `已完成`
- `待複查`
- `有異常`

### 管控總表

用途：網站主要管理資料，每列轉成一筆查核項目。

有效資料列：12 筆。

主要欄位：

| 原始欄位 | 建議 Firestore 欄位 | 型態 | 說明 |
| --- | --- | --- | --- |
| 項次 | itemNo | string | 原表項次，可能有 `2-1`、`4-2` 等格式 |
| 類別 | category | string | 查核分類 |
| 查核重點 | focus | string | 多行文字 |
| 檢查方式 | method | string | 現場查察、書面查核、儀器量測等 |
| 主管 | supervisor | string | 主管姓名或代碼 |
| 執行人員 | assignees | array/string | 可能有多名人員，建議匯入時切成陣列 |
| 預計完成日 | plannedDateText / plannedDate | string / timestamp | 原始日期格式不一致，需保留文字並盡量解析日期 |
| 實際完成日 | actualDateText / actualDate | string / timestamp | 可空白 |
| 辦理狀態 | status | string | 建議限制為固定選項 |
| 完成率 | progress | number | `100%` 轉成 `100`，空白可視為 0 或 null |
| 異常/風險說明 | riskNote | string | 多行文字 |
| 辦理方式 | handlingMethod | string | 多行文字 |
| 改善措施 | improvementAction | string | 可空白 |
| 複查日期 | recheckDateText / recheckDate | string / timestamp | 可空白 |
| 複查結果 | recheckResult | string | 可空白 |
| 相關檔案連結 | attachmentUrl | string | SharePoint 連結 |

狀態分布：

| 狀態 | 筆數 |
| --- | ---: |
| 未開始 | 5 |
| 進行中 | 3 |
| 已完成 | 3 |
| 空白 | 1 |

分類分布：

| 分類 | 筆數 |
| --- | ---: |
| 職安查核 | 3 |
| 營運安全查核 | 4 |
| 系統服務指標查核 | 3 |
| 環境衛生查核 | 2 |

## 資料清理規則

1. 管控總表前兩列是標題與提醒文字，不匯入為資料。
2. 欄位列從 `項次, 類別, 查核重點...` 開始。
3. 原表使用合併儲存格，導致部分列的 `項次`、`類別` 空白；匯入時要做向下補值。
4. 但同一 `項次` 底下可能有多個子項，例如 `項次 1` 有第 1 次、第 2 次、第 3 次查核；Firestore 文件 ID 不可只用 `項次`。
5. 建議文件 ID 使用 `importBatchId + rowIndex` 或 `itemNo + sequence`。
6. `預計完成日` 格式混用，例如 `5/15/2026`、`2026-05-25`、`2026年6月底`、`預計履勘前(2026.6上旬)`、`配合捷運局`。需同時保留原始文字與可解析日期。
7. 有兩筆預計完成日為 `2025/6/30`，但本案檔名與其他資料指向 2026 年，實作前需人工確認是否為年度誤植。
8. 有一筆實際完成日為 `2025/5/12`，但預計完成日是 `5/12/2026`，實作前需人工確認。
9. `辦理狀態` 空白的資料建議匯入時標記為 `未填報`，不要自動改成 `未開始`。
10. `完成率` 空白時不自動推算，除非狀態為 `已完成` 且完成率空白，才可提示使用者補填。
11. `執行人員` 可能用 `/` 或 `,` 分隔，匯入時可拆為陣列，但畫面仍保留原始顯示文字。
12. SharePoint 連結可能需要公司帳號權限；網站只保存連結，不搬移檔案。

## 建議 Firestore 結構

```text
checkProjects/{projectId}
checkProjects/{projectId}/items/{itemId}
checkProjects/{projectId}/settings/statusOptions
checkProjects/{projectId}/imports/{importBatchId}
checkProjects/{projectId}/auditLogs/{logId}
```

### checkProjects

```js
{
  name: "信義線延伸段通車前查核項目管控表（安全衛生處）",
  department: "安全衛生處",
  sourceFileDate: "1150518",
  milestoneText: "5/15初勘，暫定6月中旬履勘，暫定6月底通車",
  createdAt,
  updatedAt
}
```

### items

```js
{
  itemNo: "2-1",
  sequence: 4,
  category: "營運安全查核",
  focus: "1. 土木建築\n2. 軌道工程...",
  method: "書面查核",
  supervisor: "...",
  assigneeText: "...",
  assignees: ["..."],
  plannedDateText: "2026-05-25",
  plannedDate: Timestamp,
  actualDateText: "",
  actualDate: null,
  status: "進行中",
  progress: null,
  riskNote: "",
  handlingMethod: "...",
  improvementAction: "",
  recheckDateText: "",
  recheckDate: null,
  recheckResult: "",
  attachmentUrl: "...",
  sourceRowIndex: 4,
  importBatchId: "...",
  createdAt,
  updatedAt,
  updatedBy
}
```

### auditLogs

```js
{
  itemId: "...",
  action: "update",
  changedFields: ["status", "progress", "riskNote"],
  before: {},
  after: {},
  changedAt,
  changedBy
}
```

## 第一版網站功能

第一版目標是取代人工開 CSV 管控，而不是做複雜流程系統。

必做：

1. Google 登入。
2. 查核項目清單。
3. 依狀態、類別、主管、執行人員篩選。
4. 關鍵字搜尋查核重點、異常風險、改善措施。
5. 編輯辦理狀態、完成率、實際完成日、異常風險、改善措施、複查日期、複查結果。
6. 顯示統計：總件數、未開始、進行中、已完成、有異常、空白未填報。
7. 逾期提示：可解析的預計完成日小於今天，且狀態不是已完成。
8. 修改紀錄 audit log。
9. 匯出目前篩選結果為 CSV。

第二版再做：

1. CSV 重新匯入與差異比對。
2. 多專案管理。
3. 權限分層：管理者、編輯者、只讀者。
4. 附件上傳或雲端檔案索引。
5. 甘特圖或時程看板。

## 權限建議

GitHub Pages 前端程式是公開的，因此安全必須靠 Firebase Rules。

第一版建議：

- 所有使用者都必須登入。
- 只允許白名單 email 讀取與寫入。
- 寫入時強制留下 `updatedBy` 與 `updatedAt`。
- 不把原始 CSV 放進公開 repo。

角色規劃：

| 角色 | 權限 |
| --- | --- |
| admin | 匯入、編輯、刪除、匯出、管理白名單 |
| editor | 編輯查核項目、匯出 |
| viewer | 只能查看 |

## 實作順序建議

1. 先確認資料清理規則，特別是 2025/2026 日期疑點與空白狀態處理。
2. 建立匯入工具，將 CSV 轉為標準 JSON，先不寫入 Firestore。
3. 人工檢查 JSON 預覽。
4. 建立 Firestore collection 與 Rules。
5. 匯入第一批資料。
6. 建立 GitHub Pages 前端管理介面。
7. 測試登入、查詢、編輯、匯出與 audit log。

## JSON 預覽工具

已新增本機預覽工具：

```powershell
python -m tools.check_control_import.importer `
  --control-csv "F:\0000_餵\通車前查核管控表_安全衛生處-1150518(管控總表).csv" `
  --instructions-csv "F:\0000_餵\通車前查核管控表_安全衛生處-1150518(填報說明).csv" `
  --output "G:\我的雲端硬碟\2026PM\data\check-control-preview.json" `
  --import-batch-id "safety-1150518-preview"
```

輸出檔位於 `data/check-control-preview.json`。`data/` 已在 `.gitignore` 中，不應提交到 Git。

目前預覽結果：

- 查核資料：12 筆
- 狀態分布：已完成 3、進行中 3、未開始 5、未填報 1
- 空白 `項次` 與 `類別` 已向下補值
- 空白 `辦理狀態` 已標記為 `未填報`
- 可解析日期會另存 ISO 日期，例如 `5/15/2026` 轉為 `2026-05-15`
- 無法可靠解析的時程文字會保留原文，例如 `預計履勘前(2026.6上旬)`、`配合捷運局`

## 已確認決策

- `2025/6/30`、`2025/5/12` 不改，保留原始年份。
- 空白辦理狀態維持顯示為 `未填報`。

## 第三階段最小頁面

已新增靜態頁面：

- `static/check-control.html`
- `static/check-control.js`

目前頁面能力：

- 使用同一組 Firebase Google 登入與白名單 email。
- 讀取 `checkProjects/{projectId}/items`。
- 支援狀態、類別與關鍵字篩選。
- 顯示狀態統計。
- 可編輯辦理狀態、完成率、實際完成日、異常風險、改善措施、複查日期與複查結果。
- 每次更新會新增 `auditLogs` 紀錄。
- 可匯出目前篩選結果為 CSV。
- 主頁 `static/index.html` 已加入 `查核管控` 入口。

尚未執行：

- 尚未將 JSON 預覽資料匯入 Firestore。
- 尚未部署 GitHub Pages。

## 第四階段進度

已完成：

- Firestore Rules 已部署到 `pm-2026pm`。
- 已產生 Firestore REST commit payload：`data/check-control-firestore-writes.json`。
- 已新增網頁端 JSON 匯入流程，避免在命令列輸出或轉存 OAuth token。

目前匯入方式：

1. 開啟 `http://127.0.0.1:8026/check-control.html` 或部署後的 GitHub Pages 頁面。
2. 使用授權 Google 帳號登入。
3. 在「匯入 JSON 預覽」選擇 `G:\我的雲端硬碟\2026PM\data\check-control-preview.json`。
4. 點選「匯入 Firestore」。
5. 匯入完成後會讀取 `checkProjects/xinyi-extension-safety-1150518/items` 並顯示 12 筆查核項目。

未直接用命令列匯入的原因：目前本機只有 Firebase CLI 登入狀態，沒有 `gcloud` 或 Application Default Credentials；直接列印 OAuth access token 會暴露憑證，因此改由登入後的瀏覽器頁面使用 Firebase ID token 匯入。

### Google 登入失敗排查

已確認本機登入失敗原因：Firebase Authentication 的 Authorized domains 未包含目前測試網域。瀏覽器 console 訊息為目前網域未授權 OAuth 操作。

需要在 Firebase Console 設定：

1. 開啟 Firebase Console。
2. 進入 `pm-2026pm` 專案。
3. 到 Authentication > Settings > Authorized domains。
4. 加入以下網域：
   - `localhost`
   - `127.0.0.1`
   - `yukon3721.github.io`

`yukon3721.github.io` 是 GitHub Pages 正式部署時需要的網域；Authorized domains 只填網域，不含 `https://`、port 或路徑。

## 需要使用者確認的決策

1. 是否只有你的 Google 帳號能管理，還是要加入多位同仁？
2. 原始 SharePoint 連結是否只顯示連結，不搬移附件？
3. 網站是否要放在既有 `2026PM` GitHub Pages，還是另開一個專案頁？
