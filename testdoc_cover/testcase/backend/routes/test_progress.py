"""Covers backend/routes/progress.py — per-lesson progress read/write."""
from routes import progress as routes_progress

from ..conftest import body_of, make_event


def _call(method, path, body=None, token=None):
    return routes_progress.handle(make_event(method, path, body, token=token), method, path)


def test_progress_requires_auth():
    assert _call("GET", "/progress/l1")["statusCode"] == 401


def test_progress_requires_lesson_id(user_token):
    assert _call("GET", "/progress", token=user_token)["statusCode"] == 400
    assert _call("GET", "/progress/", token=user_token)["statusCode"] == 400


def test_unsupported_method_404(user_token):
    assert _call("POST", "/progress/l1", {}, token=user_token)["statusCode"] == 404


def test_get_defaults_to_zero_when_no_record(user_token):
    data = body_of(_call("GET", "/progress/l1", token=user_token))
    assert data == {"current_sentence": 0, "practice_count": 0}


def test_get_returns_stored_values_as_ints(aws, user_token):
    aws.progress.put_item(Item={"user_id": "user-1", "lesson_id": "l1",
                                "current_sentence": 5, "practice_count": 2})
    data = body_of(_call("GET", "/progress/l1", token=user_token))
    assert data == {"current_sentence": 5, "practice_count": 2}


def test_put_requires_current_sentence(user_token):
    resp = _call("PUT", "/progress/l1", {}, token=user_token)
    assert resp["statusCode"] == 400


def test_put_stores_progress(aws, user_token):
    data = body_of(_call("PUT", "/progress/l1", {"current_sentence": 4}, token=user_token))
    assert data == {"current_sentence": 4, "practice_count": 0}
    item = aws.progress.get_item(Key={"user_id": "user-1", "lesson_id": "l1"})["Item"]
    assert item["current_sentence"] == 4
    assert item["last_updated"]


def test_put_accepts_zero_position(user_token):
    data = body_of(_call("PUT", "/progress/l1", {"current_sentence": 0}, token=user_token))
    assert data["current_sentence"] == 0


def test_put_increment_practice_bumps_count(aws, user_token):
    aws.progress.put_item(Item={"user_id": "user-1", "lesson_id": "l1",
                                "current_sentence": 9, "practice_count": 3})
    data = body_of(_call("PUT", "/progress/l1",
                         {"current_sentence": 0, "increment_practice": True},
                         token=user_token))
    assert data == {"current_sentence": 0, "practice_count": 4}


def test_put_without_increment_preserves_count(aws, user_token):
    aws.progress.put_item(Item={"user_id": "user-1", "lesson_id": "l1",
                                "current_sentence": 1, "practice_count": 7})
    data = body_of(_call("PUT", "/progress/l1", {"current_sentence": 2}, token=user_token))
    assert data["practice_count"] == 7


def test_progress_is_scoped_per_user(aws, user_token):
    aws.progress.put_item(Item={"user_id": "someone-else", "lesson_id": "l1",
                                "current_sentence": 9, "practice_count": 9})
    data = body_of(_call("GET", "/progress/l1", token=user_token))
    assert data == {"current_sentence": 0, "practice_count": 0}
