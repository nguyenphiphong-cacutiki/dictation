"""Covers backend/routes/sessions.py — session end + usage accumulation.

This module had no coverage before this suite existed.
"""
from datetime import datetime, timedelta, timezone

from routes import sessions as routes_sessions

from ..conftest import body_of, make_event


def _end(session_id, body=None):
    path = f"/sessions/{session_id}/end"
    return routes_sessions.handle(make_event("PUT", path, body or {}), "PUT", path)


def _seed_session(aws, session_id="s1", minutes_ago=10, **extra):
    login_at = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()
    item = {"session_id": session_id, "user_id": "u1", "email": "u1@x.com",
            "login_at": login_at}
    item.update(extra)
    aws.sessions.put_item(Item=item)
    return item


def test_unknown_path_shape_404():
    for method, path in [("PUT", "/sessions/s1"), ("GET", "/sessions/s1/end"),
                         ("PUT", "/sessions"), ("PUT", "/other/s1/end")]:
        resp = routes_sessions.handle(make_event(method, path, {}), method, path)
        assert resp["statusCode"] == 404, f"{method} {path}"


def test_end_unknown_session_reports_not_ended():
    assert body_of(_end("ghost")) == {"ended": False}


def test_end_already_ended_session_is_idempotent(aws):
    _seed_session(aws, logout_at="2026-01-01T00:00:00+00:00", duration_seconds=60)
    assert body_of(_end("s1")) == {"ended": True}
    item = aws.sessions.get_item(Key={"session_id": "s1"})["Item"]
    assert item["duration_seconds"] == 60  # untouched


def test_end_with_explicit_duration(aws):
    _seed_session(aws)
    assert body_of(_end("s1", {"duration_seconds": 123})) == {"ended": True}
    item = aws.sessions.get_item(Key={"session_id": "s1"})["Item"]
    assert item["duration_seconds"] == 123
    assert item["logout_at"]


def test_end_accumulates_total_seconds_on_user(aws):
    aws.users.put_item(Item={"email": "u1@x.com", "user_id": "u1", "total_seconds": 100})
    _seed_session(aws)
    _end("s1", {"duration_seconds": 50})
    user = aws.users.get_item(Key={"email": "u1@x.com"})["Item"]
    assert user["total_seconds"] == 150


def test_end_computes_duration_from_login_at_when_missing(aws):
    _seed_session(aws, minutes_ago=10)
    _end("s1")
    item = aws.sessions.get_item(Key={"session_id": "s1"})["Item"]
    assert 590 <= item["duration_seconds"] <= 610  # ~10 minutes


def test_end_with_bad_login_at_defaults_duration_to_zero(aws):
    _seed_session(aws, login_at="not-a-date")
    _end("s1")
    item = aws.sessions.get_item(Key={"session_id": "s1"})["Item"]
    assert item["duration_seconds"] == 0


def test_user_accumulation_failure_does_not_fail_request(aws):
    _seed_session(aws)
    aws.users.fail_update = True
    resp = _end("s1", {"duration_seconds": 30})
    assert resp["statusCode"] == 200
    assert body_of(resp) == {"ended": True}
    # session itself was still closed
    assert aws.sessions.get_item(Key={"session_id": "s1"})["Item"]["logout_at"]
