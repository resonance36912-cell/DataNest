from __future__ import annotations

import json
import re
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

APPS = {
    "epublisher",
    "creative_studio",
    "sync_vision",
    "youtube_optimizer",
    "all_access",
    "hub",
    "rons",
    "unknown",
}
INFRA_STATUSES = {"unmeasured", "measured", "not_applicable"}
UNIT_KINDS = {"tokens", "bytes", "seconds", "frames", "operations", "requests", "pixels"}
SENSITIVE_KEY = re.compile(r"(prompt|content|secret|credential|password|passphrase|token|api[_-]?key|payload)", re.I)
EVENT_FIELDS = {
    "app",
    "operation",
    "provider",
    "model",
    "provider_api_cost_usd",
    "infrastructure_cost_status",
    "input_units",
    "output_units",
    "unit_kind",
    "duration_ms",
    "evidence_source",
    "external_provider",
    "request_id",
    "metadata",
}


def _text(value: Any, name: str, max_len: int, nullable: bool = False) -> str | None:
    if value is None or value == "":
        if nullable:
            return None
        raise ValueError(f"Invalid {name}")
    if not isinstance(value, str):
        raise ValueError(f"Invalid {name}")
    clean = value.strip()
    if not clean or len(clean) > max_len:
        raise ValueError(f"Invalid {name}")
    return clean


def normalize_app(value: Any) -> str:
    app = _text(value if value is not None else "unknown", "app", 80)
    if app not in APPS:
        raise ValueError("Unsupported cost-usage app")
    return app


def normalize_operation(value: Any) -> str:
    return str(_text(value if value is not None else "ai_chat", "operation", 120))


def _nonnegative_int(value: Any, name: str) -> int | None:
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"Invalid {name}")
    if value > 10**15:
        raise ValueError(f"Invalid {name}")
    return value


def _cost(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        cost = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("Invalid provider_api_cost_usd")
    if not cost.is_finite() or cost < 0 or cost > Decimal("1000000"):
        raise ValueError("Invalid provider_api_cost_usd")
    return cost.quantize(Decimal("0.00000001"))


def _walk_metadata(value: Any, depth: int = 0) -> None:
    if depth > 6:
        raise ValueError("Cost metadata is too deeply nested")
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str) or SENSITIVE_KEY.search(key):
                raise ValueError("Sensitive cost metadata key is not allowed")
            _walk_metadata(item, depth + 1)
    elif isinstance(value, list):
        for item in value:
            _walk_metadata(item, depth + 1)
    elif value is not None and not isinstance(value, (str, int, float, bool)):
        raise ValueError("Cost metadata must be JSON-compatible")


