from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from contextlib import contextmanager
import json
import os
import sqlite3
from datetime import date
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "projects.db"
STATIC_DIR = ROOT / "static"


STATUSES = {"todo", "in_progress", "done", "closed"}


def connect_db():
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db_connection():
    conn = connect_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                owner TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'todo',
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        count = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        if count == 0:
            today = date.today().isoformat()
            conn.executemany(
                """
                INSERT INTO tasks
                    (title, description, owner, status, start_date, end_date)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    ("需求整理", "確認專案管理工具的欄位與流程。", "PM", "done", today, today),
                    ("資料庫設計", "建立 SQLite 任務資料表與 API。", "Dev", "in_progress", today, today),
                    ("甘特圖介面", "完成時間軸、狀態顏色與新增刪除操作。", "Dev", "todo", today, today),
                ],
            )


def task_to_dict(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "owner": row["owner"],
        "status": row["status"],
        "start_date": row["start_date"],
        "end_date": row["end_date"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def read_json(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    if length == 0:
        return {}
    try:
        return json.loads(handler.rfile.read(length).decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("JSON 格式不正確") from exc


def validate_task(payload, partial=False):
    data = {}
    required = ["title", "start_date"] if not partial else []

    for field in required:
        if not str(payload.get(field, "")).strip():
            raise ValueError(f"{field} 是必填欄位")

    if "title" in payload:
        title = str(payload["title"]).strip()
        if not title:
            raise ValueError("title 不可空白")
        data["title"] = title

    for field in ["description", "owner"]:
        if field in payload:
            data[field] = str(payload.get(field, "")).strip()

    if "status" in payload:
        status = str(payload["status"])
        if status not in STATUSES:
            raise ValueError("status 必須是 todo、in_progress、done 或 closed")
        data["status"] = status

    for field in ["start_date", "end_date"]:
        if field in payload:
            value = str(payload[field]).strip()
            if field == "end_date" and value.upper() == "NA":
                data[field] = ""
                continue
            if field == "end_date" and not value:
                data[field] = ""
                continue
            try:
                date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError(f"{field} 必須是 YYYY-MM-DD") from exc
            data[field] = value

    start = data.get("start_date", payload.get("start_date"))
    end = data.get("end_date", payload.get("end_date"))
    if start and end and str(start) > str(end):
        raise ValueError("結束日期不可早於開始日期")

    return data


class ProjectHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def send_json(self, status, body):
        encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def send_error_json(self, status, message):
        self.send_json(status, {"error": message})

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/tasks":
            with db_connection() as conn:
                rows = conn.execute(
                    "SELECT * FROM tasks ORDER BY start_date, id"
                ).fetchall()
            self.send_json(200, [task_to_dict(row) for row in rows])
            return

        if path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/tasks":
            self.send_error_json(404, "找不到 API")
            return

        try:
            payload = read_json(self)
            data = validate_task(payload)
        except ValueError as exc:
            self.send_error_json(400, str(exc))
            return

        with db_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO tasks
                    (title, description, owner, status, start_date, end_date)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    data["title"],
                    data.get("description", ""),
                    data.get("owner", ""),
                    data.get("status", "todo"),
                    data["start_date"],
                    data.get("end_date", ""),
                ),
            )
            row = conn.execute(
                "SELECT * FROM tasks WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        self.send_json(201, task_to_dict(row))

    def do_PATCH(self):
        path = urlparse(self.path).path
        parts = path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["api", "tasks"]:
            self.send_error_json(404, "找不到 API")
            return

        try:
            task_id = int(parts[2])
            payload = read_json(self)
            existing = self.get_task(task_id)
            if not existing:
                self.send_error_json(404, "找不到項目")
                return
            merged = {**task_to_dict(existing), **payload}
            data = validate_task(merged, partial=True)
        except ValueError as exc:
            self.send_error_json(400, str(exc))
            return

        if not data:
            self.send_json(200, task_to_dict(existing))
            return

        assignments = ", ".join([f"{key} = ?" for key in data])
        values = list(data.values()) + [task_id]
        with db_connection() as conn:
            conn.execute(
                f"""
                UPDATE tasks
                SET {assignments}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                values,
            )
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        self.send_json(200, task_to_dict(row))

    def do_DELETE(self):
        path = urlparse(self.path).path
        parts = path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["api", "tasks"]:
            self.send_error_json(404, "找不到 API")
            return

        try:
            task_id = int(parts[2])
        except ValueError:
            self.send_error_json(400, "項目 id 不正確")
            return

        with db_connection() as conn:
            cursor = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        if cursor.rowcount == 0:
            self.send_error_json(404, "找不到項目")
            return
        self.send_json(200, {"ok": True})

    def get_task(self, task_id):
        with db_connection() as conn:
            return conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()


def main():
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), ProjectHandler)
    print(f"Project manager running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
