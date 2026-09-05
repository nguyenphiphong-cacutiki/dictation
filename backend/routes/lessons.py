import contextlib
import json
import os
import uuid
from datetime import datetime, timezone

import boto3
from shared.auth import get_user, require_user
from shared.db import LESSONS_TABLE, PROGRESS_TABLE, ddb, table
from shared.response import fail, ok

_s3 = None
AUDIO_BUCKET = os.environ.get("AUDIO_BUCKET", "")
_region = os.environ.get("AWS_REGION", "ap-southeast-1")


def s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", region_name=_region)
    return _s3


def _audio_url(key):
    if not key:
        return None
    return s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": AUDIO_BUCKET, "Key": key},
        ExpiresIn=86400,
    )


def _path_id(path, prefix):
    parts = path[len(prefix):].strip("/").split("/")
    return parts[0] if parts else None


def handle(event, method, path):
    user = get_user(event)

    # GET /lessons
    if method == "GET" and path == "/lessons":
        return _list(user)

    # POST /lessons
    if method == "POST" and path == "/lessons":
        user, err = require_user(event)
        if err:
            return err
        return _create(event, user)

    lesson_id = _path_id(path, "/lessons")
    if not lesson_id:
        return fail("Not found", 404)

    # GET /lessons/{id}
    if method == "GET":
        return _get(lesson_id, user)

    # PUT /lessons/{id}
    if method == "PUT":
        user, err = require_user(event)
        if err:
            return err
        return _update(event, lesson_id, user)

    # DELETE /lessons/{id}
    if method == "DELETE":
        user, err = require_user(event)
        if err:
            return err
        return _delete(lesson_id, user)

    return fail("Not found", 404)


def _list(user):
    lessons_tbl = table(LESSONS_TABLE)

    # Fetch all lessons (scan, acceptable at this scale)
    scan = lessons_tbl.scan()
    all_lessons = scan.get("Items", [])

    # Paginate if needed
    while "LastEvaluatedKey" in scan:
        scan = lessons_tbl.scan(ExclusiveStartKey=scan["LastEvaluatedKey"])
        all_lessons.extend(scan.get("Items", []))

    my_lessons = []
    community_by_owner = {}

    for lesson in all_lessons:
        status = lesson.get("status", "published")
        owner_id = lesson.get("owner_id", "")
        # Strip sentences from list view for payload size
        lesson_summary = {
            "lesson_id": lesson["lesson_id"],
            "title": lesson.get("title", ""),
            "sentence_count": int(lesson.get("sentence_count", 0)),
            "status": status,
            "admin_feedback": lesson.get("admin_feedback", ""),
            "owner_email": lesson.get("owner_email", ""),
            "owner_id": owner_id,
            "created_at": lesson.get("created_at", ""),
        }

        if user and owner_id == user["user_id"]:
            my_lessons.append(lesson_summary)
        elif status == "published":
            key = lesson.get("owner_email", owner_id)
            community_by_owner.setdefault(key, {"owner_email": key, "lessons": []})
            community_by_owner[key]["lessons"].append(lesson_summary)

    # Sort my lessons newest first
    my_lessons.sort(key=lambda x: x["created_at"], reverse=True)

    community = list(community_by_owner.values())
    for group in community:
        group["lessons"].sort(key=lambda x: x["created_at"], reverse=True)

    # Attach progress if user is logged in
    if user:
        all_ids = [lesson["lesson_id"] for lesson in my_lessons]
        for g in community:
            all_ids.extend(lesson["lesson_id"] for lesson in g["lessons"])
        progress_map = _bulk_progress(user["user_id"], all_ids)
        for lesson in my_lessons:
            lesson["progress"] = progress_map.get(lesson["lesson_id"], {"current_sentence": 0, "practice_count": 0})
        for g in community:
            for lesson in g["lessons"]:
                lesson["progress"] = progress_map.get(lesson["lesson_id"], {"current_sentence": 0, "practice_count": 0})

    return ok({"my_lessons": my_lessons, "community": community})


