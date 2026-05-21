# 2026PM

專案管理程式，提供項目新增、修改、刪除、狀態管理與甘特圖。現在支援兩種資料模式：

- 本機開發：Python HTTP server + SQLite
- 網站部署：GitHub Pages 前端 + Firebase Firestore

## 目前狀態

- GitHub CLI：已確認本機有登入能力
- Firebase CLI：目前尚未安裝
- GitHub Pages：已加入 Actions 部署設定，會發布 `static/`
- Firebase：已加入 Firestore 規則與前端設定檔範本

## 本機執行

```powershell
python app.py
```

打開：

```text
http://127.0.0.1:8000
```

本機模式會使用 SQLite，資料庫位置是：

```text
data/projects.db
```

## GitHub Pages + Firebase

GitHub Pages 只負責提供靜態前端，資料會存到 Firebase Firestore。

### 1. 建立 Firebase 專案

在 Firebase Console 建立專案後，啟用：

- Firestore Database
- Authentication 的 Anonymous 匿名登入

匿名登入是目前最小可用版本，讓 Firestore 規則可以要求 `request.auth != null`，避免完全公開寫入。

### 2. 填入前端設定

編輯：

```text
static/firebase-config.js
```

把 `dataMode` 改成：

```js
export const dataMode = "firestore";
```

再把 `firebaseConfig` 換成 Firebase Console 提供的 Web app 設定。

### 3. 套用 Firestore Rules

專案已提供：

```text
firestore.rules
firebase.json
.firebaserc.example
```

正式部署規則前，需要安裝 Firebase CLI、登入 Firebase，並把 `.firebaserc.example` 複製成 `.firebaserc` 後填入 Firebase project id。

常用指令：

```powershell
firebase login
firebase deploy --only firestore:rules
```

### 4. 發布 GitHub Pages

`.github/workflows/pages.yml` 會在 push 到 `master` 後，把 `static/` 發布成 GitHub Pages。

第一次使用時仍需要到 GitHub repository 的 Pages 設定中，選擇使用 GitHub Actions 作為發布來源。

## 專案結構

```text
.
├── .github/workflows/pages.yml
├── static/
│   ├── index.html
│   ├── app.js
│   ├── firebase-config.js
│   └── styles.css
├── tests/
├── app.py
├── firestore.rules
├── firebase.json
└── README.md
```

## 後續建議

1. 建立 GitHub repository 並推送。
2. 建立 Firebase 專案。
3. 將 `static/firebase-config.js` 改成 Firestore 模式。
4. 安裝 Firebase CLI 並部署 Firestore Rules。
5. 之後若要限制特定使用者，再把 Anonymous Auth 改成 Google 登入或 Email 登入。