def _metadata(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("Invalid cost metadata")
    _walk_metadata(value)
    encoded = json.dumps(value, separators=(",", ":"), sort_keys=True)
    if len(encoded.encode("utf-8")) > 4096:
        raise ValueError("Cost metadata is too large")
    return value


def normalize_event(event: Any) -> dict[str, Any]:
    if not isinstance(event, dict) or set(event) != EVENT_FIELDS:
        raise ValueError("Invalid cost-usage event fields")
    infra = _text(event["infrastructure_cost_status"], "infrastructure_cost_status", 40)
    if infra not in INFRA_STATUSES:
        raise ValueError("Invalid infrastructure_cost_status")
    unit_kind = _text(event["unit_kind"], "unit_kind", 40, True)
    if unit_kind is not None and unit_kind not in UNIT_KINDS:
        raise ValueError("Invalid unit_kind")
    external = event["external_provider"]
    if not isinstance(external, bool):
        raise ValueError("Invalid external_provider")
    request_id = _text(event["request_id"], "request_id", 200, True) or str(uuid.uuid4())
    return {
        "app": normalize_app(event["app"]),
        "operation": normalize_operation(event["operation"]),
        "provider": _text(event["provider"], "provider", 120),
        "model": _text(event["model"], "model", 200, True),
        "provider_api_cost_usd": _cost(event["provider_api_cost_usd"]),
        "infrastructure_cost_status": infra,
        "input_units": _nonnegative_int(event["input_units"], "input_units"),
        "output_units": _nonnegative_int(event["output_units"], "output_units"),
        "unit_kind": unit_kind,
        "duration_ms": _nonnegative_int(event["duration_ms"], "duration_ms"),
        "evidence_source": _text(event["evidence_source"], "evidence_source", 120),
        "external_provider": external,
        "request_id": request_id,
        "metadata": _metadata(event["metadata"]),
    }


def _json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def record_event(conn: Any, event: Any) -> dict[str, Any]:
    row = normalize_event(event)
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO cost_usage_events
            (app,operation,provider,model,provider_api_cost_usd,infrastructure_cost_status,
             input_units,output_units,unit_kind,duration_ms,evidence_source,external_provider,
             request_id,metadata)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
            ON CONFLICT (request_id) DO NOTHING
            RETURNING id::text,occurred_at""",
            [
                row["app"],
                row["operation"],
                row["provider"],
                row["model"],
                row["provider_api_cost_usd"],
                row["infrastructure_cost_status"],
                row["input_units"],
                row["output_units"],
                row["unit_kind"],
                row["duration_ms"],
                row["evidence_source"],
                row["external_provider"],
                row["request_id"],
                _json(row["metadata"]),
            ],
        )
        inserted = cur.fetchone()
        if inserted is None:
            cur.execute(
                "SELECT id::text,occurred_at FROM cost_usage_events WHERE request_id=%s",
                [row["request_id"]],
            )
            inserted = cur.fetchone()
            duplicate = True
        else:
            duplicate = False
    if inserted is None:
        raise RuntimeError("Cost-usage receipt could not be resolved")
    return {
        "id": str(inserted[0]),
        "occurred_at": inserted[1].isoformat() if hasattr(inserted[1], "isoformat") else str(inserted[1]),
        "request_id": row["request_id"],
        "duplicate": duplicate,
    }


WINDOWS = {
    "today": "occurred_at >= date_trunc('day', now())",
    "7d": "occurred_at >= now() - interval '7 days'",
    "30d": "occurred_at >= now() - interval '30 days'",
    "all": "TRUE",
}


def read_summary(conn: Any) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    with conn.cursor() as cur:
        for label, predicate in WINDOWS.items():
            cur.execute(
                f"""SELECT app,provider,operation,external_provider,infrastructure_cost_status,
                    count(*)::bigint,
                    count(provider_api_cost_usd)::bigint,
                    COALESCE(sum(provider_api_cost_usd),0)::text,
                    COALESCE(sum(input_units),0)::bigint,
                    COALESCE(sum(output_units),0)::bigint,
                    COALESCE(sum(duration_ms),0)::bigint
                FROM cost_usage_events
                WHERE {predicate}
                GROUP BY app,provider,operation,external_provider,infrastructure_cost_status
                ORDER BY app,provider,operation"""
            )
            rows = []
            for row in cur.fetchall():
                rows.append(
                    {
                        "app": row[0],
                        "provider": row[1],
                        "operation": row[2],
                        "external_provider": bool(row[3]),
                        "infrastructure_cost_status": row[4],
                        "events": int(row[5]),
                        "costed_events": int(row[6]),
                        "provider_api_cost_usd": float(row[7]),
                        "input_units": int(row[8]),
                        "output_units": int(row[9]),
                        "duration_ms": int(row[10]),
                    }
                )
            summary[label] = {
                "events": sum(item["events"] for item in rows),
                "costed_events": sum(item["costed_events"] for item in rows),
                "provider_api_cost_usd": round(sum(item["provider_api_cost_usd"] for item in rows), 8),
                "rows": rows,
            }
    return summary


def ns_to_ms(value: Any) -> int | None:
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        return None
    return value // 1_000_000
