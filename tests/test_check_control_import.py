import tempfile
import unittest
from pathlib import Path

from tools.check_control_import import importer
from tools.check_control_import import firestore_upload


class CheckControlImportTests(unittest.TestCase):
    def test_parse_control_csv_normalizes_rows_and_preserves_date_text(self):
        csv_text = (
            "信義線延伸段通車前查核項目管控表（安全衛生處）,,,,\n"
            '"提醒文字\n含換行",,,,\n'
            "項次,類別,查核重點,檢查方式,主管,執行人員,預計完成日,實際完成日,辦理狀態,完成率,異常/風險說明,辦理方式,改善措施,複查日期,複查結果,相關檔案連結\n"
            "1,職安查核,第1次查核,現場查察,黃建成,黃乾隆,5/15/2026,5/15/2026,已完成,100%,風險,辦理,改善,,,https://example.com/a\n"
            ",,第2次查核,現場查察,黃建成,黃乾隆,預計履勘前(2026.6上旬),,,,,辦理,,,,https://example.com/b\n"
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "control.csv"
            path.write_text(csv_text, encoding="utf-8")

            result = importer.parse_control_csv(path)

        self.assertEqual(result["recordCount"], 2)
        first, second = result["items"]
        self.assertEqual(first["itemNo"], "1")
        self.assertEqual(first["category"], "職安查核")
        self.assertEqual(first["plannedDateText"], "5/15/2026")
        self.assertEqual(first["plannedDate"], "2026-05-15")
        self.assertEqual(first["actualDate"], "2026-05-15")
        self.assertEqual(first["status"], "已完成")
        self.assertEqual(first["progress"], 100)

        self.assertEqual(second["itemNo"], "1")
        self.assertEqual(second["category"], "職安查核")
        self.assertEqual(second["status"], "未填報")
        self.assertEqual(second["plannedDateText"], "預計履勘前(2026.6上旬)")
        self.assertIsNone(second["plannedDate"])

    def test_parse_instructions_csv_extracts_fields_and_status_options(self):
        csv_text = (
            "填報說明,\n"
            "欄位,說明\n"
            "預計完成日,依時程填入\n"
            "辦理狀態,從下拉選單選擇：未開始 / 進行中 / 已完成 / 待複查 / 有異常\n"
            ",\n"
            "辦理狀態定義,\n"
            "未開始,尚未啟動\n"
            "進行中,已開始執行但尚未完成\n"
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "instructions.csv"
            path.write_text(csv_text, encoding="utf-8")

            result = importer.parse_instructions_csv(path)

        self.assertEqual(result["fields"]["預計完成日"], "依時程填入")
        self.assertEqual(result["fields"]["辦理狀態"], "從下拉選單選擇：未開始 / 進行中 / 已完成 / 待複查 / 有異常")
        self.assertEqual(
            result["statusOptions"],
            [
                {"value": "未開始", "description": "尚未啟動"},
                {"value": "進行中", "description": "已開始執行但尚未完成"},
            ],
        )

    def test_build_firestore_writes_uses_project_items_and_audit_log_paths(self):
        preview = {
            "project": {
                "name": "信義線延伸段通車前查核項目管控表（安全衛生處）",
                "department": "安全衛生處",
                "sourceFileDate": "1150518",
            },
            "control": {
                "items": [
                    {
                        "sequence": 1,
                        "itemNo": "1",
                        "category": "職安查核",
                        "focus": "第1次查核",
                        "status": "已完成",
                        "progress": 100,
                        "plannedDateText": "5/15/2026",
                        "plannedDate": "2026-05-15",
                        "actualDateText": "",
                        "actualDate": None,
                        "assignees": ["黃乾隆"],
                    }
                ]
            },
        }

        writes = firestore_upload.build_firestore_writes(
            preview,
            project_id="pm-2026pm",
            check_project_id="xinyi-extension-safety-1150518",
            import_batch_id="safety-1150518-preview",
            changed_by="code03721@gmail.com",
        )

        self.assertEqual(len(writes), 3)
        document_names = [write["update"]["name"] for write in writes]
        self.assertIn(
            "projects/pm-2026pm/databases/(default)/documents/checkProjects/xinyi-extension-safety-1150518",
            document_names,
        )
        self.assertIn(
            "projects/pm-2026pm/databases/(default)/documents/checkProjects/xinyi-extension-safety-1150518/items/001",
            document_names,
        )
        self.assertIn(
            "projects/pm-2026pm/databases/(default)/documents/checkProjects/xinyi-extension-safety-1150518/auditLogs/import-safety-1150518-preview",
            document_names,
        )

        item_write = writes[1]["update"]["fields"]
        self.assertEqual(item_write["status"]["stringValue"], "已完成")
        self.assertEqual(item_write["progress"]["integerValue"], "100")
        self.assertEqual(item_write["plannedDate"]["stringValue"], "2026-05-15")
        self.assertEqual(
            item_write["assignees"]["arrayValue"]["values"],
            [{"stringValue": "黃乾隆"}],
        )


if __name__ == "__main__":
    unittest.main()
