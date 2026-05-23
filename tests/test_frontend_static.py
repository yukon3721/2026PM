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
        self.assertIn("minmax(0, 1fr) 42px", css)

    def test_workspace_columns_have_layout_bounds(self):
        css = (ROOT / "static" / "styles.css").read_text(encoding="utf-8")

        self.assertIn("minmax(360px, 520px) minmax(420px, 680px)", css)
        self.assertIn("max-width: 680px", css)
        self.assertIn("max-width: 1224px", css)
        self.assertIn("min-width: 0", css)

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

    def test_check_control_static_page_has_management_workflow(self):
        html = (ROOT / "static" / "check-control.html").read_text(encoding="utf-8")
        app_js = (ROOT / "static" / "check-control.js").read_text(encoding="utf-8")
        css = (ROOT / "static" / "styles.css").read_text(encoding="utf-8")
        config_js = (ROOT / "static" / "firebase-config.js").read_text(encoding="utf-8")
        rules = (ROOT / "firestore.rules").read_text(encoding="utf-8")

        self.assertIn("通車前查核管控", html)
        self.assertIn('id="checkStatusFilter"', html)
        self.assertIn('id="checkCategoryFilter"', html)
        self.assertIn('id="checkSearchInput"', html)
        self.assertIn('id="checkRows"', html)
        self.assertIn('id="checkEditForm"', html)
        self.assertIn('id="checkNewButton"', html)
        self.assertIn('name="itemNo"', html)
        self.assertIn('name="category"', html)
        self.assertIn('id="checkCategoryInput"', html)
        self.assertIn('name="supervisor"', html)
        self.assertIn('name="plannedDateText" data-calendar-input', html)
        self.assertIn('name="actualDateText" data-calendar-input', html)
        self.assertIn('name="recheckDateText" data-calendar-input', html)
        self.assertIn('id="calendarPopover"', html)
        self.assertNotIn('<option value="待複查">待複查</option>', html)
        self.assertNotIn('<option value="有異常">有異常</option>', html)
        self.assertIn('id="checkImportFile"', html)
        self.assertIn('id="checkImportButton"', html)
        self.assertIn("./check-control.js", html)

        self.assertIn("class FirestoreCheckControlStore", app_js)
        self.assertIn("checkProjects", app_js)
        self.assertIn("auditLogs", app_js)
        self.assertIn("importPreviewJson", app_js)
        self.assertIn("createItem", app_js)
        self.assertIn("deleteItem", app_js)
        self.assertIn("data-delete-check", app_js)
        self.assertIn("新增查核項目", app_js)
        self.assertIn("defaultCategories", app_js)
        self.assertIn("normalizeCategory", app_js)
        self.assertIn("renderEditorCategoryOptions", app_js)
        self.assertIn("renderEditorCategoryOptions(currentItems", app_js)
        self.assertIn("renderCalendar", app_js)
        self.assertIn("openCalendar", app_js)
        self.assertIn("data:image/svg+xml", html)
        self.assertIn(".calendar-popover", css)
        self.assertIn(".calendar-day", css)
        self.assertIn("upsertItem", app_js)
        self.assertIn("formatAuthError", app_js)
        self.assertIn("Authorized domains", app_js)
        self.assertIn("exportChecksToCsv", app_js)
        self.assertIn("未填報", app_js)
        self.assertIn("check-owner-cell", app_js)
        self.assertIn(".check-owner-cell", css)

        self.assertIn("checkProjectId", config_js)
        self.assertIn("match /checkProjects/{projectId}", rules)
        self.assertIn("match /items/{itemId}", rules)
        self.assertIn("allow delete: if isOwner();", rules)
        self.assertIn("data.status in ['未填報', '未開始', '進行中', '已完成']", rules)
        self.assertNotIn("'待複查'", rules)
        self.assertNotIn("'有異常'", rules)
        self.assertIn("match /auditLogs/{logId}", rules)
        self.assertIn("isValidCheckItem", rules)
        self.assertIn("'importBatchId'", rules)
        self.assertIn("'recordCount'", rules)


if __name__ == "__main__":
    unittest.main()
