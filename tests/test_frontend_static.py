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

    def test_status_filter_controls_list_and_gantt(self):
        app_js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        index_html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")

        self.assertIn("statusFilter", index_html)
        self.assertIn("getFilteredTasks", app_js)
        self.assertIn("renderFilteredTasks", app_js)
        self.assertIn("renderTable(filteredTasks", app_js)
        self.assertIn("renderGantt(filteredTasks)", app_js)

    def test_end_date_can_be_empty_and_shows_na(self):
        app_js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        index_html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")

        self.assertIn('name="end_date" type="date"', index_html)
        self.assertIn("formatEndDate", app_js)
        self.assertIn('task.end_date || "NA"', app_js)
        self.assertIn("payload.end_date && payload.end_date < payload.start_date", app_js)

    def test_date_fields_have_calendar_buttons(self):
        app_js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        index_html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
        css = (ROOT / "static" / "styles.css").read_text(encoding="utf-8")

        self.assertIn('id="startDateInput"', index_html)
        self.assertIn('data-date-picker="startDateInput"', index_html)
        self.assertIn('aria-label="選擇開始日期"', index_html)
        self.assertIn('id="endDateInput"', index_html)
        self.assertIn('data-date-picker="endDateInput"', index_html)
        self.assertIn('aria-label="選擇結束日期"', index_html)
        self.assertIn("datePickerButtons", app_js)
        self.assertIn("showPicker", app_js)
        self.assertIn(".date-field", css)
        self.assertIn("minmax(158px, 1fr) 42px", css)

    def test_refresh_button_reports_state(self):
        app_js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")

        self.assertIn('message.textContent = "正在重新整理..."', app_js)
        self.assertIn('message.textContent = "已重新整理。"', app_js)
        self.assertIn("refreshButton.disabled = true", app_js)

    def test_frontend_has_firestore_data_layer_for_github_pages(self):
        app_js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        config_js = (ROOT / "static" / "firebase-config.js").read_text(encoding="utf-8")
        index_html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")

        self.assertIn("firebasejs/12.13.0/firebase-app.js", app_js)
        self.assertIn("firebasejs/12.13.0/firebase-auth.js", app_js)
        self.assertIn("firestore.googleapis.com/v1/projects", app_js)
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

    def test_google_sign_in_restricts_to_allowed_account(self):
        app_js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        config_js = (ROOT / "static" / "firebase-config.js").read_text(encoding="utf-8")
        index_html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
        rules = (ROOT / "firestore.rules").read_text(encoding="utf-8")

        self.assertIn("GoogleAuthProvider", app_js)
        self.assertIn("signInWithPopup", app_js)
        self.assertIn("signInWithRedirect", app_js)
        self.assertIn("signOut", app_js)
        self.assertIn("allowedUserEmails", config_js)
        self.assertIn("code03721@gmail.com", config_js)
        self.assertIn("signInButton", index_html)
        self.assertIn("signOutButton", index_html)
        self.assertIn("request.auth.token.email", rules)
        self.assertIn("code03721@gmail.com", rules)

    def test_firestore_rules_allow_empty_end_date(self):
        rules = (ROOT / "firestore.rules").read_text(encoding="utf-8")

        self.assertIn("data.end_date == '' || data.end_date >= data.start_date", rules)


if __name__ == "__main__":
    unittest.main()
