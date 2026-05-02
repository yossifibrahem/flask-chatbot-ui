"""
Conversation store — file-system CRUD.

All persistence is isolated here.  Nothing in this module imports Flask;
routes call these functions and decide what HTTP status to return.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

CONVERSATIONS_DIR = Path("conversations")
CONVERSATIONS_DIR.mkdir(exist_ok=True)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _path(conv_id: str) -> Path:
    return CONVERSATIONS_DIR / f"{conv_id}.json"


# ── Public API ────────────────────────────────────────────────────────────────

def list_all() -> list[dict]:
    """Return conversation summaries sorted by most-recently modified."""
    results: list[dict] = []
    for path in sorted(CONVERSATIONS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(path.read_text())
            results.append({
                "id":            path.stem,
                "title":         data.get("title", "Untitled"),
                "updated_at":    data.get("updated_at", ""),
                "message_count": len(data.get("messages", [])),
            })
        except Exception:
            pass
    return results


def load(conv_id: str) -> dict | None:
    path = _path(conv_id)
    return json.loads(path.read_text()) if path.exists() else None


def save(conv_id: str, data: dict) -> dict:
    """Stamp updated_at, write to disk, and return the saved data."""
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _path(conv_id).write_text(json.dumps(data, indent=2))
    return data


def delete(conv_id: str) -> bool:
    path = _path(conv_id)
    if path.exists():
        path.unlink()
        return True
    return False


def create(title: str = "New Conversation") -> dict:
    """Create, persist, and return a blank conversation."""
    conv_id = str(uuid.uuid4())
    return save(conv_id, {
        "id":         conv_id,
        "title":      title,
        "messages":   [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
