from __future__ import annotations

import csv
import hashlib
import html
import io
import json
import os
import secrets
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field, field_validator

APP_VERSION = "0.2.2"
ROOT = Path(__file__).resolve().parent
DEFAULT_DB_PATH = ROOT / "data" / "aurum_operations.db"
INDEX_PATH = ROOT / "static" / "index.html"
BACKUP_DIR = ROOT / "backups"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def as_cents(value: float) -> int:
    return int(round(float(value) * 100))


def as_money(cents: int | None) -> float:
    return round((cents or 0) / 100.0, 2)


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 20000")
    return conn


@contextmanager
def db_session(db_path: Path):
    conn = connect(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_code TEXT NOT NULL UNIQUE,
    quantity INTEGER NOT NULL DEFAULT 0,
    received_date TEXT,
    expiry_date TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'unpaid',
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    paid_total_cents INTEGER NOT NULL DEFAULT 0 CHECK (paid_total_cents >= 0),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0)
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    method TEXT NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    paid_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL,
    movement_type TEXT NOT NULL,
    quantity_delta INTEGER NOT NULL,
    reference_type TEXT NOT NULL DEFAULT '',
    reference_id TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
"""


def init_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with db_session(db_path) as conn:
        conn.executescript(SCHEMA)


def row_dict(row: sqlite3.Row) -> dict[str, Any]:
    return dict(row)


def product_payload(row: sqlite3.Row) -> dict[str, Any]:
    data = row_dict(row)
    data["unit_price"] = as_money(data.pop("unit_price_cents"))
    data["active"] = bool(data["active"])
    data["low_stock"] = data["stock_quantity"] <= data["reorder_level"]
    return data


def order_payload(row: sqlite3.Row) -> dict[str, Any]:
    data = row_dict(row)
    data["subtotal"] = as_money(data.pop("subtotal_cents"))
    data["paid_total"] = as_money(data.pop("paid_total_cents"))
    data["balance"] = round(data["subtotal"] - data["paid_total"], 2)
    return data


def audit(
    conn: sqlite3.Connection,
    action: str,
    entity_type: str,
    entity_id: int | str,
    details: dict[str, Any] | None = None,
) -> None:
    conn.execute(
        "INSERT INTO audit_log(action, entity_type, entity_id, details_json, created_at) VALUES (?, ?, ?, ?, ?)",
        (action, entity_type, str(entity_id), json.dumps(details or {}, sort_keys=True), utc_now()),
    )


class ProductCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    unit_price: float = Field(ge=0, le=10_000_000)
    initial_stock: int = Field(default=0, ge=0, le=10_000_000)
    reorder_level: int = Field(default=5, ge=0, le=10_000_000)

    @field_validator("sku", "name")
    @classmethod
    def strip_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class StockAdjustment(BaseModel):
    quantity_delta: int = Field(ge=-10_000_000, le=10_000_000)
    reason: str = Field(min_length=1, max_length=500)
    batch_code: str | None = Field(default=None, max_length=100)


class BatchCreate(BaseModel):
    product_id: int = Field(gt=0)
    batch_code: str = Field(min_length=1, max_length=100)
    quantity: int = Field(default=0, ge=0, le=10_000_000)
    received_date: date | None = None
    expiry_date: date | None = None
    notes: str = Field(default="", max_length=1000)


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(default="", max_length=320)
    phone: str = Field(default="", max_length=80)
    address: str = Field(default="", max_length=1000)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class OrderItemCreate(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=1_000_000)


class OrderCreate(BaseModel):
    customer_id: int = Field(gt=0)
    items: list[OrderItemCreate] = Field(min_length=1, max_length=100)
    notes: str = Field(default="", max_length=2000)


class PaymentCreate(BaseModel):
    amount: float = Field(gt=0, le=10_000_000)
    method: str = Field(min_length=1, max_length=80)
    reference: str = Field(default="", max_length=200)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    unit_price: float | None = Field(default=None, ge=0, le=10_000_000)
    reorder_level: int | None = Field(default=None, ge=0, le=10_000_000)
    active: bool | None = None


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=1000)


def csv_download(filename: str, headers: list[str], rows: Iterable[Iterable[Any]]) -> Response:
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(app.state.db_path)
    yield


def create_app(db_path: str | Path | None = None) -> FastAPI:
    resolved_db = Path(db_path or os.environ.get("AURUM_DB_PATH") or DEFAULT_DB_PATH).resolve()
    application = FastAPI(
        title="Resonance Aurum Operations",
        description="Sovereign local inventory, customer, order, payment and audit management.",
        version=APP_VERSION,
        lifespan=lifespan,
    )
    application.state.db_path = resolved_db
    application.state.backup_dir = resolved_db.parent / "backups"

    @application.get("/", response_class=HTMLResponse, include_in_schema=False)
    def home() -> HTMLResponse:
        if not INDEX_PATH.exists():
            return HTMLResponse("<h1>Resonance Aurum Operations</h1><p>UI file is missing.</p>", status_code=500)
        return HTMLResponse(INDEX_PATH.read_text(encoding="utf-8"))

    @application.get("/health")
    @application.get("/api/health")
    def health() -> dict[str, Any]:
        try:
            with db_session(application.state.db_path) as conn:
                conn.execute("SELECT 1").fetchone()
            return {
                "status": "healthy",
                "application": "aurum-operations",
                "version": APP_VERSION,
                "database": "local-sqlite",
                "external_ai_required": False,
                "timestamp": utc_now(),
            }
        except sqlite3.Error as exc:
            raise HTTPException(status_code=503, detail=f"Local database unavailable: {exc}") from exc

    @application.get("/api/summary")
    def summary() -> dict[str, Any]:
        with db_session(application.state.db_path) as conn:
            product_count = conn.execute("SELECT COUNT(*) FROM products WHERE active = 1").fetchone()[0]
            customer_count = conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
            order_count = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
            low_stock_count = conn.execute(
                "SELECT COUNT(*) FROM products WHERE active = 1 AND stock_quantity <= reorder_level"
            ).fetchone()[0]
            inventory_value = conn.execute(
                "SELECT COALESCE(SUM(stock_quantity * unit_price_cents), 0) FROM products WHERE active = 1"
            ).fetchone()[0]
            outstanding = conn.execute(
                "SELECT COALESCE(SUM(subtotal_cents - paid_total_cents), 0) FROM orders WHERE status != 'cancelled'"
            ).fetchone()[0]
        return {
            "products": product_count,
            "customers": customer_count,
            "orders": order_count,
            "low_stock": low_stock_count,
            "inventory_value": as_money(inventory_value),
            "outstanding_balance": as_money(outstanding),
        }

    @application.get("/api/products")
    def list_products(include_inactive: bool = False) -> list[dict[str, Any]]:
        query = "SELECT * FROM products"
        params: tuple[Any, ...] = ()
        if not include_inactive:
            query += " WHERE active = 1"
        query += " ORDER BY name COLLATE NOCASE"
        with db_session(application.state.db_path) as conn:
            rows = conn.execute(query, params).fetchall()
        return [product_payload(row) for row in rows]

    @application.post("/api/products", status_code=201)
    def create_product(payload: ProductCreate) -> dict[str, Any]:
        now = utc_now()
        sku = payload.sku.upper()
        try:
            with db_session(application.state.db_path) as conn:
                cursor = conn.execute(
                    """
                    INSERT INTO products(sku, name, description, unit_price_cents, stock_quantity, reorder_level, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        sku,
                        payload.name,
                        payload.description.strip(),
                        as_cents(payload.unit_price),
                        payload.initial_stock,
                        payload.reorder_level,
                        now,
                        now,
                    ),
                )
                product_id = cursor.lastrowid
                if payload.initial_stock:
                    conn.execute(
                        """
                        INSERT INTO stock_movements(product_id, movement_type, quantity_delta, reference_type, reference_id, notes, created_at)
                        VALUES (?, 'opening_balance', ?, 'product', ?, 'Initial stock', ?)
                        """,
                        (product_id, payload.initial_stock, str(product_id), now),
                    )
                audit(conn, "create", "product", product_id, {"sku": sku, "name": payload.name})
                row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="A product with this SKU already exists") from exc
        return product_payload(row)

    @application.patch("/api/products/{product_id}")
    def update_product(product_id: int, payload: ProductUpdate) -> dict[str, Any]:
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise HTTPException(status_code=422, detail="No product changes supplied")
        now = utc_now()
        assignments: list[str] = []
        values: list[Any] = []
        for field, value in changes.items():
            column = field
            if field == "unit_price":
                column = "unit_price_cents"
                value = as_cents(value)
            elif field == "active":
                value = int(bool(value))
            elif isinstance(value, str):
                value = value.strip()
            assignments.append(f"{column} = ?")
            values.append(value)
        assignments.append("updated_at = ?")
        values.extend([now, product_id])
        with db_session(application.state.db_path) as conn:
            existing = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
            if existing is None:
                raise HTTPException(status_code=404, detail="Product not found")
            conn.execute(f"UPDATE products SET {', '.join(assignments)} WHERE id = ?", values)
            audit(conn, "update", "product", product_id, changes)
            row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        return product_payload(row)

    @application.post("/api/products/{product_id}/adjust-stock")
    def adjust_stock(product_id: int, payload: StockAdjustment) -> dict[str, Any]:
        if payload.quantity_delta == 0:
            raise HTTPException(status_code=422, detail="quantity_delta must not be zero")
        now = utc_now()
        with db_session(application.state.db_path) as conn:
            row = conn.execute("SELECT * FROM products WHERE id = ? AND active = 1", (product_id,)).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Product not found")
            new_quantity = row["stock_quantity"] + payload.quantity_delta
            if new_quantity < 0:
                raise HTTPException(status_code=409, detail="Adjustment would create negative stock")
            batch_id = None
            if payload.batch_code:
                batch = conn.execute("SELECT id, quantity FROM batches WHERE batch_code = ?", (payload.batch_code,)).fetchone()
                if batch is None:
                    raise HTTPException(status_code=404, detail="Batch code not found")
                batch_id = batch["id"]
                batch_new = batch["quantity"] + payload.quantity_delta
                if batch_new < 0:
                    raise HTTPException(status_code=409, detail="Adjustment would create negative batch stock")
                conn.execute("UPDATE batches SET quantity = ? WHERE id = ?", (batch_new, batch_id))
            conn.execute(
                "UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?",
                (new_quantity, now, product_id),
            )
            conn.execute(
                """
                INSERT INTO stock_movements(product_id, batch_id, movement_type, quantity_delta, reference_type, reference_id, notes, created_at)
                VALUES (?, ?, 'manual_adjustment', ?, 'product', ?, ?, ?)
                """,
                (product_id, batch_id, payload.quantity_delta, str(product_id), payload.reason.strip(), now),
            )
            audit(
                conn,
                "stock_adjustment",
                "product",
                product_id,
                {"quantity_delta": payload.quantity_delta, "reason": payload.reason, "new_quantity": new_quantity},
            )
            updated = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        return product_payload(updated)

    @application.get("/api/low-stock")
    def low_stock() -> list[dict[str, Any]]:
        with db_session(application.state.db_path) as conn:
            rows = conn.execute(
                """
                SELECT * FROM products
                WHERE active = 1 AND stock_quantity <= reorder_level
                ORDER BY (reorder_level - stock_quantity) DESC, name COLLATE NOCASE
                """
            ).fetchall()
        return [product_payload(row) for row in rows]

    @application.get("/api/batches")
    def list_batches(product_id: int | None = None) -> list[dict[str, Any]]:
        query = """
            SELECT b.*, p.name AS product_name, p.sku AS product_sku
            FROM batches b JOIN products p ON p.id = b.product_id
        """
        params: tuple[Any, ...] = ()
        if product_id is not None:
            query += " WHERE b.product_id = ?"
            params = (product_id,)
        query += " ORDER BY b.created_at DESC"
        with db_session(application.state.db_path) as conn:
            return [row_dict(row) for row in conn.execute(query, params).fetchall()]

    @application.post("/api/batches", status_code=201)
    def create_batch(payload: BatchCreate) -> dict[str, Any]:
        if payload.expiry_date and payload.received_date and payload.expiry_date < payload.received_date:
            raise HTTPException(status_code=422, detail="expiry_date cannot be before received_date")
        now = utc_now()
        try:
            with db_session(application.state.db_path) as conn:
                product = conn.execute("SELECT id FROM products WHERE id = ? AND active = 1", (payload.product_id,)).fetchone()
                if product is None:
                    raise HTTPException(status_code=404, detail="Product not found")
                cursor = conn.execute(
                    """
                    INSERT INTO batches(product_id, batch_code, quantity, received_date, expiry_date, notes, created_at)
                    VALUES (?, ?, 0, ?, ?, ?, ?)
                    """,
                    (
                        payload.product_id,
                        payload.batch_code.strip().upper(),
                        payload.received_date.isoformat() if payload.received_date else None,
                        payload.expiry_date.isoformat() if payload.expiry_date else None,
                        payload.notes.strip(),
                        now,
                    ),
                )
                batch_id = cursor.lastrowid
                if payload.quantity:
                    current = conn.execute("SELECT stock_quantity FROM products WHERE id = ?", (payload.product_id,)).fetchone()[0]
                    conn.execute("UPDATE batches SET quantity = ? WHERE id = ?", (payload.quantity, batch_id))
                    conn.execute(
                        "UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?",
                        (current + payload.quantity, now, payload.product_id),
                    )
                    conn.execute(
                        """
                        INSERT INTO stock_movements(product_id, batch_id, movement_type, quantity_delta, reference_type, reference_id, notes, created_at)
                        VALUES (?, ?, 'batch_receipt', ?, 'batch', ?, 'Batch received', ?)
                        """,
                        (payload.product_id, batch_id, payload.quantity, str(batch_id), now),
                    )
                audit(conn, "create", "batch", batch_id, {"batch_code": payload.batch_code, "quantity": payload.quantity})
                row = conn.execute(
                    """
                    SELECT b.*, p.name AS product_name, p.sku AS product_sku
                    FROM batches b JOIN products p ON p.id = b.product_id WHERE b.id = ?
                    """,
                    (batch_id,),
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="A batch with this code already exists") from exc
        return row_dict(row)

    @application.get("/api/customers")
    def list_customers() -> list[dict[str, Any]]:
        with db_session(application.state.db_path) as conn:
            rows = conn.execute("SELECT * FROM customers ORDER BY name COLLATE NOCASE").fetchall()
        return [row_dict(row) for row in rows]

    @application.post("/api/customers", status_code=201)
    def create_customer(payload: CustomerCreate) -> dict[str, Any]:
        now = utc_now()
        with db_session(application.state.db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO customers(name, email, phone, address, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (payload.name.strip(), payload.email.strip(), payload.phone.strip(), payload.address.strip(), now, now),
            )
            customer_id = cursor.lastrowid
            audit(conn, "create", "customer", customer_id, {"name": payload.name})
            row = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
        return row_dict(row)

    @application.patch("/api/customers/{customer_id}")
    def update_customer(customer_id: int, payload: CustomerUpdate) -> dict[str, Any]:
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise HTTPException(status_code=422, detail="No customer changes supplied")
        assignments: list[str] = []
        values: list[Any] = []
        for field, value in changes.items():
            if isinstance(value, str):
                value = value.strip()
            assignments.append(f"{field} = ?")
            values.append(value)
        assignments.append("updated_at = ?")
        values.extend([utc_now(), customer_id])
        with db_session(application.state.db_path) as conn:
            existing = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
            if existing is None:
                raise HTTPException(status_code=404, detail="Customer not found")
            conn.execute(f"UPDATE customers SET {', '.join(assignments)} WHERE id = ?", values)
            audit(conn, "update", "customer", customer_id, changes)
            row = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
        return row_dict(row)

    @application.get("/api/orders")
    def list_orders(limit: int = Query(default=100, ge=1, le=1000)) -> list[dict[str, Any]]:
        with db_session(application.state.db_path) as conn:
            rows = conn.execute(
                """
                SELECT o.*, c.name AS customer_name
                FROM orders o JOIN customers c ON c.id = o.customer_id
                ORDER BY o.created_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [order_payload(row) for row in rows]

    def fetch_order(conn: sqlite3.Connection, order_id: int) -> dict[str, Any]:
        order = conn.execute(
            """
            SELECT o.*, c.name AS customer_name, c.email AS customer_email,
                   c.phone AS customer_phone, c.address AS customer_address
            FROM orders o JOIN customers c ON c.id = o.customer_id
            WHERE o.id = ?
            """,
            (order_id,),
        ).fetchone()
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        data = order_payload(order)
        items = conn.execute("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", (order_id,)).fetchall()
        data["items"] = []
        for item in items:
            item_data = row_dict(item)
            item_data["unit_price"] = as_money(item_data.pop("unit_price_cents"))
            item_data["line_total"] = as_money(item_data.pop("line_total_cents"))
            data["items"].append(item_data)
        payments = conn.execute("SELECT * FROM payments WHERE order_id = ? ORDER BY paid_at", (order_id,)).fetchall()
        data["payments"] = []
        for payment in payments:
            payment_data = row_dict(payment)
            payment_data["amount"] = as_money(payment_data.pop("amount_cents"))
            data["payments"].append(payment_data)
        return data

    @application.get("/api/orders/{order_id}")
    def get_order(order_id: int) -> dict[str, Any]:
        with db_session(application.state.db_path) as conn:
            return fetch_order(conn, order_id)

    @application.post("/api/orders", status_code=201)
    def create_order(payload: OrderCreate) -> dict[str, Any]:
        combined: dict[int, int] = {}
        for item in payload.items:
            combined[item.product_id] = combined.get(item.product_id, 0) + item.quantity
        now = utc_now()
        order_number = f"AUR-{datetime.now().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(2).upper()}"
        with db_session(application.state.db_path) as conn:
            customer = conn.execute("SELECT id FROM customers WHERE id = ?", (payload.customer_id,)).fetchone()
            if customer is None:
                raise HTTPException(status_code=404, detail="Customer not found")
            product_rows: dict[int, sqlite3.Row] = {}
            subtotal_cents = 0
            for product_id, quantity in combined.items():
                row = conn.execute("SELECT * FROM products WHERE id = ? AND active = 1", (product_id,)).fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail=f"Product {product_id} not found")
                if row["stock_quantity"] < quantity:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Insufficient stock for {row['name']}: available {row['stock_quantity']}, requested {quantity}",
                    )
                product_rows[product_id] = row
                subtotal_cents += row["unit_price_cents"] * quantity
            cursor = conn.execute(
                """
                INSERT INTO orders(order_number, customer_id, status, subtotal_cents, paid_total_cents, notes, created_at, updated_at)
                VALUES (?, ?, 'unpaid', ?, 0, ?, ?, ?)
                """,
                (order_number, payload.customer_id, subtotal_cents, payload.notes.strip(), now, now),
            )
            order_id = cursor.lastrowid
            for product_id, quantity in combined.items():
                row = product_rows[product_id]
                line_total = row["unit_price_cents"] * quantity
                conn.execute(
                    """
                    INSERT INTO order_items(order_id, product_id, product_name, sku, quantity, unit_price_cents, line_total_cents)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (order_id, product_id, row["name"], row["sku"], quantity, row["unit_price_cents"], line_total),
                )
                new_stock = row["stock_quantity"] - quantity
                conn.execute(
                    "UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?",
                    (new_stock, now, product_id),
                )
                conn.execute(
                    """
                    INSERT INTO stock_movements(product_id, movement_type, quantity_delta, reference_type, reference_id, notes, created_at)
                    VALUES (?, 'sale', ?, 'order', ?, ?, ?)
                    """,
                    (product_id, -quantity, str(order_id), f"Sale {order_number}", now),
                )
            audit(conn, "create", "order", order_id, {"order_number": order_number, "subtotal": as_money(subtotal_cents)})
            return fetch_order(conn, order_id)

    @application.post("/api/orders/{order_id}/payments", status_code=201)
    def add_payment(order_id: int, payload: PaymentCreate) -> dict[str, Any]:
        amount_cents = as_cents(payload.amount)
        now = utc_now()
        with db_session(application.state.db_path) as conn:
            order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
            if order is None:
                raise HTTPException(status_code=404, detail="Order not found")
            if order["status"] == "cancelled":
                raise HTTPException(status_code=409, detail="Cancelled orders cannot receive payments")
            balance = order["subtotal_cents"] - order["paid_total_cents"]
            if amount_cents > balance:
                raise HTTPException(status_code=409, detail=f"Payment exceeds outstanding balance of R{as_money(balance):.2f}")
            conn.execute(
                "INSERT INTO payments(order_id, amount_cents, method, reference, paid_at) VALUES (?, ?, ?, ?, ?)",
                (order_id, amount_cents, payload.method.strip(), payload.reference.strip(), now),
            )
            new_paid = order["paid_total_cents"] + amount_cents
            status = "paid" if new_paid >= order["subtotal_cents"] else "partially_paid"
            conn.execute(
                "UPDATE orders SET paid_total_cents = ?, status = ?, updated_at = ? WHERE id = ?",
                (new_paid, status, now, order_id),
            )
            audit(conn, "payment", "order", order_id, {"amount": payload.amount, "method": payload.method, "status": status})
            return fetch_order(conn, order_id)

    @application.post("/api/orders/{order_id}/cancel")
    def cancel_order(order_id: int) -> dict[str, Any]:
        now = utc_now()
        with db_session(application.state.db_path) as conn:
            order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
            if order is None:
                raise HTTPException(status_code=404, detail="Order not found")
            if order["status"] == "cancelled":
                return fetch_order(conn, order_id)
            if order["paid_total_cents"] > 0:
                raise HTTPException(status_code=409, detail="Orders with payments cannot be cancelled automatically")
            items = conn.execute("SELECT product_id, quantity FROM order_items WHERE order_id = ?", (order_id,)).fetchall()
            for item in items:
                conn.execute(
                    "UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?",
                    (item["quantity"], now, item["product_id"]),
                )
                conn.execute(
                    """
                    INSERT INTO stock_movements(product_id, movement_type, quantity_delta, reference_type, reference_id, notes, created_at)
                    VALUES (?, 'order_cancelled', ?, 'order', ?, 'Stock restored after order cancellation', ?)
                    """,
                    (item["product_id"], item["quantity"], str(order_id), now),
                )
            conn.execute("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?", (now, order_id))
            audit(conn, "cancel", "order", order_id, {"stock_restored": True})
            return fetch_order(conn, order_id)

    @application.post("/api/backups", status_code=201)
    def create_backup() -> dict[str, Any]:
        application.state.backup_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        destination = application.state.backup_dir / f"aurum-operations-{timestamp}.db"
        source_conn = connect(application.state.db_path)
        destination_conn = sqlite3.connect(destination)
        try:
            source_conn.backup(destination_conn)
        finally:
            destination_conn.close()
            source_conn.close()
        metadata = {
            "filename": destination.name,
            "created_at": utc_now(),
            "size_bytes": destination.stat().st_size,
            "sha256": sha256_file(destination),
        }
        with db_session(application.state.db_path) as conn:
            audit(conn, "backup", "database", destination.name, metadata)
        return metadata

    @application.get("/api/backups")
    def list_backups() -> list[dict[str, Any]]:
        application.state.backup_dir.mkdir(parents=True, exist_ok=True)
        records = []
        for item in sorted(application.state.backup_dir.glob("aurum-operations-*.db"), reverse=True):
            records.append({
                "filename": item.name,
                "size_bytes": item.stat().st_size,
                "modified_at": datetime.fromtimestamp(item.stat().st_mtime, tz=timezone.utc).replace(microsecond=0).isoformat(),
                "sha256": sha256_file(item),
            })
        return records

    @application.get("/api/export/products.csv")
    def export_products() -> Response:
        with db_session(application.state.db_path) as conn:
            rows = conn.execute(
                "SELECT sku, name, description, unit_price_cents, stock_quantity, reorder_level, active, created_at, updated_at FROM products ORDER BY name"
            ).fetchall()
        return csv_download(
            "aurum-products.csv",
            ["sku", "name", "description", "unit_price_zar", "stock_quantity", "reorder_level", "active", "created_at", "updated_at"],
            ([r["sku"], r["name"], r["description"], f"{as_money(r['unit_price_cents']):.2f}", r["stock_quantity"], r["reorder_level"], r["active"], r["created_at"], r["updated_at"]] for r in rows),
        )

    @application.get("/api/export/customers.csv")
    def export_customers() -> Response:
        with db_session(application.state.db_path) as conn:
            rows = conn.execute("SELECT name, email, phone, address, created_at, updated_at FROM customers ORDER BY name").fetchall()
        return csv_download(
            "aurum-customers.csv",
            ["name", "email", "phone", "address", "created_at", "updated_at"],
            ([r["name"], r["email"], r["phone"], r["address"], r["created_at"], r["updated_at"]] for r in rows),
        )

    @application.get("/api/export/orders.csv")
    def export_orders() -> Response:
        with db_session(application.state.db_path) as conn:
            rows = conn.execute(
                """
                SELECT o.order_number, c.name AS customer_name, o.status, o.subtotal_cents, o.paid_total_cents,
                       (o.subtotal_cents - o.paid_total_cents) AS balance_cents, o.notes, o.created_at, o.updated_at
                FROM orders o JOIN customers c ON c.id = o.customer_id ORDER BY o.id DESC
                """
            ).fetchall()
        return csv_download(
            "aurum-orders.csv",
            ["order_number", "customer", "status", "total_zar", "paid_zar", "balance_zar", "notes", "created_at", "updated_at"],
            ([r["order_number"], r["customer_name"], r["status"], f"{as_money(r['subtotal_cents']):.2f}", f"{as_money(r['paid_total_cents']):.2f}", f"{as_money(r['balance_cents']):.2f}", r["notes"], r["created_at"], r["updated_at"]] for r in rows),
        )

    @application.get("/api/audit")
    def list_audit(limit: int = Query(default=100, ge=1, le=1000)) -> list[dict[str, Any]]:
        with db_session(application.state.db_path) as conn:
            rows = conn.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        result = []
        for row in rows:
            data = row_dict(row)
            try:
                data["details"] = json.loads(data.pop("details_json"))
            except json.JSONDecodeError:
                data["details"] = {"raw": data.pop("details_json")}
            result.append(data)
        return result

    @application.get("/api/stock-movements")
    def list_stock_movements(limit: int = Query(default=100, ge=1, le=1000)) -> list[dict[str, Any]]:
        with db_session(application.state.db_path) as conn:
            rows = conn.execute(
                """
                SELECT s.*, p.name AS product_name, p.sku AS product_sku
                FROM stock_movements s JOIN products p ON p.id = s.product_id
                ORDER BY s.id DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [row_dict(row) for row in rows]

    @application.get("/invoice/{order_id}", response_class=HTMLResponse, include_in_schema=False)
    def invoice(order_id: int) -> HTMLResponse:
        with db_session(application.state.db_path) as conn:
            data = fetch_order(conn, order_id)
        item_rows = "".join(
            f"<tr><td>{html.escape(item['sku'])}</td><td>{html.escape(item['product_name'])}</td>"
            f"<td>{item['quantity']}</td><td>R{item['unit_price']:.2f}</td><td>R{item['line_total']:.2f}</td></tr>"
            for item in data["items"]
        )
        invoice_html = f"""
        <!doctype html><html><head><meta charset='utf-8'><title>Invoice {html.escape(data['order_number'])}</title>
        <style>body{{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;color:#222}}h1{{color:#5b21b6}}
        table{{width:100%;border-collapse:collapse;margin-top:24px}}th,td{{border-bottom:1px solid #ddd;padding:10px;text-align:left}}
        .totals{{margin-left:auto;width:320px;margin-top:24px}}.totals div{{display:flex;justify-content:space-between;padding:6px}}
        .actions{{margin-bottom:24px}}@media print{{.actions{{display:none}}}}</style></head><body>
        <div class='actions'><button onclick='window.print()'>Print / Save PDF</button></div>
        <h1>Resonance Aurum Naturals</h1><h2>Invoice {html.escape(data['order_number'])}</h2>
        <p><strong>Customer:</strong> {html.escape(data['customer_name'])}<br>
        <strong>Email:</strong> {html.escape(data['customer_email'] or '')}<br>
        <strong>Phone:</strong> {html.escape(data['customer_phone'] or '')}<br>
        <strong>Address:</strong> {html.escape(data['customer_address'] or '')}</p>
        <p><strong>Date:</strong> {html.escape(data['created_at'])}<br><strong>Status:</strong> {html.escape(data['status'])}</p>
        <table><thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
        <tbody>{item_rows}</tbody></table>
        <div class='totals'><div><span>Subtotal</span><strong>R{data['subtotal']:.2f}</strong></div>
        <div><span>Paid</span><strong>R{data['paid_total']:.2f}</strong></div>
        <div><span>Balance</span><strong>R{data['balance']:.2f}</strong></div></div>
        <p style='margin-top:48px;color:#666'>Generated locally by Resonance Open Nova. No external AI or hosted database required.</p>
        </body></html>
        """
        return HTMLResponse(invoice_html)

    return application


app = create_app()
