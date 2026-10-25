import json
import os
import uuid
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import (
    MetaData,
    String,
    Table,
    and_,
    cast,
    create_engine,
    func,
    inspect,
    or_,
    select,
    text,
)
from sqlalchemy.engine.url import make_url
from sqlalchemy.exc import SQLAlchemyError


# Locate directories to reliably find .env regardless of working directory
CURRENT_FILE = Path(__file__).resolve()
APP_DIR = CURRENT_FILE.parent
BACKEND_DIR = APP_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

dotenv_backend = BACKEND_DIR / ".env"
dotenv_root = PROJECT_ROOT / ".env"

if dotenv_backend.is_file():
    load_dotenv(dotenv_path=dotenv_backend, override=True)
elif dotenv_root.is_file():
    load_dotenv(dotenv_path=dotenv_root, override=True)
else:
    load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise RuntimeError(
        f"DATABASE_URL is missing. Create '{dotenv_backend}' (copy from .env.example) and configure your database connection string."
    )


def normalize_db_url(raw: str) -> str:
    """Normalize database connection URLs to use supported drivers in SQLAlchemy."""
    url = raw.strip()
    # Supabase & Postgres
    if url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://"):]
    elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    # MySQL
    elif url.startswith("mysql://") and not url.startswith("mysql+"):
        url = "mysql+pymysql://" + url[len("mysql://"):]
    # Oracle
    elif url.startswith("oracle://") and not url.startswith("oracle+"):
        url = "oracle+oracledb://" + url[len("oracle://"):]
    # SQL Server (MSSQL)
    elif url.startswith("mssql://") and not url.startswith("mssql+"):
        url = "mssql+pymssql://" + url[len("mssql://"):]
    elif url.startswith("sqlserver://"):
        url = "mssql+pymssql://" + url[len("sqlserver://"):]
    return url


def mask_url(url_str: str) -> str:
    """Safely mask password in a database connection URL."""
    try:
        u = make_url(url_str)
        if u.password:
            return str(u.set(password="******"))
        return str(u)
    except Exception:
        return url_str


def build_engine(url_str: str):
    """Build and validate an engine connection."""
    norm_url = normalize_db_url(url_str)
    if norm_url.startswith("sqlite"):
        new_eng = create_engine(norm_url)
    else:
        new_eng = create_engine(norm_url, pool_pre_ping=True, pool_size=5, max_overflow=5)

    with new_eng.connect() as conn:
        if new_eng.dialect.name == "oracle":
            conn.execute(text("SELECT 1 FROM DUAL"))
        else:
            conn.execute(text("SELECT 1"))
    return new_eng, norm_url


DATABASE_URL = normalize_db_url(DATABASE_URL)
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5 if not DATABASE_URL.startswith("sqlite") else None,
    max_overflow=5 if not DATABASE_URL.startswith("sqlite") else None,
)

app = FastAPI(
    title="SchemaPilot API",
    description="Read-only database metadata explorer for schemas, tables, keys, indexes, constraints and sample rows.",
    version="0.1.0",
)

cors_val = os.getenv("CORS_ORIGINS", "*").strip()
if not cors_val or "*" in cors_val:
    origins = ["*"]
