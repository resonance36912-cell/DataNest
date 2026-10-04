$ErrorActionPreference = "Stop"
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/v1/backend/health" | ConvertTo-Json -Depth 10
