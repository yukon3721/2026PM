import argparse
import csv
import json
import re
from datetime import datetime
from pathlib import Path


STATUS_EMPTY_LABEL = "未填報"

CONTROL_FIELD_MAP = {
    "項次": "itemNo",
    "類別": "category",
    "查核重點": "focus",
    "檢查方式": "method",
    "主管": "supervisor",
    "執行人員": "assigneeText",
    "辦理狀態": "status",
    "異常/風險說明": "riskNote",
    "辦理方式": "handlingMethod",
    "改善措施": "improvementAction",
    "複查結果": "recheckResult",
    "相關檔案連結": "attachmentUrl",
}


def read_csv_rows(path):
    with Path(path).open("r", encoding="utf-8-sig", newline="") as csv_file:
        return list(csv.reader(csv_file))


def find_header_index(rows, first_header):
    for index, row in enumerate(rows):
        if row and row[0].strip() == first_header:
            return index
    raise ValueError(f"找不到 CSV 表頭：{first_header}")


def clean_text(value):
    return value.strip() if value else ""


def normalize_multiline(value):
    return clean_text(value).replace("\r\n", "\n").replace("\r", "\n")


def parse_percent(value):
    text = clean_text(value)
    if not text:
        return None
    normalized = text.replace("%", "").strip()
    try:
        return int(normalized)
    except ValueError:
        return None


def parse_date_text(value):
    text = clean_text(value)
    if not text:
        return None

    for date_format in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, date_format).date().isoformat()
        except ValueError:
            pass

    match = re.fullmatch(r"(\d{4})年(\d{1,2})月底", text)
    if match:
        year, month = match.groups()
        return f"{int(year):04d}-{int(month):02d}-30"

    return None


def split_assignees(value):
    text = clean_text(value)
    if not text:
        return []
    parts = re.split(r"[/,，、]", text)
    return [part.strip() for part in parts if part.strip()]


def build_control_item(row_data, sequence, import_batch_id=None):
    item = {
        "sequence": sequence,
        "sourceRowIndex": sequence,
    }
    if import_batch_id:
        item["importBatchId"] = import_batch_id

    for source_field, target_field in CONTROL_FIELD_MAP.items():
        value = normalize_multiline(row_data.get(source_field, ""))
        if target_field == "status" and not value:
            value = STATUS_EMPTY_LABEL
        item[target_field] = value

    item["assignees"] = split_assignees(item["assigneeText"])
    item["plannedDateText"] = normalize_multiline(row_data.get("預計完成日", ""))
    item["plannedDate"] = parse_date_text(item["plannedDateText"])
    item["actualDateText"] = normalize_multiline(row_data.get("實際完成日", ""))
    item["actualDate"] = parse_date_text(item["actualDateText"])
    item["recheckDateText"] = normalize_multiline(row_data.get("複查日期", ""))
    item["recheckDate"] = parse_date_text(item["recheckDateText"])
    item["progress"] = parse_percent(row_data.get("完成率", ""))

    return item


def parse_control_csv(path, import_batch_id=None):
    rows = read_csv_rows(path)
    header_index = find_header_index(rows, "項次")
    headers = rows[header_index]
    named_headers = [(index, header.strip()) for index, header in enumerate(headers) if header.strip()]

    items = []
    last_item_no = ""
    last_category = ""
    for source_index, row in enumerate(rows[header_index + 1 :], start=1):
        if not any(clean_text(cell) for cell in row):
            continue

        row_data = {
            header: normalize_multiline(row[index]) if index < len(row) else ""
            for index, header in named_headers
        }
        if row_data.get("項次"):
            last_item_no = row_data["項次"]
        else:
            row_data["項次"] = last_item_no

        if row_data.get("類別"):
            last_category = normalize_multiline(row_data["類別"])
        else:
            row_data["類別"] = last_category

        items.append(build_control_item(row_data, source_index, import_batch_id=import_batch_id))

    return {
        "sourcePath": str(Path(path)),
        "recordCount": len(items),
        "items": items,
    }


def parse_instructions_csv(path):
    rows = read_csv_rows(path)
    header_index = find_header_index(rows, "欄位")
    fields = {}
    status_options = []
    in_status_section = False

    for row in rows[header_index + 1 :]:
        if not any(clean_text(cell) for cell in row):
            continue
        key = clean_text(row[0]) if len(row) > 0 else ""
        description = clean_text(row[1]) if len(row) > 1 else ""
        if key == "辦理狀態定義":
            in_status_section = True
            continue
        if in_status_section:
            status_options.append({"value": key, "description": description})
        else:
            fields[key] = description

    return {
        "sourcePath": str(Path(path)),
        "fields": fields,
        "statusOptions": status_options,
    }


def build_preview(control_csv, instructions_csv, import_batch_id=None):
    return {
        "project": {
            "name": "信義線延伸段通車前查核項目管控表（安全衛生處）",
            "department": "安全衛生處",
            "sourceFileDate": "1150518",
        },
        "instructions": parse_instructions_csv(instructions_csv),
        "control": parse_control_csv(control_csv, import_batch_id=import_batch_id),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build a JSON preview from check-control CSV files.")
    parser.add_argument("--control-csv", required=True)
    parser.add_argument("--instructions-csv", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--import-batch-id", default=None)
    args = parser.parse_args(argv)

    preview = build_preview(
        args.control_csv,
        args.instructions_csv,
        import_batch_id=args.import_batch_id,
    )
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(preview, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