else:
    origins = [x.strip() for x in cors_val.split(",") if x.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root_status():
    return {
        "status": "ok",
        "name": "SchemaPilot API",
        "version": "0.1.0",
        "docs_url": "/docs",
        "health_url": "/api/health"
    }


def sanitize_error(exc: Exception) -> str:
    """Mask any password or credential details in database exception messages."""
    raw_msg = str(exc)
    try:
        if engine and hasattr(engine, "url") and engine.url.password:
            raw_msg = raw_msg.replace(engine.url.password, "******")
    except Exception:
        pass

    orig = getattr(exc, "orig", None)
    if orig:
        orig_msg = str(orig)
        try:
            if engine and hasattr(engine, "url") and engine.url.password:
                orig_msg = orig_msg.replace(engine.url.password, "******")
        except Exception:
            pass
        return f"{exc.__class__.__name__}: {orig_msg}"

    return f"{exc.__class__.__name__}: {raw_msg}"


def get_inspector():
    return inspect(engine)


def get_default_schema() -> str:
    """Get the active default database/schema name for the connected engine."""
    dialect = engine.dialect.name
    if dialect == "mysql":
        if engine.url and engine.url.database:
            return engine.url.database
        return "mysql"
    elif dialect == "postgresql":
        return "public"
    elif dialect == "mssql":
        return "dbo"
    elif dialect == "oracle":
        if engine.url and engine.url.username:
            return engine.url.username.upper()
        return "SYSTEM"
    elif dialect == "sqlite":
        return "main"
    return "public"


def resolve_schema(schema: str | None = None) -> str:
    """
    Resolve schema name safely across database engines.
    In MySQL, schemas are databases and 'public' does not exist by default.
    If 'public' or None is queried on MySQL, resolve to the connected database.
    """
    if not schema:
        return get_default_schema()
    if engine.dialect.name == "mysql" and schema.lower() == "public":
        return get_default_schema()
    return schema


def safe_get_unique_constraints(insp, table_name: str, schema: str | None) -> list[dict[str, Any]]:
    try:
        return insp.get_unique_constraints(table_name, schema=schema) or []
    except (NotImplementedError, AttributeError, SQLAlchemyError):
        return []


def safe_get_check_constraints(insp, table_name: str, schema: str | None) -> list[dict[str, Any]]:
    try:
        return insp.get_check_constraints(table_name, schema=schema) or []
    except (NotImplementedError, AttributeError, SQLAlchemyError):
        return []


def table_names(schema: str | None = None) -> list[str]:
    target_schema = resolve_schema(schema)
    insp = get_inspector()
    return sorted(insp.get_table_names(schema=target_schema))


def resolve_table_schema(table_name: str, schema: str | None = None) -> str:
    """
    Intelligently find the schema containing table_name.
    1. Checks the specified schema first.
    2. If not found, checks default schema ('public' on PostgreSQL).
    3. If still not found, searches all visible schemas.
    4. Only raises 404 if table cannot be found anywhere in the connected database.
    """
    target = resolve_schema(schema)
    insp = get_inspector()

    # 1. Check target schema
    try:
        if table_name in insp.get_table_names(schema=target):
            return target
    except Exception:
        pass

    # 2. Check default schema
    def_schema = get_default_schema()
    if def_schema and def_schema != target:
        try:
            if table_name in insp.get_table_names(schema=def_schema):
                return def_schema
        except Exception:
            pass

    # 3. Search all schema names
    try:
        all_schemas = insp.get_schema_names()
        for s in all_schemas:
            if s not in (target, def_schema):
                try:
                    if table_name in insp.get_table_names(schema=s):
                        return s
                except Exception:
                    continue
    except Exception:
        pass

    raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found in the selected schema.")


def validate_table(table_name: str, schema: str | None = None) -> str:
    return resolve_table_schema(table_name, schema)



class ConnectionPayload(BaseModel):
    database_url: str


@app.get("/api/health")
def health() -> dict[str, str]:
    try:
        with engine.connect() as conn:
            if engine.dialect.name == "oracle":
                conn.execute(text("SELECT 1 FROM DUAL"))
            else:
                conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected", "dialect": engine.dialect.name}
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Database connection failed. {sanitize_error(exc)}",
        )


@app.get("/api/connections/current")
def current_connection() -> dict[str, Any]:
    try:
        dialect = engine.dialect.name
        database = engine.url.database or ""
        host = engine.url.host or ""
        port = engine.url.port or ""
        username = engine.url.username or ""
        def_schema = get_default_schema()
        return {
            "status": "connected",
            "database_url": mask_url(DATABASE_URL),
            "dialect": dialect,
            "database": database,
            "host": host,
            "port": port,
            "username": username,
            "default_schema": def_schema,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=sanitize_error(exc))


