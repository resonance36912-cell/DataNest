from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .agent import GovernanceViolation

APP_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AppRegistry:
    """Append-only application lifecycle registry owned by the controller."""

    def __init__(self, path: Path):
        self.path = path

    def _events(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        events: list[dict[str, Any]] = []
        for line_no, line in enumerate(self.path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError as exc:
                raise GovernanceViolation(f"Application registry is corrupt at line {line_no}.") from exc
            events.append(event)
        return events

    def _last_hash(self) -> str | None:
        events = self._events()
        return events[-1].get("sha256") if events else None

    def append(self, app_id: str, event: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        if not APP_ID_RE.fullmatch(app_id):
            raise GovernanceViolation("Invalid application id for registry.")
        if not re.fullmatch(r"[a-z][a-z0-9_]{1,63}", event):
            raise GovernanceViolation("Invalid registry event name.")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "timestamp": utc_now(),
            "app_id": app_id,
            "event": event,
            "payload": payload or {},
            "previous_sha256": self._last_hash(),
        }
        canonical = json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        record["sha256"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        return record

    def verify_chain(self) -> dict[str, Any]:
        events = self._events()
        previous: str | None = None
        for index, event in enumerate(events):
            stored = event.get("sha256")
            without_hash = {k: v for k, v in event.items() if k != "sha256"}
            canonical = json.dumps(without_hash, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
            expected = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            if event.get("previous_sha256") != previous or stored != expected:
                return {"valid": False, "events": len(events), "broken_index": index}
            previous = stored
        return {"valid": True, "events": len(events), "head_sha256": previous}

    def state(self, app_id: str) -> dict[str, Any] | None:
        state: dict[str, Any] | None = None
        for event in self._events():
            if event.get("app_id") != app_id:
                continue
            if state is None:
                state = {"app_id": app_id, "status": "registered", "history": []}
            payload = event.get("payload") or {}
            state.update(payload)
            state["status"] = payload.get("status", event.get("event", "registered"))
            state["updated_at"] = event.get("timestamp")
            state["history"].append({
                "event": event.get("event"),
                "timestamp": event.get("timestamp"),
                "sha256": event.get("sha256"),
            })
        return state

    def list_states(self) -> list[dict[str, Any]]:
        ids: list[str] = []
        for event in self._events():
            app_id = event.get("app_id")
            if isinstance(app_id, str) and app_id not in ids:
                ids.append(app_id)
        states = [self.state(app_id) for app_id in ids]
        return sorted((s for s in states if s is not None), key=lambda x: x.get("updated_at", ""), reverse=True)