def _bulk_progress(user_id, lesson_ids):
    if not lesson_ids:
        return {}
    result = {}
    # Batch get (max 100 per call)
    for i in range(0, len(lesson_ids), 100):
        batch_ids = lesson_ids[i:i+100]
        keys = [{"user_id": user_id, "lesson_id": lid} for lid in batch_ids]
        res = ddb().batch_get_item(
            RequestItems={PROGRESS_TABLE: {"Keys": keys}}
        )
        for item in res.get("Responses", {}).get(PROGRESS_TABLE, []):
            result[item["lesson_id"]] = {
                "current_sentence": int(item.get("current_sentence", 0)),
                "practice_count": int(item.get("practice_count", 0)),
            }
    return result


def _get(lesson_id, user):
    res = table(LESSONS_TABLE).get_item(Key={"lesson_id": lesson_id})
    lesson = res.get("Item")
    if not lesson:
        return fail("Lesson not found", 404)

    status = lesson.get("status", "published")
    is_owner = user and lesson.get("owner_id") == user["user_id"]
    is_admin = user and user.get("is_admin")

    if status != "published" and not is_owner and not is_admin:
        return fail("Lesson not found", 404)

    lesson["audio_url"] = _audio_url(lesson.get("audio_key"))
    lesson["sentence_count"] = int(lesson.get("sentence_count", 0))

    # Attach user progress
    if user:
        prog = table(PROGRESS_TABLE).get_item(
            Key={"user_id": user["user_id"], "lesson_id": lesson_id}
        ).get("Item")
        lesson["progress"] = {
            "current_sentence": int(prog["current_sentence"]) if prog else 0,
            "practice_count": int(prog["practice_count"]) if prog else 0,
        }

    return ok(lesson)


def _create(event, user):
    body = json.loads(event.get("body") or "{}")
    title = (body.get("title") or "").strip()
    sentences = body.get("sentences") or []
    audio_key = (body.get("audio_key") or "").strip()

    if not title:
        return fail("Title is required")
    if not audio_key:
        return fail("Audio is required")

    lesson_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    item = {
        "lesson_id": lesson_id,
        "owner_id": user["user_id"],
        "owner_email": user["email"],
        "title": title,
        "audio_key": audio_key,
        "sentences": sentences,
        "sentence_count": len(sentences),
        "status": "published",
        "admin_feedback": "",
        "created_at": now,
        "updated_at": now,
    }
    table(LESSONS_TABLE).put_item(Item=item)
    return ok({"lesson_id": lesson_id}, 201)


def _update(event, lesson_id, user):
    res = table(LESSONS_TABLE).get_item(Key={"lesson_id": lesson_id})
    lesson = res.get("Item")
    if not lesson:
        return fail("Lesson not found", 404)
    if lesson["owner_id"] != user["user_id"] and not user.get("is_admin"):
        return fail("Forbidden", 403)

    body = json.loads(event.get("body") or "{}")
    updates = {}
    if "title" in body:
        updates["title"] = body["title"]
    if "sentences" in body:
        updates["sentences"] = body["sentences"]
        updates["sentence_count"] = len(body["sentences"])
    if "audio_key" in body:
        updates["audio_key"] = body["audio_key"]
    # Re-publishing after being pulled
    if lesson.get("status") == "pulled" and lesson["owner_id"] == user["user_id"]:
        updates["status"] = "published"
        updates["admin_feedback"] = ""

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    expr = "SET " + ", ".join(f"#{k}=:{k}" for k in updates)
    names = {f"#{k}": k for k in updates}
    values = {f":{k}": v for k, v in updates.items()}

    table(LESSONS_TABLE).update_item(
        Key={"lesson_id": lesson_id},
        UpdateExpression=expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )
    return ok({"lesson_id": lesson_id})


def _delete(lesson_id, user):
    res = table(LESSONS_TABLE).get_item(Key={"lesson_id": lesson_id})
    lesson = res.get("Item")
    if not lesson:
        return fail("Lesson not found", 404)
    if lesson["owner_id"] != user["user_id"] and not user.get("is_admin"):
        return fail("Forbidden", 403)

    table(LESSONS_TABLE).delete_item(Key={"lesson_id": lesson_id})

    # Best-effort cleanup of the lesson's audio object
    audio_key = lesson.get("audio_key")
    if audio_key and AUDIO_BUCKET:
        with contextlib.suppress(Exception):
            s3().delete_object(Bucket=AUDIO_BUCKET, Key=audio_key)

    return ok({"deleted": True})
