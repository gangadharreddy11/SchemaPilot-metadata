import os
from decimal import Decimal
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import MetaData, Table, create_engine, inspect, select, text
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

origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def validate_table(table_name: str, schema: str | None) -> None:
    target_schema = resolve_schema(schema)
    if table_name not in table_names(target_schema):
        raise HTTPException(status_code=404, detail="Table not found in the selected schema.")


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
    target_schema = resolve_schema(schema)
    try:
        validate_table(table_name, target_schema)
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


@app.get("/api/tables/{table_name}/rows")
def table_rows(
    table_name: str,
    schema: str = Query(default="public"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    """Read-only, paginated preview. This endpoint does not perform writes."""
    target_schema = resolve_schema(schema)
    try:
        validate_table(table_name, target_schema)
        metadata = MetaData()
        table = Table(table_name, metadata, schema=target_schema, autoload_with=engine)
        stmt = select(table).limit(limit).offset(offset)
        with engine.connect() as conn:
            rows = conn.execute(stmt).mappings().all()

        def safe_value(value):
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
