import json
from datetime import datetime, timezone

from shared.db import table, SESSIONS_TABLE, USERS_TABLE
from shared.response import ok, fail


def handle(event, method, path):
    # PUT /sessions/{session_id}/end  (no JWT auth — session_id is the token)
    parts = path.strip("/").split("/")
    if method == "PUT" and len(parts) == 3 and parts[0] == "sessions" and parts[2] == "end":
        return _end_session(event, parts[1])
    return fail("Not found", 404)


def _end_session(event, session_id):
    body = json.loads(event.get("body") or "{}")
    duration = body.get("duration_seconds")

    res = table(SESSIONS_TABLE).get_item(Key={"session_id": session_id})
    item = res.get("Item")
    if not item:
        return ok({"ended": False})

    if item.get("logout_at"):
        return ok({"ended": True})  # already ended

    now = datetime.now(timezone.utc)
    if not duration:
        try:
            login_at = datetime.fromisoformat(item["login_at"])
            duration = int((now - login_at).total_seconds())
        except Exception:
            duration = 0

    table(SESSIONS_TABLE).update_item(
        Key={"session_id": session_id},
        UpdateExpression="SET logout_at=:la, duration_seconds=:d",
        ExpressionAttributeValues={
            ":la": now.isoformat(),
            ":d": int(duration),
        },
    )

    # Accumulate total_seconds on user record (best-effort)
    try:
        table(USERS_TABLE).update_item(
            Key={"email": item["email"]},
            UpdateExpression="ADD total_seconds :d",
            ExpressionAttributeValues={":d": int(duration)},
        )
    except Exception:
        pass

    return ok({"ended": True})
