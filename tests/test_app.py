import sqlite3
import tempfile
import unittest
from pathlib import Path

import app


class TaskValidationTests(unittest.TestCase):
    def test_rejects_end_date_before_start_date(self):
        with self.assertRaises(ValueError):
            app.validate_task(
                {
                    "title": "測試",
                    "start_date": "2026-05-22",
                    "end_date": "2026-05-21",
                }
            )

    def test_rejects_unknown_status(self):
        with self.assertRaises(ValueError):
            app.validate_task(
                {
                    "title": "測試",
                    "status": "blocked",
                    "start_date": "2026-05-21",
                    "end_date": "2026-05-21",
                }
            )

    def test_accepts_valid_task(self):
        data = app.validate_task(
            {
                "title": "  專案項目  ",
                "description": "作業內容",
                "owner": "PM",
                "status": "in_progress",
                "start_date": "2026-05-21",
                "end_date": "2026-05-22",
            }
        )
        self.assertEqual(data["title"], "專案項目")
        self.assertEqual(data["status"], "in_progress")

    def test_accepts_empty_end_date_as_na(self):
        data = app.validate_task(
            {
                "title": "待排程項目",
                "start_date": "2026-05-21",
                "end_date": "",
            }
        )

        self.assertEqual(data["end_date"], "")

    def test_accepts_missing_end_date(self):
        data = app.validate_task(
            {
                "title": "待排程項目",
                "start_date": "2026-05-21",
            }
        )

        self.assertNotIn("end_date", data)

    def test_accepts_na_end_date_as_empty(self):
        data = app.validate_task(
            {
                "title": "待排程項目",
                "start_date": "2026-05-21",
                "end_date": "NA",
            }
        )

        self.assertEqual(data["end_date"], "")


class DatabaseTests(unittest.TestCase):
    def test_init_db_creates_seed_tasks(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            original_data_dir = app.DATA_DIR
            original_db_path = app.DB_PATH
            try:
                app.DATA_DIR = Path(temp_dir)
                app.DB_PATH = Path(temp_dir) / "projects.db"
                app.init_db()
                conn = sqlite3.connect(app.DB_PATH)
                try:
                    count = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
                finally:
                    conn.close()
                self.assertEqual(count, 3)
            finally:
                app.DATA_DIR = original_data_dir
                app.DB_PATH = original_db_path


if __name__ == "__main__":
    unittest.main()
