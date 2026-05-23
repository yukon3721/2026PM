import argparse
import json
import os
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def firestore_value(value):
    if value is None:
        return {"nullValue": None}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, list):
        return {"arrayValue": {"values": [firestore_value(item) for item in value]}}
    if isinstance(value, dict):
        return {"mapValue": {"fields": firestore_fields(value)}}
    return {"stringValue": str(value)}


def firestore_fields(payload):
    return {key: firestore_value(value) for key, value in payload.items()}


def document_name(project_id, *path_parts):
    path = "/".join(str(part).strip("/") for part in path_parts)
    return f"projects/{project_id}/databases/(default)/documents/{path}"


def item_document_id(item):
    sequence = item.get("sequence")
    if isinstance(sequence, int):
        return f"{sequence:03d}"
    return str(sequence or item.get("itemNo") or "item").replace("/", "-")


def build_firestore_writes(preview, project_id, check_project_id, import_batch_id, changed_by):
    now = datetime.now(timezone.utc).isoformat()
    project_payload = {
        **preview.get("project", {}),
        "importBatchId": import_batch_id,
        "updatedAt": now,
        "updatedBy": changed_by,
    }
    writes = [
        {
            "update": {
                "name": document_name(project_id, "checkProjects", check_project_id),
                "fields": firestore_fields(project_payload),
            }
        }
    ]

    for item in preview.get("control", {}).get("items", []):
        item_id = item_document_id(item)
        item_payload = {
            **item,
            "importBatchId": import_batch_id,
            "updatedAt": now,
            "updatedBy": changed_by,
        }
        writes.append(
            {
                "update": {
                    "name": document_name(project_id, "checkProjects", check_project_id, "items", item_id),
                    "fields": firestore_fields(item_payload),
                }
            }
        )

    audit_payload = {
        "itemId": "*",
        "action": "import",
        "changedFields": ["items"],
        "changedBy": changed_by,
        "changedAt": now,
        "importBatchId": import_batch_id,
        "recordCount": len(preview.get("control", {}).get("items", [])),
    }
    writes.append(
        {
            "update": {
                "name": document_name(
                    project_id,
                    "checkProjects",
                    check_project_id,
                    "auditLogs",
                    f"import-{import_batch_id}",
                ),
                "fields": firestore_fields(audit_payload),
            }
        }
    )
    return writes


def get_access_token():
    token = os.environ.get("FIRESTORE_ACCESS_TOKEN")
    if token:
        return token

    completed = subprocess.run(
        ["npx", "-y", "firebase-tools@latest", "login:ci", "--no-localhost"],
        check=False,
        capture_output=True,
        text=True,
    )
    raise RuntimeError(
        "找不到 FIRESTORE_ACCESS_TOKEN。請先提供 OAuth access token，或改用已登入的 Firebase/Google CLI 流程。"
        f"\nFirebase CLI 輸出：{completed.stderr or completed.stdout}"
    )


def commit_writes(project_id, writes, access_token):
    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents:commit"
    request = urllib.request.Request(
        url,
        data=json.dumps({"writes": writes}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Firestore commit 失敗：HTTP {error.code}\n{detail}") from error


def main(argv=None):
    parser = argparse.ArgumentParser(description="Upload check-control preview JSON to Firestore.")
    parser.add_argument("--preview-json", required=True)
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--check-project-id", required=True)
    parser.add_argument("--import-batch-id", required=True)
    parser.add_argument("--changed-by", required=True)
    parser.add_argument("--writes-output")
    parser.add_argument("--commit", action="store_true")
    args = parser.parse_args(argv)

    preview = json.loads(Path(args.preview_json).read_text(encoding="utf-8"))
    writes = build_firestore_writes(
        preview,
        project_id=args.project_id,
        check_project_id=args.check_project_id,
        import_batch_id=args.import_batch_id,
        changed_by=args.changed_by,
    )

    if args.writes_output:
        output_path = Path(args.writes_output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps({"writes": writes}, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.commit:
        result = commit_writes(args.project_id, writes, get_access_token())
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(json.dumps({"writeCount": len(writes)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
