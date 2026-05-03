from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


BUSINESS_TABLE_DELETE_ORDER = [
    "commission_records",
    "order_daily_stats",
    "shop_promotions",
    "shop_loyalty_points",
    "shop_riders",
    "chat_messages",
    "billing_ledger",
    "billing_accounts",
    "reservations",
    "orders",
    "products",
    "categories",
    "shops",
    "restaurants",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate RTIAM legacy SQLite data into the new database schema.")
    parser.add_argument("--old-db", required=True, help="旧版数据库路径")
    parser.add_argument("--new-db", required=True, help="新版数据库路径")
    parser.add_argument("--shop-slug", default="rtiam", help="要导入的店铺 slug，默认 rtiam")
    parser.add_argument("--shop-id", type=int, default=7, help="目标店铺 ID，默认 7")
    parser.add_argument("--dry-run", action="store_true", help="只打印导入计划，不写数据库")
    parser.add_argument("--backup-dir", default="", help="目标库备份目录，默认与目标库同级 backups")
    parser.add_argument(
        "--wipe-all-business-data",
        action="store_true",
        help="清空新版所有业务数据后再导入。当前新版数据全部无效时使用。",
    )
    return parser.parse_args()


def normalize_cli_path(raw: str) -> Path:
    cleaned = str(raw or "").replace("\r", "").replace("\n", "").strip()
    return Path(cleaned).expanduser().resolve()


def connect_db(path: Path) -> sqlite3.Connection:
    if not path.exists():
        raise FileNotFoundError(f"database file does not exist: {path}")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def parse_json_object(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def normalize_table_config(raw: Any) -> str:
    data = parse_json_object(raw)
    zones = data.get("zones")
    if not isinstance(zones, list):
        return json.dumps({"zones": []}, ensure_ascii=False, separators=(",", ":"))

    normalized: list[dict[str, Any]] = []
    for item in zones:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        count = int(item.get("count") or 0)
        prefix = str(item.get("prefix") or "").strip()
        if not name or count <= 0:
            continue
        row: dict[str, Any] = {"name": name, "count": count}
        if prefix:
            row["prefix"] = prefix
        normalized.append(row)
    return json.dumps({"zones": normalized}, ensure_ascii=False, separators=(",", ":"))


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {str(row["name"]) for row in conn.execute(f"PRAGMA table_info({table})")}


def build_migration_stats_comparison(legacy: dict[str, int], target: dict[str, int]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for key in ("categories", "products", "orders"):
        legacy_value = int(legacy.get(key, 0))
        target_value = int(target.get(key, 0))
        result[key] = {
            "legacy": legacy_value,
            "target": target_value,
            "delta": legacy_value - target_value,
            "needs_import": legacy_value != target_value,
        }
    return result


def fetch_legacy_restaurant(conn: sqlite3.Connection, slug: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM restaurants WHERE slug = ?", (slug,)).fetchone()


def count_old_entities(conn: sqlite3.Connection, restaurant_id: int) -> dict[str, int]:
    return {
        "categories": int(conn.execute("SELECT COUNT(*) FROM categories WHERE restaurant_id = ?", (restaurant_id,)).fetchone()[0]),
        "products": int(conn.execute("SELECT COUNT(*) FROM products WHERE restaurant_id = ?", (restaurant_id,)).fetchone()[0]),
        "orders": int(conn.execute("SELECT COUNT(*) FROM orders WHERE restaurant_id = ?", (restaurant_id,)).fetchone()[0]),
    }


def count_new_entities(conn: sqlite3.Connection, shop_id: int) -> dict[str, int]:
    def count(table: str, column: str) -> int:
        if not table_exists(conn, table) or column not in table_columns(conn, table):
            return 0
        return int(conn.execute(f"SELECT COUNT(*) FROM {table} WHERE {column} = ?", (shop_id,)).fetchone()[0])

    return {
        "categories": count("categories", "shop_id"),
        "products": count("products", "shop_id"),
        "orders": count("orders", "shop_id"),
    }


def ensure_backup(new_conn: sqlite3.Connection, new_db_path: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"{new_db_path.stem}.backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}{new_db_path.suffix}"
    backup_conn = sqlite3.connect(backup_path)
    new_conn.backup(backup_conn)
    backup_conn.close()
    return backup_path


def delete_all_business_data(conn: sqlite3.Connection) -> None:
    for table in BUSINESS_TABLE_DELETE_ORDER:
        if table_exists(conn, table):
            conn.execute(f"DELETE FROM {table}")


def delete_shop_business_data(conn: sqlite3.Connection, shop_id: int) -> None:
    targeted_columns = {
        "commission_records": "shop_id",
        "order_daily_stats": "shop_id",
        "shop_promotions": "shop_id",
        "shop_loyalty_points": "shop_id",
        "shop_riders": "shop_id",
        "chat_messages": "shop_id",
        "billing_ledger": "shop_id",
        "billing_accounts": "shop_id",
        "reservations": "shop_id",
        "orders": "shop_id",
        "products": "shop_id",
        "categories": "shop_id",
        "shops": "id",
        "restaurants": "id",
    }
    for table in BUSINESS_TABLE_DELETE_ORDER:
        if not table_exists(conn, table):
            continue
        column = targeted_columns.get(table)
        if not column or column not in table_columns(conn, table):
            continue
        conn.execute(f"DELETE FROM {table} WHERE {column} = ?", (shop_id,))


def build_restaurant_record(legacy: sqlite3.Row) -> dict[str, Any]:
    record = dict(legacy)
    record["settings"] = json.dumps(parse_json_object(legacy["settings"]), ensure_ascii=False, separators=(",", ":"))
    record["table_config"] = normalize_table_config(legacy["table_config"])
    return record


def build_shop_record(legacy: sqlite3.Row, target_shop_id: int) -> dict[str, Any]:
    return {
        "id": target_shop_id,
        "name": legacy["name"],
        "slug": legacy["slug"],
        "password": legacy["password"],
        "phone": legacy["phone"],
        "address": legacy["address"],
        "status": legacy["status"] or "active",
        "settings": json.dumps(parse_json_object(legacy["settings"]), ensure_ascii=False, separators=(",", ":")),
        "expire_date": legacy["expire_date"],
        "last_paid_month": legacy["last_paid_month"],
        "commission_type": legacy["commission_type"],
        "commission_value": legacy["commission_value"],
        "enable_delivery": legacy["enable_delivery"],
        "enable_dine_in": legacy["enable_dine_in"],
        "enable_reservation": legacy["enable_reservation"],
        "mqtt_secret": legacy["mqtt_secret"],
        "table_config": normalize_table_config(legacy["table_config"]),
        "category": legacy["category"],
        "city": legacy["city"],
        "zone": legacy["zone"],
        "delivery_type": legacy["delivery_type"],
    }


def build_insert_sql(table: str, row: dict[str, Any], columns: Iterable[str]) -> tuple[str, list[Any]]:
    cols = [name for name in row.keys() if name in columns]
    placeholders = ", ".join(["?"] * len(cols))
    sql = f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders})"
    return sql, [row[name] for name in cols]


def fetch_rows(conn: sqlite3.Connection, table: str, column: str, value: Any) -> list[sqlite3.Row]:
    return conn.execute(f"SELECT * FROM {table} WHERE {column} = ? ORDER BY id", (value,)).fetchall()


def import_restaurant_and_shop(new_conn: sqlite3.Connection, legacy_restaurant: sqlite3.Row, target_shop_id: int) -> None:
    if table_exists(new_conn, "restaurants"):
        restaurant_columns = table_columns(new_conn, "restaurants")
        restaurant_row = build_restaurant_record(legacy_restaurant)
        sql, values = build_insert_sql("restaurants", restaurant_row, restaurant_columns)
        new_conn.execute(sql, values)

    if table_exists(new_conn, "shops"):
        shop_columns = table_columns(new_conn, "shops")
        shop_row = build_shop_record(legacy_restaurant, target_shop_id)
        sql, values = build_insert_sql("shops", shop_row, shop_columns)
        new_conn.execute(sql, values)


def import_categories(new_conn: sqlite3.Connection, legacy_rows: list[sqlite3.Row], target_shop_id: int) -> None:
    if not table_exists(new_conn, "categories"):
        return
    columns = table_columns(new_conn, "categories")
    for row in legacy_rows:
        payload = dict(row)
        payload["restaurant_id"] = target_shop_id
        payload["shop_id"] = target_shop_id
        sql, values = build_insert_sql("categories", payload, columns)
        new_conn.execute(sql, values)


def import_products(new_conn: sqlite3.Connection, legacy_rows: list[sqlite3.Row], target_shop_id: int) -> None:
    if not table_exists(new_conn, "products"):
        return
    columns = table_columns(new_conn, "products")
    for row in legacy_rows:
        payload = dict(row)
        payload["restaurant_id"] = target_shop_id
        payload["shop_id"] = target_shop_id
        sql, values = build_insert_sql("products", payload, columns)
        new_conn.execute(sql, values)


def import_orders(new_conn: sqlite3.Connection, legacy_rows: list[sqlite3.Row], target_shop_id: int) -> None:
    if not table_exists(new_conn, "orders"):
        return
    columns = table_columns(new_conn, "orders")
    for row in legacy_rows:
        payload = dict(row)
        payload["restaurant_id"] = target_shop_id
        payload["shop_id"] = target_shop_id
        if "updated_at" in columns and not payload.get("updated_at"):
            payload["updated_at"] = payload.get("created_at")
        sql, values = build_insert_sql("orders", payload, columns)
        new_conn.execute(sql, values)


def main() -> int:
    args = parse_args()
    old_db_path = normalize_cli_path(args.old_db)
    new_db_path = normalize_cli_path(args.new_db)
    backup_dir = normalize_cli_path(args.backup_dir) if args.backup_dir else new_db_path.parent / "backups"

    old_conn = connect_db(old_db_path)
    new_conn = connect_db(new_db_path)

    legacy_restaurant = fetch_legacy_restaurant(old_conn, args.shop_slug)
    if legacy_restaurant is None:
        print(f"未在旧库中找到 slug={args.shop_slug} 的店铺")
        return 1

    legacy_counts = count_old_entities(old_conn, int(legacy_restaurant["id"]))
    target_counts = count_new_entities(new_conn, args.shop_id)
    comparison = build_migration_stats_comparison(legacy_counts, target_counts)

    print("=== 导入计划 ===")
    print(json.dumps(
        {
            "shop_slug": args.shop_slug,
            "legacy_restaurant_id": int(legacy_restaurant["id"]),
            "target_shop_id": args.shop_id,
            "legacy_counts": legacy_counts,
            "target_counts": target_counts,
            "comparison": comparison,
            "dry_run": bool(args.dry_run),
            "wipe_all_business_data": bool(args.wipe_all_business_data),
            "backup_dir": str(backup_dir),
        },
        ensure_ascii=False,
        indent=2,
    ))

    if args.dry_run:
        print("dry-run 模式：不写目标库。")
        return 0

    backup_path = ensure_backup(new_conn, new_db_path, backup_dir)
    print(f"目标库已备份到: {backup_path}")

    new_conn.execute("PRAGMA foreign_keys = OFF")
    new_conn.execute("BEGIN IMMEDIATE")
    try:
        if args.wipe_all_business_data:
            delete_all_business_data(new_conn)
        else:
            delete_shop_business_data(new_conn, args.shop_id)

        import_restaurant_and_shop(new_conn, legacy_restaurant, args.shop_id)

        legacy_categories = fetch_rows(old_conn, "categories", "restaurant_id", int(legacy_restaurant["id"]))
        legacy_products = fetch_rows(old_conn, "products", "restaurant_id", int(legacy_restaurant["id"]))
        legacy_orders = fetch_rows(old_conn, "orders", "restaurant_id", int(legacy_restaurant["id"]))

        import_categories(new_conn, legacy_categories, args.shop_id)
        import_products(new_conn, legacy_products, args.shop_id)
        import_orders(new_conn, legacy_orders, args.shop_id)

        new_conn.execute("COMMIT")
    except Exception:
        new_conn.execute("ROLLBACK")
        raise
    finally:
        new_conn.execute("PRAGMA foreign_keys = ON")

    print("导入完成。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
