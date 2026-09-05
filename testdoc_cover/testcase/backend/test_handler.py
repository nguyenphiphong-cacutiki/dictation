"""Covers backend/handler.py — routing, CORS, event formats, error containment."""
import json

import handler as handler_mod
from handler import handler

from .conftest import body_of, make_event


def _capture(monkeypatch, module_name):
    """Replace a route module's handle() and record what it was called with."""
    calls = []

    def fake_handle(event, method, path):
        calls.append((method, path))
        return {"statusCode": 200, "body": json.dumps({"route": module_name})}

    monkeypatch.setattr(getattr(handler_mod, module_name), "handle", fake_handle)
    return calls


def test_options_returns_cors_preflight():
    resp = handler(make_event("OPTIONS", "/lessons"), None)
    assert resp["statusCode"] == 200
    assert resp["headers"]["Access-Control-Allow-Origin"] == "*"
    assert "GET" in resp["headers"]["Access-Control-Allow-Methods"]


def test_all_responses_get_cors_headers():
    resp = handler(make_event("GET", "/nowhere"), None)
    assert resp["headers"]["Access-Control-Allow-Origin"] == "*"


def test_unknown_path_returns_404():
    resp = handler(make_event("GET", "/nowhere"), None)
    assert resp["statusCode"] == 404
    assert body_of(resp) == {"error": "Not found"}


def test_api_prefix_is_stripped(monkeypatch):
    calls = _capture(monkeypatch, "lessons")
    handler(make_event("GET", "/api/lessons"), None)
    assert calls == [("GET", "/lessons")]


def test_bare_api_prefix_becomes_root():
    resp = handler(make_event("GET", "/api"), None)
    assert resp["statusCode"] == 404  # "/" matches no route


def test_http_api_event_format_supported(monkeypatch):
    calls = _capture(monkeypatch, "lessons")
    event = {
        "requestContext": {"http": {"method": "get"}},
        "rawPath": "/lessons",
        "headers": {},
    }
    handler(event, None)
    assert calls == [("GET", "/lessons")]


def test_routing_dispatch_table(monkeypatch):
    for module, path in [
        ("auth", "/auth/request-otp"),
        ("admin", "/admin/users"),
        ("about", "/about"),
        ("lessons", "/lessons"),
        ("progress", "/progress/l1"),
        ("audio", "/audio/upload-url"),
        ("sessions", "/sessions/s1/end"),
        ("translate", "/translate"),
    ]:
        calls = _capture(monkeypatch, module)
        resp = handler(make_event("POST", path), None)
        assert calls == [("POST", path)], f"{path} should dispatch to {module}"
        assert body_of(resp) == {"route": module}


def test_admin_about_routes_to_about_not_admin(monkeypatch):
    about_calls = _capture(monkeypatch, "about")
    admin_calls = _capture(monkeypatch, "admin")
    handler(make_event("PUT", "/admin/about"), None)
    assert about_calls == [("PUT", "/admin/about")]
    assert admin_calls == []


def test_route_exception_becomes_500(monkeypatch):
    def boom(event, method, path):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(handler_mod.lessons, "handle", boom)
    resp = handler(make_event("GET", "/lessons"), None)
    assert resp["statusCode"] == 500
    assert body_of(resp) == {"error": "Internal server error"}
