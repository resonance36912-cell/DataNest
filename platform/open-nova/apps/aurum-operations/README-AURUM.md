# Resonance Aurum Operations v0.2.2

A sovereign, local-first operations application for Resonance Aurum Naturals.

## Included

- Products, prices, opening stock, reorder levels and product updates
- Batch receipts, expiry metadata and stock movements
- Customers and customer updates
- Multi-item orders with transactional stock deduction
- Unpaid-order cancellation with automatic stock restoration
- Partial and full payments with outstanding balances
- Printable invoices
- Low-stock alerts
- Append-only operational audit history
- Verified local SQLite backups with SHA-256
- Portable CSV exports for products, customers and orders
- Local SQLite database under `data/aurum_operations.db`
- Automated local tests

## Sovereignty boundaries

- No Lovable dependency
- No hosted Supabase dependency
- No external AI dependency
- No cloud database dependency
- Binds to `127.0.0.1` by default
- Source, backups and SQLite data remain under the local Open Nova workspace
- Production cutover is not enabled by this package

## Local addresses

- Dashboard: `http://127.0.0.1:4345/`
- Health: `http://127.0.0.1:4345/health`
- API documentation: `http://127.0.0.1:4345/docs`

## Test

```powershell
python -m unittest discover -s tests -v
```

## Ealiophin runtime compatibility

The launcher prefers an Open Nova virtual environment when present and otherwise falls back to the installed Windows Python runtime after verifying FastAPI, Uvicorn and Pydantic.
