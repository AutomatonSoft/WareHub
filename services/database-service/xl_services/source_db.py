def table_exists(cur, table_name: str) -> bool:
    cur.execute("SHOW TABLES LIKE %s", (table_name,))
    return cur.fetchone() is not None


def table_has_column(cur, table_name: str, column_name: str) -> bool:
    cur.execute(f"SHOW COLUMNS FROM `{table_name}` LIKE %s", (column_name,))
    return cur.fetchone() is not None
