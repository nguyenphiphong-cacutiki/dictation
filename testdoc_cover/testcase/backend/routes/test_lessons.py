"""Covers backend/routes/lessons.py — CRUD, visibility rules, progress merging."""
from routes import lessons as routes_lessons
from shared.auth import create_token

from ..conftest import body_of, make_event


def _call(method, path, body=None, token=None):
    return routes_lessons.handle(make_event(method, path, body, token=token), method, path)


def _seed_lesson(aws, lesson_id, owner_id="u1", owner_email="u1@x.com", **extra):
    item = {
        "lesson_id": lesson_id,
        "title": f"Lesson {lesson_id}",
        "owner_id": owner_id,
        "owner_email": owner_email,
        "audio_key": f"audio/{owner_id}/{lesson_id}.wav",
        "sentences": [{"transcript": "hello", "start": "0:00.000", "end": "0:01.000"}],
        "sentence_count": 1,
        "status": "published",
        "admin_feedback": "",
        "created_at": f"2026-01-0{lesson_id[-1]}T00:00:00+00:00",
    }
    item.update(extra)
    aws.lessons.put_item(Item=item)
    return item


OWNER_TOKEN = create_token("u1", "u1@x.com", False)
OTHER_TOKEN = create_token("u2", "u2@x.com", False)
ADMIN_TOKEN = create_token("adm", "admin@example.com", True)


# ── GET /lessons ──────────────────────────────────────────────────────────────

def test_list_anonymous_sees_only_published_community(aws):
    _seed_lesson(aws, "l1")
    _seed_lesson(aws, "l2", status="pulled")
    data = body_of(_call("GET", "/lessons"))
    assert data["my_lessons"] == []
    all_ids = [lesson["lesson_id"] for g in data["community"] for lesson in g["lessons"]]
    assert all_ids == ["l1"]
    # list view must not leak full sentences
    assert "sentences" not in data["community"][0]["lessons"][0]


def test_list_owner_sees_own_lessons_including_pulled(aws):
    _seed_lesson(aws, "l1")
    _seed_lesson(aws, "l2", status="pulled", admin_feedback="fix it")
    data = body_of(_call("GET", "/lessons", token=OWNER_TOKEN))
    ids = [lesson["lesson_id"] for lesson in data["my_lessons"]]
    assert ids == ["l2", "l1"]  # newest first
    assert data["community"] == []
    pulled = data["my_lessons"][0]
    assert pulled["status"] == "pulled"
    assert pulled["admin_feedback"] == "fix it"


def test_list_groups_community_by_owner_email(aws):
    _seed_lesson(aws, "l1", owner_id="a", owner_email="a@x.com")
    _seed_lesson(aws, "l2", owner_id="b", owner_email="b@x.com")
    _seed_lesson(aws, "l3", owner_id="b", owner_email="b@x.com")
    data = body_of(_call("GET", "/lessons", token=OTHER_TOKEN))
    groups = {g["owner_email"]: [x["lesson_id"] for x in g["lessons"]] for g in data["community"]}
    assert groups == {"a@x.com": ["l1"], "b@x.com": ["l3", "l2"]}


def test_list_attaches_progress_for_logged_in_user(aws):
    _seed_lesson(aws, "l1")
    aws.progress.put_item(Item={"user_id": "u1", "lesson_id": "l1",
                                "current_sentence": 3, "practice_count": 2})
    data = body_of(_call("GET", "/lessons", token=OWNER_TOKEN))
    assert data["my_lessons"][0]["progress"] == {"current_sentence": 3, "practice_count": 2}


def test_list_defaults_progress_to_zero(aws):
    _seed_lesson(aws, "l1")
    data = body_of(_call("GET", "/lessons", token=OWNER_TOKEN))
    assert data["my_lessons"][0]["progress"] == {"current_sentence": 0, "practice_count": 0}


def test_bulk_progress_batches_over_100_ids(aws):
    ids = [f"l{i}" for i in range(150)]
    for lid in ids[:120]:
        aws.progress.put_item(Item={"user_id": "u1", "lesson_id": lid,
                                    "current_sentence": 1, "practice_count": 1})
    result = routes_lessons._bulk_progress("u1", ids)
    assert len(result) == 120
    assert routes_lessons._bulk_progress("u1", []) == {}


# ── GET /lessons/{id} ─────────────────────────────────────────────────────────

def test_get_missing_lesson_404():
    assert _call("GET", "/lessons/ghost")["statusCode"] == 404


def test_get_trailing_slash_only_404():
    assert _call("GET", "/lessons/")["statusCode"] == 404


def test_get_pulled_lesson_hidden_from_strangers(aws):
    _seed_lesson(aws, "l1", status="pulled")
    assert _call("GET", "/lessons/l1")["statusCode"] == 404
    assert _call("GET", "/lessons/l1", token=OTHER_TOKEN)["statusCode"] == 404


def test_get_pulled_lesson_visible_to_owner_and_admin(aws):
    _seed_lesson(aws, "l1", status="pulled")
    assert _call("GET", "/lessons/l1", token=OWNER_TOKEN)["statusCode"] == 200
    assert _call("GET", "/lessons/l1", token=ADMIN_TOKEN)["statusCode"] == 200


def test_get_lesson_includes_presigned_audio_url_and_progress(aws):
    _seed_lesson(aws, "l1")
    aws.progress.put_item(Item={"user_id": "u1", "lesson_id": "l1",
                                "current_sentence": 1, "practice_count": 4})
    data = body_of(_call("GET", "/lessons/l1", token=OWNER_TOKEN))
    assert data["audio_url"].startswith("https://s3.fake/audio/u1/l1.wav")
    assert data["progress"] == {"current_sentence": 1, "practice_count": 4}
    assert data["sentence_count"] == 1