@app.post("/api/connections/test")
def test_connection(payload: ConnectionPayload) -> dict[str, Any]:
    try:
        test_eng, norm_url = build_engine(payload.database_url)
        dialect = test_eng.dialect.name
        database = test_eng.url.database or ""
        test_eng.dispose()
        return {
            "ok": True,
            "dialect": dialect,
            "database": database,
            "message": f"Successfully connected to {dialect.upper()} database '{database}'!",
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Connection test failed: {sanitize_error(exc)}")


@app.post("/api/connections/switch")
def switch_connection(payload: ConnectionPayload) -> dict[str, Any]:
    global engine, DATABASE_URL
    try:
        new_eng, norm_url = build_engine(payload.database_url)
        old_eng = engine
        engine = new_eng
        DATABASE_URL = norm_url
        if old_eng:
            try:
                old_eng.dispose()
            except Exception:
                pass

        # Update DATABASE_URL in backend/.env for persistence
        try:
            if dotenv_backend.is_file():
                content = dotenv_backend.read_text(encoding="utf-8")
                lines = content.splitlines()
                new_lines = []
                found = False
                for line in lines:
                    if line.strip().startswith("DATABASE_URL="):
                        if not found:
                            new_lines.append(f"DATABASE_URL={norm_url}")
                            found = True
                    else:
                        new_lines.append(line)
                if not found:
                    new_lines.append(f"DATABASE_URL={norm_url}")
                dotenv_backend.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
        except Exception:
            pass

        def_schema = get_default_schema()
        return {
            "ok": True,
            "status": "connected",
            "database_url": mask_url(DATABASE_URL),
            "dialect": engine.dialect.name,
            "database": engine.url.database or "",
            "default_schema": def_schema,
            "message": f"Switched to {engine.dialect.name.upper()} successfully!",
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to switch database: {sanitize_error(exc)}")


@app.get("/api/schemas")
def list_schemas() -> dict[str, Any]:
    try:
        insp = get_inspector()
        try:
            schemas = insp.get_schema_names()
        except Exception:
            schemas = []

        system_schemas = {
            "information_schema",
            "performance_schema",
            "mysql",
            "sys",
        }
        visible = [
            s for s in schemas
            if s.lower() not in system_schemas and not s.lower().startswith("pg_")
        ]
        default_s = get_default_schema()
        if default_s and default_s not in visible and default_s in schemas:
            visible.append(default_s)
        elif not visible and default_s:
            visible = [default_s]

        return {"schemas": sorted(visible)}
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=502, detail=f"Unable to retrieve schemas: {sanitize_error(exc)}")


@app.get("/api/summary")
def summary(schema: str = Query(default="public")) -> dict[str, Any]:
    target_schema = resolve_schema(schema)
    try:
        insp = get_inspector()
        names = table_names(target_schema)
        total_columns = total_pks = total_fks = total_indexes = total_unique = total_checks = 0
        for name in names:
            columns = insp.get_columns(name, schema=target_schema)
            pk = insp.get_pk_constraint(name, schema=target_schema) or {}
            fks = insp.get_foreign_keys(name, schema=target_schema)
            indexes = insp.get_indexes(name, schema=target_schema)
            uniques = safe_get_unique_constraints(insp, name, target_schema)
            checks = safe_get_check_constraints(insp, name, target_schema)
            total_columns += len(columns)
            total_pks += 1 if pk.get("constrained_columns") else 0
            total_fks += len(fks)
            total_indexes += len(indexes)
            total_unique += len(uniques)
            total_checks += len(checks)
        return {
            "schema": target_schema,
            "table_count": len(names),
            "column_count": total_columns,
            "primary_key_constraint_count": total_pks,
            "foreign_key_constraint_count": total_fks,
            "index_count": total_indexes,
            "unique_constraint_count": total_unique,
            "check_constraint_count": total_checks,
        }
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=502, detail=f"Unable to retrieve summary: {sanitize_error(exc)}")


