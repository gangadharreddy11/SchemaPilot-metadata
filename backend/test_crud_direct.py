import os
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

import app.main as m
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool


class TestSchemaPilotCRUDDirect(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create an in-memory SQLite database using StaticPool
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool
        )
        m.engine = cls.engine
        m.DATABASE_URL = "sqlite://"

        # Seed initial table: customers
        with m.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE customers (
                    customer_id INTEGER PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    email VARCHAR(150) UNIQUE NOT NULL,
                    city VARCHAR(100)
                );
            """))
            conn.execute(text("""
                INSERT INTO customers (customer_id, name, email, city) VALUES
                (1, 'Aarav Sharma', 'aarav@example.com', 'Delhi'),
                (2, 'Priya Reddy', 'priya@example.com', 'Bengaluru'),
                (3, 'Rahul Kumar', 'rahul@example.com', 'Mumbai');
            """))

    @classmethod
    def tearDownClass(cls):
        m.engine.dispose()
        # Clean up column_preferences.json if created during test
        pref_file = m.BACKEND_DIR / "column_preferences.json"
        if pref_file.exists():
            try:
                pref_file.unlink()
            except Exception:
                pass

    def test_01_root_and_current_connection(self):
        status = m.root_status()
        self.assertEqual(status["status"], "ok")

        conn = m.current_connection()
        self.assertEqual(conn["status"], "connected")
        self.assertEqual(conn["dialect"], "sqlite")

    def test_02_dynamic_table_and_column_discovery(self):
        # Feature 1: Dynamic discovery
        tables_res = m.list_tables(schema="main")
        t_names = [t["name"] for t in tables_res["tables"]]
        self.assertIn("customers", t_names)

        meta = m.table_metadata("customers", schema="main")
        col_names = [c["name"] for c in meta["columns"]]
        self.assertEqual(col_names, ["customer_id", "name", "email", "city"])
        self.assertEqual(meta["table"], "customers")

        # Summary
        summary = m.summary(schema="main")
        self.assertGreaterEqual(summary["table_count"], 1)
        self.assertGreaterEqual(summary["column_count"], 4)

    def test_03_column_preferences_persistence(self):
        # Feature 2: Persistent selection preferences
        # Default: all columns
        pref = m.get_column_preferences(table="customers", schema="main")
        self.assertEqual(pref["table"], "customers")
        self.assertIn("name", pref["selected_columns"])
        self.assertIn("city", pref["selected_columns"])

        # User unchecks city and customer_id -> saves only [name, email]
        payload = m.ColumnPreferencePayload(
            table="customers",
            schema_name="main",
            selected_columns=["name", "email"]
        )
        saved = m.save_column_preferences(payload)
        self.assertTrue(saved["ok"])
        self.assertEqual(saved["selected_columns"], ["name", "email"])

        # Reload preferences: should restore [name, email]
        reloaded = m.get_column_preferences(table="customers", schema="main")
        self.assertEqual(reloaded["selected_columns"], ["name", "email"])
        self.assertEqual(reloaded["all_columns"], ["customer_id", "name", "email", "city"])

    def test_04_create_view_and_rename_table(self):
        # Feature 3: Table-Level CRUD
        # 1. Create table
        create_payload = m.CreateTablePayload(
            table_name="products_test",
            schema_name="main",
            columns=[
                m.ColumnDefinition(name="product_id", data_type="INTEGER", primary_key=True, nullable=False),
                m.ColumnDefinition(name="title", data_type="VARCHAR(255)", nullable=False),
                m.ColumnDefinition(name="price", data_type="NUMERIC", nullable=False, default_value="0.0")
            ]
        )
        res_create = m.create_table(create_payload)
        self.assertTrue(res_create["ok"])
        self.assertEqual(res_create["table"], "products_test")

        # 2. View table structure
        struct = m.table_structure("products_test", schema="main")
        self.assertEqual(struct["table"], "products_test")
        col_names = [c["name"] for c in struct["columns"]]
        self.assertEqual(col_names, ["product_id", "title", "price"])

        # 3. Rename table
        rename_payload = m.RenameTablePayload(new_name="items_catalog", schema_name="main")
        res_rename = m.rename_table("products_test", rename_payload)
        self.assertTrue(res_rename["ok"])
        self.assertEqual(res_rename["new_name"], "items_catalog")

    def test_05_column_crud_operations(self):
        # Feature 4: Column-Level CRUD
        # 1. Add column
        add_payload = m.AddColumnPayload(
            name="sku",
            data_type="VARCHAR(50)",
            nullable=True,
            schema_name="main"
        )
        res_add = m.add_column("items_catalog", add_payload)
        self.assertTrue(res_add["ok"])
        self.assertEqual(res_add["column"], "sku")

        # 2. Check dependencies
        dep = m.column_dependencies("items_catalog", "sku", schema="main")
        self.assertFalse(dep["has_dependencies"])

        # 3. Rename column
        ren_payload = m.RenameColumnPayload(new_name="barcode", schema_name="main")
        res_ren = m.rename_column("items_catalog", "sku", ren_payload)
        self.assertTrue(res_ren["ok"])
        self.assertEqual(res_ren["new_name"], "barcode")

        # 4. Drop column
        res_drop = m.drop_column("items_catalog", "barcode", schema="main")
        self.assertTrue(res_drop["ok"])
        self.assertEqual(res_drop["column"], "barcode")

    def test_06_record_crud_operations(self):
        # Feature 5: Record-Level CRUD
        # 1. CREATE: Insert record into customers
        ins_payload = m.InsertRecordPayload(
            schema_name="main",
            record={
                "customer_id": 99,
                "name": "Jane Doe",
                "email": "jane@example.com",
                "city": "Chicago"
            }
        )
        res_ins = m.insert_record("customers", ins_payload)
        self.assertTrue(res_ins["ok"])

        # Verify count
        count_res = m.table_row_count("customers", schema="main")
        self.assertEqual(count_res["count"], 4)

        # 2. READ: Query records with column selection (only name, email)
        query_payload = m.RecordQueryPayload(
            schema_name="main",
            columns=["name", "email"],
            filters=[m.FilterRule(column="name", operator="equals", value="Jane Doe")],
            limit=10
        )
        res_query = m.query_records("customers", query_payload)
        self.assertEqual(res_query["total_matching"], 1)
        row = res_query["rows"][0]
        self.assertEqual(row["name"], "Jane Doe")
        self.assertEqual(row["email"], "jane@example.com")
        self.assertNotIn("city", row)  # Excluded column projection

        # 3. UPDATE: Update Jane's city and name
        upd_payload = m.UpdateRecordPayload(
            schema_name="main",
            primary_key={"customer_id": 99},
            updates={"name": "Jane Smith", "city": "Seattle"}
        )
        res_upd = m.update_record("customers", upd_payload)
        self.assertTrue(res_upd["ok"])

        # Verify update
        check_query = m.query_records("customers", m.RecordQueryPayload(
            schema_name="main",
            columns=["name", "city"],
            filters=[m.FilterRule(column="customer_id", operator="equals", value=99)]
        ))
        self.assertEqual(check_query["rows"][0]["name"], "Jane Smith")
        self.assertEqual(check_query["rows"][0]["city"], "Seattle")

        # 4. DELETE: Delete record 99
        del_payload = m.DeleteRecordPayload(
            schema_name="main",
            primary_key={"customer_id": 99}
        )
        res_del = m.delete_record("customers", del_payload)
        self.assertTrue(res_del["ok"])

        # Verify deletion
        count_after = m.table_row_count("customers", schema="main")
        self.assertEqual(count_after["count"], 3)

    def test_07_drop_table(self):
        # Feature 3: Delete Table
        drop_res = m.drop_table("items_catalog", schema="main")
        self.assertTrue(drop_res["ok"])
        self.assertEqual(drop_res["dropped"], "items_catalog")

        # Verify it no longer exists
        tables_res = m.list_tables(schema="main")
        t_names = [t["name"] for t in tables_res["tables"]]
        self.assertNotIn("items_catalog", t_names)

    def test_08_saved_selections_preserved(self):
        # Feature 7: Saved Data Selections still work
        selections = m.get_saved_selections()
        self.assertIn("selections", selections)
        self.assertGreaterEqual(len(selections["selections"]), 1)


if __name__ == "__main__":
    unittest.main()