def test_get_lesson_anonymous_has_no_progress_and_no_url_without_key(aws):
    _seed_lesson(aws, "l1", audio_key="")
    data = body_of(_call("GET", "/lessons/l1"))
    assert data["audio_url"] is None
    assert "progress" not in data


# ── POST /lessons ─────────────────────────────────────────────────────────────

def test_create_requires_auth():
    assert _call("POST", "/lessons", {"title": "x"})["statusCode"] == 401


def test_create_requires_title(aws):
    resp = _call("POST", "/lessons", {"audio_key": "k"}, token=OWNER_TOKEN)
    assert resp["statusCode"] == 400
    assert "Title" in body_of(resp)["error"]


def test_create_requires_audio(aws):
    resp = _call("POST", "/lessons", {"title": "T"}, token=OWNER_TOKEN)
    assert resp["statusCode"] == 400
    assert "Audio" in body_of(resp)["error"]


def test_create_persists_lesson_with_metadata(aws):
    body = {"title": " My Lesson ", "audio_key": "audio/u1/a.wav",
            "sentences": [{"transcript": "a"}, {"transcript": "b"}]}
    resp = _call("POST", "/lessons", body, token=OWNER_TOKEN)
    assert resp["statusCode"] == 201
    lesson_id = body_of(resp)["lesson_id"]
    item = aws.lessons.get_item(Key={"lesson_id": lesson_id})["Item"]
    assert item["title"] == "My Lesson"
    assert item["owner_id"] == "u1"
    assert item["owner_email"] == "u1@x.com"
    assert item["sentence_count"] == 2
    assert item["status"] == "published"
    assert item["created_at"] == item["updated_at"]


# ── PUT /lessons/{id} ─────────────────────────────────────────────────────────

def test_update_requires_auth(aws):
    _seed_lesson(aws, "l1")
    assert _call("PUT", "/lessons/l1", {"title": "x"})["statusCode"] == 401


def test_update_missing_lesson_404():
    assert _call("PUT", "/lessons/ghost", {"title": "x"}, token=OWNER_TOKEN)["statusCode"] == 404


def test_update_forbidden_for_non_owner(aws):
    _seed_lesson(aws, "l1")
    assert _call("PUT", "/lessons/l1", {"title": "x"}, token=OTHER_TOKEN)["statusCode"] == 403


def test_update_owner_changes_fields_and_count(aws):
    _seed_lesson(aws, "l1")
    body = {"title": "New", "sentences": [{"transcript": "a"}, {"transcript": "b"}],
            "audio_key": "audio/u1/new.wav"}
    resp = _call("PUT", "/lessons/l1", body, token=OWNER_TOKEN)
    assert resp["statusCode"] == 200
    item = aws.lessons.get_item(Key={"lesson_id": "l1"})["Item"]
    assert item["title"] == "New"
    assert item["sentence_count"] == 2
    assert item["audio_key"] == "audio/u1/new.wav"


def test_update_by_owner_republishes_pulled_lesson(aws):
    _seed_lesson(aws, "l1", status="pulled", admin_feedback="fix")
    _call("PUT", "/lessons/l1", {"title": "Fixed"}, token=OWNER_TOKEN)
    item = aws.lessons.get_item(Key={"lesson_id": "l1"})["Item"]
    assert item["status"] == "published"
    assert item["admin_feedback"] == ""


def test_update_by_admin_does_not_republish_others_pulled_lesson(aws):
    _seed_lesson(aws, "l1", status="pulled", admin_feedback="fix")
    resp = _call("PUT", "/lessons/l1", {"title": "Edited"}, token=ADMIN_TOKEN)
    assert resp["statusCode"] == 200
    item = aws.lessons.get_item(Key={"lesson_id": "l1"})["Item"]
    assert item["status"] == "pulled"
    assert item["title"] == "Edited"


# ── DELETE /lessons/{id} ──────────────────────────────────────────────────────

def test_delete_requires_auth(aws):
    _seed_lesson(aws, "l1")
    assert _call("DELETE", "/lessons/l1")["statusCode"] == 401


def test_delete_missing_lesson_404():
    assert _call("DELETE", "/lessons/ghost", token=OWNER_TOKEN)["statusCode"] == 404


def test_delete_forbidden_for_non_owner(aws):
    _seed_lesson(aws, "l1")
    assert _call("DELETE", "/lessons/l1", token=OTHER_TOKEN)["statusCode"] == 403
    assert aws.lessons.get_item(Key={"lesson_id": "l1"})  # still there


def test_delete_by_owner_removes_lesson(aws):
    _seed_lesson(aws, "l1")
    resp = _call("DELETE", "/lessons/l1", token=OWNER_TOKEN)
    assert body_of(resp) == {"deleted": True}
    assert aws.lessons.get_item(Key={"lesson_id": "l1"}) == {}


def test_delete_by_admin_removes_lesson(aws):
    _seed_lesson(aws, "l1")
    assert _call("DELETE", "/lessons/l1", token=ADMIN_TOKEN)["statusCode"] == 200
    assert aws.lessons.get_item(Key={"lesson_id": "l1"}) == {}


def test_unsupported_method_on_lesson_404(aws):
    _seed_lesson(aws, "l1")
    assert _call("PATCH", "/lessons/l1", token=OWNER_TOKEN)["statusCode"] == 404