@app.get("/api/tables")
def list_tables(schema: str = Query(default="public")) -> dict[str, Any]:
    target_schema = resolve_schema(schema)
    try:
        insp = get_inspector()
        result = []
        for name in table_names(target_schema):
            columns = insp.get_columns(name, schema=target_schema)
            pk = insp.get_pk_constraint(name, schema=target_schema) or {}
            fks = insp.get_foreign_keys(name, schema=target_schema)
            indexes = insp.get_indexes(name, schema=target_schema)
            uniques = safe_get_unique_constraints(insp, name, target_schema)
            checks = safe_get_check_constraints(insp, name, target_schema)
            result.append({
                "schema": target_schema,
                "name": name,
                "column_count": len(columns),
                "primary_key_constraint_count": 1 if pk.get("constrained_columns") else 0,
                "primary_key_column_count": len(pk.get("constrained_columns") or []),
                "foreign_key_constraint_count": len(fks),
                "index_count": len(indexes),
                "unique_constraint_count": len(uniques),
                "check_constraint_count": len(checks),
                "constraint_count": (1 if pk.get("constrained_columns") else 0) + len(fks) + len(uniques) + len(checks),
            })
        return {"schema": target_schema, "total_tables": len(result), "tables": result}
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=502, detail=f"Unable to retrieve tables: {sanitize_error(exc)}")


@app.get("/api/tables/{table_name}/metadata")
def table_metadata(table_name: str, schema: str = Query(default="public")) -> dict[str, Any]:
    try:
        target_schema = resolve_table_schema(table_name, schema)
        insp = get_inspector()
        columns = insp.get_columns(table_name, schema=target_schema)
        pk = insp.get_pk_constraint(table_name, schema=target_schema) or {}
        fks = insp.get_foreign_keys(table_name, schema=target_schema)
        indexes = insp.get_indexes(table_name, schema=target_schema)
        uniques = safe_get_unique_constraints(insp, table_name, target_schema)
        checks = safe_get_check_constraints(insp, table_name, target_schema)

        pk_columns = set(pk.get("constrained_columns") or [])
        fk_columns = {col for fk in fks for col in (fk.get("constrained_columns") or [])}
        unique_columns = {col for item in uniques for col in (item.get("column_names") or [])}
        normalized_columns = []
        for ordinal, col in enumerate(columns, start=1):
            normalized_columns.append({
                "ordinal_position": ordinal,
                "name": col["name"],
                "data_type": str(col["type"]),
                "nullable": bool(col.get("nullable", True)),
                "default": str(col["default"]) if col.get("default") is not None else None,
                "primary_key": col["name"] in pk_columns,
                "foreign_key": col["name"] in fk_columns,
                "unique": col["name"] in unique_columns,
                "autoincrement": str(col.get("autoincrement", "auto")),
                "comment": col.get("comment"),
            })
        return {
            "schema": target_schema,
            "table": table_name,
            "column_count": len(columns),
            "primary_key": pk,
            "foreign_keys": fks,
            "indexes": indexes,
            "unique_constraints": uniques,
            "check_constraints": checks,
            "columns": normalized_columns,
        }
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=502, detail=f"Unable to retrieve table metadata: {sanitize_error(exc)}")


