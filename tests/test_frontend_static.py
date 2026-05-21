import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendStaticTests(unittest.TestCase):
    def test_item_list_has_edit_workflow(self):
        app_js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        index_html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")

        self.assertIn("editingTaskId", app_js)
        self.assertIn("startEditing", app_js)
        self.assertIn("edit-button", app_js)
        self.assertIn("cancelEditButton", index_html)

    def test_gantt_rows_keep_track_lines_and_bars_on_same_grid_row(self):
        css = (ROOT / "static" / "styles.css").read_text(encoding="utf-8")

        self.assertIn(".gantt-track-lines", css)
        self.assertIn("grid-row: 1;", css)
        self.assertIn(".gantt-panel", css)
        self.assertIn("grid-column: 1 / -1;", css)

    def test_frontend_has_firestore_data_layer_for_github_pages(self):
        app_js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        config_js = (ROOT / "static" / "firebase-config.js").read_text(encoding="utf-8")
        index_html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")

        self.assertIn("firebasejs/12.13.0/firebase-app.js", app_js)
        self.assertIn("firebasejs/12.13.0/firebase-auth.js", app_js)
        self.assertIn("firebasejs/12.13.0/firebase-firestore.js", app_js)
        self.assertIn("class FirestoreTaskStore", app_js)
        self.assertIn("class LocalApiTaskStore", app_js)
        self.assertIn('dataMode = "firestore"', config_js)
        self.assertIn("firebaseConfig", config_js)
        self.assertIn('type="module"', index_html)

    def test_deployment_docs_cover_github_pages_and_firebase(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("GitHub Pages + Firebase", readme)
        self.assertIn("Firestore", readme)
        self.assertIn("firebase-config.js", readme)
        self.assertIn("Firebase CLI", readme)


if __name__ == "__main__":
    unittest.main()
