"""Covers backend/routes/admin.py — lesson moderation and user inspection."""
from routes import admin as routes_admin

from ..conftest import body_of, make_event


def _call(method, path, body=None, token=None):
    return routes_admin.handle(make_event(method, path, body, token=token), method, path)


def _seed_lesson(aws, lesson_id, **extra):
    item = {
        "lesson_id": lesson_id,
        "title": f"Lesson {lesson_id}",
        "owner_id": "u1",
        "owner_email": "u1@x.com",
        "sentences": [{"transcript": "hi"}],
        "sentence_count": 1,
        "status": "published",
        "created_at": f"2026-01-0{lesson_id[-1]}T00:00:00+00:00",
    }
    item.update(extra)
    aws.lessons.put_item(Item=item)


def test_all_admin_routes_require_auth():
    assert _call("GET", "/admin/lessons")["statusCode"] == 401


def test_all_admin_routes_reject_non_admin(user_token):
    assert _call("GET", "/admin/lessons", token=user_token)["statusCode"] == 403


def test_unknown_admin_path_404(admin_token):
    assert _call("GET", "/admin/other", token=admin_token)["statusCode"] == 404


def test_list_all_strips_sentences_and_sorts_newest_first(aws, admin_token):
    _seed_lesson(aws, "l1")
    _seed_lesson(aws, "l2")
    data = body_of(_call("GET", "/admin/lessons", token=admin_token))
    assert [lesson["lesson_id"] for lesson in data["lessons"]] == ["l2", "l1"]
    for lesson in data["lessons"]:
        assert "sentences" not in lesson
        assert lesson["sentence_count"] == 1


def test_pull_requires_feedback(aws, admin_token):
    _seed_lesson(aws, "l1")
    resp = _call("PUT", "/admin/lessons/l1/pull", {"feedback": "  "}, token=admin_token)
    assert resp["statusCode"] == 400


def test_pull_missing_lesson_404(admin_token):
    resp = _call("PUT", "/admin/lessons/ghost/pull", {"feedback": "bad"}, token=admin_token)
    assert resp["statusCode"] == 404


def test_pull_sets_status_and_feedback(aws, admin_token):
    _seed_lesson(aws, "l1")
    resp = _call("PUT", "/admin/lessons/l1/pull", {"feedback": "fix timing"}, token=admin_token)
    assert body_of(resp) == {"pulled": True}
    item = aws.lessons.get_item(Key={"lesson_id": "l1"})["Item"]
    assert item["status"] == "pulled"
    assert item["admin_feedback"] == "fix timing"
    assert item["updated_at"]


def test_restore_missing_lesson_404(admin_token):
    resp = _call("PUT", "/admin/lessons/ghost/restore", token=admin_token)
    assert resp["statusCode"] == 404


def test_restore_republishes_and_clears_feedback(aws, admin_token):
    _seed_lesson(aws, "l1", status="pulled", admin_feedback="bad audio")
    resp = _call("PUT", "/admin/lessons/l1/restore", token=admin_token)
    assert body_of(resp) == {"restored": True}
    item = aws.lessons.get_item(Key={"lesson_id": "l1"})["Item"]
    assert item["status"] == "published"
    assert item["admin_feedback"] == ""


def test_list_users_normalizes_total_seconds_and_sorts(aws, admin_token):
    aws.users.put_item(Item={"email": "a@x.com", "user_id": "u1",
                             "created_at": "2026-01-01", "total_seconds": None})
    aws.users.put_item(Item={"email": "b@x.com", "user_id": "u2",
                             "created_at": "2026-02-01", "total_seconds": 90})
    data = body_of(_call("GET", "/admin/users", token=admin_token))
    assert [u["email"] for u in data["users"]] == ["b@x.com", "a@x.com"]
    assert data["users"][0]["total_seconds"] == 90
    assert data["users"][1]["total_seconds"] == 0


def test_user_sessions_filters_by_user_and_casts_duration(aws, admin_token):
    aws.sessions.put_item(Item={"session_id": "s1", "user_id": "u1",
                                "login_at": "2026-01-01", "duration_seconds": 30})
    aws.sessions.put_item(Item={"session_id": "s2", "user_id": "u1",
                                "login_at": "2026-01-02", "duration_seconds": None})
    aws.sessions.put_item(Item={"session_id": "s3", "user_id": "other",
                                "login_at": "2026-01-03"})
    data = body_of(_call("GET", "/admin/users/u1/sessions", token=admin_token))
    assert {s["session_id"] for s in data["sessions"]} == {"s1", "s2"}
    by_id = {s["session_id"]: s for s in data["sessions"]}
    assert by_id["s1"]["duration_seconds"] == 30
    assert by_id["s2"]["duration_seconds"] is None


def test_user_lessons_strips_sentences(aws, admin_token):
    _seed_lesson(aws, "l1", owner_id="u1")
    _seed_lesson(aws, "l2", owner_id="someone-else")
    data = body_of(_call("GET", "/admin/users/u1/lessons", token=admin_token))
    assert [lesson["lesson_id"] for lesson in data["lessons"]] == ["l1"]
    assert "sentences" not in data["lessons"][0]
    assert data["lessons"][0]["sentence_count"] == 1