def safe_value(value: Any) -> Any:
    """Normalize any database types for JSON serialization."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray)):
        try:
            return value.decode("utf-8")
        except Exception:
            return value.hex()
    return str(value)


@app.get("/api/tables/{table_name}/rows")
def table_rows(
    table_name: str,
    schema: str = Query(default="public"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    """Read-only, paginated preview. This endpoint does not perform writes."""
    try:
        target_schema = resolve_table_schema(table_name, schema)
        metadata = MetaData()
        table = Table(table_name, metadata, schema=target_schema, autoload_with=engine)

        stmt = select(table).limit(limit).offset(offset)
        with engine.connect() as conn:
            rows = conn.execute(stmt).mappings().all()

        return {
            "schema": target_schema,
            "table": table_name,
            "limit": limit,
            "offset": offset,
            "columns": [c.name for c in table.columns],
            "rows": [{k: safe_value(v) for k, v in row.items()} for row in rows],
        }
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=502, detail=f"Unable to retrieve rows: {sanitize_error(exc)}")


class FilterRule(BaseModel):
    column: str
    operator: str
    value: Any = None


class DataQueryPayload(BaseModel):
    schema_name: str | None = None
    table: str
    columns: list[str]
    filters: list[FilterRule] = []
    conjunction: str = "AND"
    limit: int = 50
    offset: int = 0
    sort_column: str | None = None
    sort_direction: str = "asc"


class SavedSelectionPayload(BaseModel):
    id: str | None = None
    name: str
    description: str | None = None
    schema_name: str
    table: str
    columns: list[str]
    filters: list[FilterRule] = []
    conjunction: str = "AND"
    created_at: str | None = None


SAVED_SELECTIONS_FILE = BACKEND_DIR / "saved_selections.json"

DEFAULT_SELECTIONS = [
    {
        "id": "preset-1",
        "name": 'Customers with "Ravi"',
        "description": "Filters customers whose name contains Ravi",
        "schema_name": "public",
        "table": "customers",
        "columns": ["customer_id", "name", "email", "created_at"],
        "filters": [{"column": "name", "operator": "contains", "value": "Ravi"}],
        "conjunction": "AND",
        "created_at": "2026-01-01T00:00:00Z"
    },
    {
        "id": "preset-2",
        "name": "Completed Payments",
        "description": "All payments with payment_status = 'completed'",
        "schema_name": "public",
        "table": "payments",
        "columns": ["payment_id", "order_id", "amount", "payment_method", "payment_status", "paid_at"],
        "filters": [{"column": "payment_status", "operator": "equals", "value": "completed"}],
        "conjunction": "AND",
        "created_at": "2026-01-01T00:00:00Z"
    },
    {
        "id": "preset-3",
        "name": "High Value Products (> 100)",
        "description": "Products with unit price greater than 100",
        "schema_name": "public",
        "table": "products",
        "columns": ["product_id", "name", "price", "stock"],
        "filters": [{"column": "price", "operator": "greater_than", "value": 100}],
        "conjunction": "AND",
        "created_at": "2026-01-01T00:00:00Z"
    }
]


def load_saved_selections_from_disk() -> list[dict[str, Any]]:
    if not SAVED_SELECTIONS_FILE.is_file():
        try:
            SAVED_SELECTIONS_FILE.write_text(json.dumps(DEFAULT_SELECTIONS, indent=2), encoding="utf-8")
        except Exception:
            return DEFAULT_SELECTIONS
        return DEFAULT_SELECTIONS
    try:
        content = SAVED_SELECTIONS_FILE.read_text(encoding="utf-8")
        return json.loads(content)
    except Exception:
        return DEFAULT_SELECTIONS


def save_saved_selections_to_disk(items: list[dict[str, Any]]) -> None:
    try:
        SAVED_SELECTIONS_FILE.write_text(json.dumps(items, indent=2), encoding="utf-8")
    except Exception:
        pass


@app.post("/api/query")
def execute_data_query(payload: DataQueryPayload) -> dict[str, Any]:
    """
    Safely executes filtered queries with parameterized values and explicit column selection.
    Validates table, columns, and operators against actual database metadata.
    """
    try:
        target_schema = resolve_table_schema(payload.table, payload.schema_name)
        metadata = MetaData()
        table = Table(payload.table, metadata, schema=target_schema, autoload_with=engine)

        # Filter to columns that actually exist in the table; fallback to first 4 if none match
        valid_cols = [c for c in payload.columns if c in table.c]
        if not valid_cols:
            valid_cols = [c.name for c in table.columns][:4] or [c.name for c in table.columns]

        if not valid_cols:
            raise HTTPException(status_code=400, detail="At least one column must be selected.")

        selected_col_objs = [table.c[col] for col in valid_cols]


        # Build parameterized filter conditions
        conditions = []
        for f in payload.filters:
            col_name = f.column.strip()
            if not col_name or col_name not in table.c:
                continue

            col_c = table.c[col_name]
            op = (f.operator or "equals").strip().lower()
            val = f.value

            # Attempt numeric conversion if applicable
            type_str = str(col_c.type).upper()
            is_numeric = any(t in type_str for t in ("INT", "NUMERIC", "DECIMAL", "FLOAT", "DOUBLE", "REAL"))

            parsed_val = val
            if is_numeric and val is not None and isinstance(val, str):
                try:
                    if "." in val:
                        parsed_val = float(val)
                    else:
                        parsed_val = int(val)
                except ValueError:
                    parsed_val = val

            if op in ("equals", "eq", "="):
                conditions.append(col_c == parsed_val)
            elif op in ("not_equals", "neq", "!="):
                conditions.append(col_c != parsed_val)
            elif op in ("contains", "like"):
                conditions.append(cast(col_c, String).ilike(f"%{parsed_val}%"))
            elif op in ("starts_with", "startswith"):
                conditions.append(cast(col_c, String).ilike(f"{parsed_val}%"))
            elif op in ("ends_with", "endswith"):
                conditions.append(cast(col_c, String).ilike(f"%{parsed_val}"))
            elif op in ("greater_than", "gt", ">"):
                conditions.append(col_c > parsed_val)
            elif op in ("less_than", "lt", "<"):
                conditions.append(col_c < parsed_val)
            elif op in ("greater_than_or_equal", "gte", ">="):
                conditions.append(col_c >= parsed_val)
            elif op in ("less_than_or_equal", "lte", "<="):
                conditions.append(col_c <= parsed_val)
            elif op in ("is_empty", "isempty"):
                conditions.append(or_(col_c.is_(None), cast(col_c, String) == ""))
            elif op in ("is_not_empty", "isnotempty"):
                conditions.append(and_(col_c.is_not(None), cast(col_c, String) != ""))
            elif op in ("is_null", "isnull"):
                conditions.append(col_c.is_(None))
            elif op in ("is_not_null", "isnotnull"):
                conditions.append(col_c.is_not(None))

        # Combine with requested conjunction (AND or OR)
        where_clause = None
        if conditions:
            if payload.conjunction.strip().upper() == "OR":
                where_clause = or_(*conditions)
            else:
                where_clause = and_(*conditions)

        # Count total matching rows
        count_stmt = select(func.count()).select_from(table)
        if where_clause is not None:
            count_stmt = count_stmt.where(where_clause)

        # Build data selection statement
        stmt = select(*selected_col_objs)
        if where_clause is not None:
            stmt = stmt.where(where_clause)

        # Optional sorting
        if payload.sort_column and payload.sort_column in table.c:
            sort_c = table.c[payload.sort_column]
            if payload.sort_direction.lower() == "desc":
                stmt = stmt.order_by(sort_c.desc())
            else:
                stmt = stmt.order_by(sort_c.asc())

        clamped_limit = max(1, min(payload.limit, 500))
        clamped_offset = max(0, payload.offset)
        stmt = stmt.limit(clamped_limit).offset(clamped_offset)

        with engine.connect() as conn:
            total_matching = conn.execute(count_stmt).scalar() or 0
            rows = conn.execute(stmt).mappings().all()

        return {
            "schema": target_schema,
            "table": payload.table,
            "columns": valid_cols,
            "total_matching": total_matching,

            "limit": clamped_limit,
            "offset": clamped_offset,
            "rows": [{k: safe_value(v) for k, v in row.items()} for row in rows],
        }
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=502, detail=f"Query execution failed: {sanitize_error(exc)}")


@app.get("/api/saved-selections")
def get_saved_selections() -> dict[str, Any]:
    """Retrieve all saved data selections."""
    items = load_saved_selections_from_disk()
    return {"selections": items}


@app.post("/api/saved-selections")
def save_data_selection(payload: SavedSelectionPayload) -> dict[str, Any]:
    """Save or update a data selection configuration."""
    items = load_saved_selections_from_disk()
    item_id = payload.id or str(uuid.uuid4())
    now_iso = datetime.utcnow().isoformat() + "Z"

    entry = {
        "id": item_id,
        "name": payload.name.strip() or f"Selection on {payload.table}",
        "description": payload.description or "",
        "schema_name": payload.schema_name or "public",
        "table": payload.table,
        "columns": payload.columns,
        "filters": [f.model_dump() for f in payload.filters],
        "conjunction": payload.conjunction or "AND",
        "created_at": payload.created_at or now_iso,
    }

    # Replace existing or prepend new
    updated = [entry] + [x for x in items if x.get("id") != item_id]
    save_saved_selections_to_disk(updated)
    return {"ok": True, "selection": entry}


@app.delete("/api/saved-selections/{selection_id}")
def delete_saved_selection(selection_id: str) -> dict[str, Any]:
    """Delete a saved data selection."""
    items = load_saved_selections_from_disk()
    filtered_items = [x for x in items if x.get("id") != selection_id]
    save_saved_selections_to_disk(filtered_items)
    return {"ok": True, "message": f"Selection '{selection_id}' removed."}

