import json
from datetime import datetime, timezone

from shared.auth import require_user
from shared.db import table, LESSONS_TABLE, PROGRESS_TABLE
from shared.response import ok, fail


def handle(event, method, path):
    user, err = require_user(event)
    if err:
        return err

    lesson_id = path.strip("/").split("/")[-1]
    if not lesson_id or lesson_id == "progress":
        return fail("Lesson ID required")

    if method == "GET":
        return _get(user["user_id"], lesson_id)
    if method == "PUT":
        return _update(event, user["user_id"], lesson_id)
    return fail("Not found", 404)


def _get(user_id, lesson_id):
    res = table(PROGRESS_TABLE).get_item(Key={"user_id": user_id, "lesson_id": lesson_id})
    item = res.get("Item")
    if not item:
        return ok({"current_sentence": 0, "practice_count": 0})
    return ok({
        "current_sentence": int(item.get("current_sentence", 0)),
        "practice_count": int(item.get("practice_count", 0)),
    })


def _update(event, user_id, lesson_id):
    body = json.loads(event.get("body") or "{}")
    current_sentence = body.get("current_sentence")
    increment_practice = body.get("increment_practice", False)

    if current_sentence is None:
        return fail("current_sentence is required")

    # Get current practice count
    res = table(PROGRESS_TABLE).get_item(Key={"user_id": user_id, "lesson_id": lesson_id})
    existing = res.get("Item")
    practice_count = int(existing.get("practice_count", 0)) if existing else 0
    if increment_practice:
        practice_count += 1

    table(PROGRESS_TABLE).put_item(Item={
        "user_id": user_id,
        "lesson_id": lesson_id,
        "current_sentence": int(current_sentence),
        "practice_count": practice_count,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    })
    return ok({"current_sentence": int(current_sentence), "practice_count": practice_count})
