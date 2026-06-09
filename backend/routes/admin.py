import json
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key

from shared.auth import require_admin
from shared.db import table, LESSONS_TABLE, USERS_TABLE, SESSIONS_TABLE
from shared.response import ok, fail


def handle(event, method, path):
    user, err = require_admin(event)
    if err:
        return err

    # GET /admin/lessons
    if method == "GET" and path == "/admin/lessons":
        return _list_all()

    # PUT /admin/lessons/{id}/pull
    if method == "PUT" and path.endswith("/pull") and path.startswith("/admin/lessons/"):
        lesson_id = path.split("/")[3]
        return _pull(event, lesson_id)

    # PUT /admin/lessons/{id}/restore
    if method == "PUT" and path.endswith("/restore") and path.startswith("/admin/lessons/"):
        lesson_id = path.split("/")[3]
        return _restore(lesson_id)

    # GET /admin/users
    if method == "GET" and path == "/admin/users":
        return _list_users()

    # GET /admin/users/{user_id}/sessions
    if method == "GET" and path.startswith("/admin/users/") and path.endswith("/sessions"):
        uid = path.split("/")[3]
        return _user_sessions(uid)

    # GET /admin/users/{user_id}/lessons
    if method == "GET" and path.startswith("/admin/users/") and path.endswith("/lessons"):
        uid = path.split("/")[3]
        return _user_lessons(uid)

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


def _list_users():
    users_tbl = table(USERS_TABLE)
    resp = users_tbl.scan()
    users = resp.get("Items", [])
    while "LastEvaluatedKey" in resp:
        resp = users_tbl.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        users.extend(resp.get("Items", []))

    for u in users:
        u["total_seconds"] = int(u.get("total_seconds") or 0)

    users.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return ok({"users": users})


def _user_sessions(user_id):
    resp = table(SESSIONS_TABLE).query(
        IndexName="user-index",
        KeyConditionExpression=Key("user_id").eq(user_id),
        ScanIndexForward=False,
    )
    sessions = resp.get("Items", [])
    while "LastEvaluatedKey" in resp:
        resp = table(SESSIONS_TABLE).query(
            IndexName="user-index",
            KeyConditionExpression=Key("user_id").eq(user_id),
            ExclusiveStartKey=resp["LastEvaluatedKey"],
            ScanIndexForward=False,
        )
        sessions.extend(resp.get("Items", []))

    for s in sessions:
        if s.get("duration_seconds") is not None:
            s["duration_seconds"] = int(s["duration_seconds"])

    return ok({"sessions": sessions})


def _user_lessons(user_id):
    resp = table(LESSONS_TABLE).query(
        IndexName="owner-index",
        KeyConditionExpression=Key("owner_id").eq(user_id),
        ScanIndexForward=False,
    )
    lessons = resp.get("Items", [])
    for lesson in lessons:
        lesson.pop("sentences", None)
        lesson["sentence_count"] = int(lesson.get("sentence_count") or 0)
    return ok({"lessons": lessons})
