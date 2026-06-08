import json
from datetime import datetime, timezone

from shared.auth import require_admin
from shared.db import table, LESSONS_TABLE
from shared.response import ok, fail


def handle(event, method, path):
    user, err = require_admin(event)
    if err:
        return err

    # GET /admin/lessons
    if method == "GET" and path == "/admin/lessons":
        return _list_all()

    # PUT /admin/lessons/{id}/pull
    if method == "PUT" and path.endswith("/pull"):
        lesson_id = path.split("/")[3]
        return _pull(event, lesson_id)

    # PUT /admin/lessons/{id}/restore
    if method == "PUT" and path.endswith("/restore"):
        lesson_id = path.split("/")[3]
        return _restore(lesson_id)

    return fail("Not found", 404)


def _list_all():
    lessons_tbl = table(LESSONS_TABLE)
    scan = lessons_tbl.scan()
    items = scan.get("Items", [])
    while "LastEvaluatedKey" in scan:
        scan = lessons_tbl.scan(ExclusiveStartKey=scan["LastEvaluatedKey"])
        items.extend(scan.get("Items", []))

    for item in items:
        item.pop("sentences", None)
        item["sentence_count"] = int(item.get("sentence_count", 0))

    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return ok({"lessons": items})


def _pull(event, lesson_id):
    body = json.loads(event.get("body") or "{}")
    feedback = (body.get("feedback") or "").strip()
    if not feedback:
        return fail("Feedback is required when pulling a lesson")

    res = table(LESSONS_TABLE).get_item(Key={"lesson_id": lesson_id})
    if not res.get("Item"):
        return fail("Lesson not found", 404)

    table(LESSONS_TABLE).update_item(
        Key={"lesson_id": lesson_id},
        UpdateExpression="SET #s=:s, #f=:f, #u=:u",
        ExpressionAttributeNames={"#s": "status", "#f": "admin_feedback", "#u": "updated_at"},
        ExpressionAttributeValues={
            ":s": "pulled",
            ":f": feedback,
            ":u": datetime.now(timezone.utc).isoformat(),
        },
    )
    return ok({"pulled": True})


def _restore(lesson_id):
    res = table(LESSONS_TABLE).get_item(Key={"lesson_id": lesson_id})
    if not res.get("Item"):
        return fail("Lesson not found", 404)

    table(LESSONS_TABLE).update_item(
        Key={"lesson_id": lesson_id},
        UpdateExpression="SET #s=:s, #f=:f, #u=:u",
        ExpressionAttributeNames={"#s": "status", "#f": "admin_feedback", "#u": "updated_at"},
        ExpressionAttributeValues={
            ":s": "published",
            ":f": "",
            ":u": datetime.now(timezone.utc).isoformat(),
        },
    )
    return ok({"restored": True})
