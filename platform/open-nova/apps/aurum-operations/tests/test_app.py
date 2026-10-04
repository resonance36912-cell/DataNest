from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app import create_app


class AurumOperationsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tempdir.name) / "test.db"
        self.client_context = TestClient(create_app(self.db_path))
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def test_complete_local_workflow(self) -> None:
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertFalse(health.json()["external_ai_required"])

        product = self.client.post(
            "/api/products",
            json={
                "sku": "AUR-100",
                "name": "Aurum Elixir",
                "unit_price": 299.00,
                "initial_stock": 10,
                "reorder_level": 3,
            },
        )
        self.assertEqual(product.status_code, 201, product.text)
        product_id = product.json()["id"]

        customer = self.client.post(
            "/api/customers",
            json={"name": "Test Customer", "email": "test@example.invalid", "phone": "000", "address": "Local"},
        )
        self.assertEqual(customer.status_code, 201, customer.text)
        customer_id = customer.json()["id"]

        order = self.client.post(
            "/api/orders",
            json={"customer_id": customer_id, "items": [{"product_id": product_id, "quantity": 2}], "notes": "Test"},
        )
        self.assertEqual(order.status_code, 201, order.text)
        order_data = order.json()
        self.assertEqual(order_data["subtotal"], 598.00)
        self.assertEqual(order_data["balance"], 598.00)

        stock = self.client.get("/api/products").json()[0]
        self.assertEqual(stock["stock_quantity"], 8)

        payment = self.client.post(
            f"/api/orders/{order_data['id']}/payments",
            json={"amount": 598.00, "method": "EFT", "reference": "TEST-001"},
        )
        self.assertEqual(payment.status_code, 201, payment.text)
        self.assertEqual(payment.json()["status"], "paid")
        self.assertEqual(payment.json()["balance"], 0.0)

        adjust = self.client.post(
            f"/api/products/{product_id}/adjust-stock",
            json={"quantity_delta": -6, "reason": "Test count"},
        )
        self.assertEqual(adjust.status_code, 200, adjust.text)
        self.assertTrue(adjust.json()["low_stock"])

        low = self.client.get("/api/low-stock")
        self.assertEqual(low.status_code, 200)
        self.assertEqual(len(low.json()), 1)

        invoice = self.client.get(f"/invoice/{order_data['id']}")
        self.assertEqual(invoice.status_code, 200)
        self.assertIn("Invoice", invoice.text)
        self.assertIn("Aurum Elixir", invoice.text)

        summary = self.client.get("/api/summary").json()
        self.assertEqual(summary["products"], 1)
        self.assertEqual(summary["customers"], 1)
        self.assertEqual(summary["orders"], 1)
        self.assertEqual(summary["outstanding_balance"], 0.0)

        audit = self.client.get("/api/audit").json()
        self.assertGreaterEqual(len(audit), 5)

    def test_cancel_order_restores_stock_and_records_audit(self) -> None:
        product = self.client.post(
            "/api/products",
            json={"sku": "AUR-CANCEL", "name": "Cancelable", "unit_price": 50, "initial_stock": 6, "reorder_level": 1},
        ).json()
        customer = self.client.post("/api/customers", json={"name": "Cancellation Test"}).json()
        order = self.client.post(
            "/api/orders",
            json={"customer_id": customer["id"], "items": [{"product_id": product["id"], "quantity": 2}]},
        ).json()
        self.assertEqual(self.client.get("/api/products").json()[0]["stock_quantity"], 4)

        cancelled = self.client.post(f"/api/orders/{order['id']}/cancel")
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()["status"], "cancelled")
        self.assertEqual(self.client.get("/api/products").json()[0]["stock_quantity"], 6)

        audit = self.client.get("/api/audit").json()
        self.assertTrue(any(row["action"] == "cancel" for row in audit))

    def test_backup_exports_and_updates(self) -> None:
        product = self.client.post(
            "/api/products",
            json={"sku": "AUR-EXPORT", "name": "Export Product", "unit_price": 299, "initial_stock": 2, "reorder_level": 1},
        ).json()
        customer = self.client.post("/api/customers", json={"name": "Export Customer"}).json()

        updated_product = self.client.patch(
            f"/api/products/{product['id']}", json={"unit_price": 319, "reorder_level": 2}
        )
        self.assertEqual(updated_product.status_code, 200, updated_product.text)
        self.assertEqual(updated_product.json()["unit_price"], 319.0)

        updated_customer = self.client.patch(
            f"/api/customers/{customer['id']}", json={"phone": "0210000000"}
        )
        self.assertEqual(updated_customer.status_code, 200, updated_customer.text)
        self.assertEqual(updated_customer.json()["phone"], "0210000000")

        backup = self.client.post("/api/backups")
        self.assertEqual(backup.status_code, 201, backup.text)
        self.assertEqual(len(backup.json()["sha256"]), 64)
        self.assertTrue((self.db_path.parent / "backups" / backup.json()["filename"]).exists())
        self.assertEqual(len(self.client.get("/api/backups").json()), 1)

        products_csv = self.client.get("/api/export/products.csv")
        self.assertEqual(products_csv.status_code, 200)
        self.assertIn("AUR-EXPORT", products_csv.text)
        self.assertIn("attachment;", products_csv.headers["content-disposition"])

        customers_csv = self.client.get("/api/export/customers.csv")
        self.assertEqual(customers_csv.status_code, 200)
        self.assertIn("Export Customer", customers_csv.text)

    def test_negative_stock_and_overpayment_are_blocked(self) -> None:
        product = self.client.post(
            "/api/products",
            json={"sku": "AUR-200", "name": "Test", "unit_price": 100, "initial_stock": 1, "reorder_level": 0},
        ).json()
        customer = self.client.post("/api/customers", json={"name": "Customer"}).json()

        too_many = self.client.post(
            "/api/orders",
            json={"customer_id": customer["id"], "items": [{"product_id": product["id"], "quantity": 2}]},
        )
        self.assertEqual(too_many.status_code, 409)

        order = self.client.post(
            "/api/orders",
            json={"customer_id": customer["id"], "items": [{"product_id": product["id"], "quantity": 1}]},
        ).json()
        overpay = self.client.post(
            f"/api/orders/{order['id']}/payments",
            json={"amount": 101, "method": "Cash"},
        )
        self.assertEqual(overpay.status_code, 409)

    def test_v02_update_cancel_backup_and_exports(self) -> None:
        product = self.client.post(
            "/api/products",
            json={"sku": "AUR-300", "name": "Aurum 100 ml", "unit_price": 299, "initial_stock": 6, "reorder_level": 2},
        ).json()
        updated = self.client.patch(
            f"/api/products/{product['id']}",
            json={"name": "Aurum Elixir 100 ml", "unit_price": 319},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["unit_price"], 319.0)

        batch = self.client.post(
            "/api/batches",
            json={"product_id": product["id"], "batch_code": "AUR-V02-B1", "quantity": 4, "received_date": "2026-08-26"},
        )
        self.assertEqual(batch.status_code, 201, batch.text)
        self.assertEqual(self.client.get("/api/products").json()[0]["stock_quantity"], 10)

        customer = self.client.post("/api/customers", json={"name": "Cancellation Test"}).json()
        order = self.client.post(
            "/api/orders",
            json={"customer_id": customer["id"], "items": [{"product_id": product["id"], "quantity": 3}]},
        ).json()
        self.assertEqual(self.client.get("/api/products").json()[0]["stock_quantity"], 7)
        cancelled = self.client.post(f"/api/orders/{order['id']}/cancel")
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()["status"], "cancelled")
        self.assertEqual(self.client.get("/api/products").json()[0]["stock_quantity"], 10)

        products_csv = self.client.get("/api/export/products.csv")
        self.assertEqual(products_csv.status_code, 200)
        self.assertIn("AUR-300", products_csv.text)
        orders_csv = self.client.get("/api/export/orders.csv")
        self.assertEqual(orders_csv.status_code, 200)
        self.assertIn(order["order_number"], orders_csv.text)


if __name__ == "__main__":
    unittest.main()
