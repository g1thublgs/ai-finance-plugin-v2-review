import base64
import json
import os
import sqlite3
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))


def decode_payload(value):
    if not value:
        return {}
    raw = base64.b64decode(value.encode("utf-8")).decode("utf-8")
    return json.loads(raw)


def load_payload(argv):
    if "--payload-file" in argv:
        index = argv.index("--payload-file")
        if index + 1 >= len(argv):
            raise RuntimeError("--payload-file requires a file path")
        payload_file = argv[index + 1]
        with open(payload_file, "r", encoding="utf-8") as file:
            return json.load(file)
    return decode_payload(argv[3] if len(argv) >= 4 else "")


def row_to_dict(cursor, row):
    columns = [col[0] for col in cursor.description or []]
    return {columns[index]: row[index] for index in range(len(columns))}


def main():
    if len(sys.argv) < 3:
        raise RuntimeError("Usage: sqliteBridge.py <mode> <db_path> [payload_base64 | --payload-file path]")
    mode = sys.argv[1]
    db_path = sys.argv[2]
    payload = load_payload(sys.argv)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    connection = sqlite3.connect(db_path)
    try:
        if mode == "status":
            connection.execute("PRAGMA user_version")
            connection.commit()
            emit({
                "success": True,
                "path": db_path,
                "exists": os.path.exists(db_path),
                "size": os.path.getsize(db_path) if os.path.exists(db_path) else 0,
                "sqliteVersion": sqlite3.sqlite_version,
            })
            return

        sql = payload.get("sql") or ""
        params = payload.get("params") or []
        if not isinstance(params, list):
            params = []

        if mode == "script":
            connection.executescript(sql)
            connection.commit()
            emit({
                "success": True,
                "changes": connection.total_changes,
            })
            return

        if mode == "batch":
            operations = payload.get("operations") or []
            if not isinstance(operations, list):
                operations = []
            results = []
            with connection:
                for operation in operations:
                    operation_sql = operation.get("sql") or ""
                    operation_params = operation.get("params") or []
                    if not isinstance(operation_params, list):
                        operation_params = []
                    cursor = connection.execute(operation_sql, operation_params)
                    results.append({
                        "changes": cursor.rowcount,
                        "lastRowId": cursor.lastrowid,
                    })
            emit({
                "success": True,
                "changes": connection.total_changes,
                "results": results,
            })
            return

        cursor = connection.execute(sql, params)
        if mode == "query":
            rows = [row_to_dict(cursor, row) for row in cursor.fetchall()]
            emit({"success": True, "rows": rows, "rowCount": len(rows)})
            return
        if mode == "exec":
            connection.commit()
            emit({
                "success": True,
                "changes": connection.total_changes,
                "lastRowId": cursor.lastrowid,
            })
            return
        raise RuntimeError("Unknown sqlite mode: %s" % mode)
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit({"success": False, "error": str(exc)})
        sys.exit(1)
