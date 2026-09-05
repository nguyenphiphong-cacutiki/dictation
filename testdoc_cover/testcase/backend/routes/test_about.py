"""Covers backend/routes/about.py — public read, admin-only write."""
from routes import about as routes_about

from ..conftest import body_of, make_event


def test_get_about_empty_when_unset():
    resp = routes_about.handle(make_event("GET", "/about"), "GET", "/about")
    assert resp["statusCode"] == 200
    assert body_of(resp) == {"content": ""}


def test_get_about_returns_saved_content(aws):
    aws.config.put_item(Item={"config_key": "about", "content": "<h1>Hi</h1>"})
    resp = routes_about.handle(make_event("GET", "/about"), "GET", "/about")
    assert body_of(resp) == {"content": "<h1>Hi</h1>"}


def test_put_about_requires_auth():
    event = make_event("PUT", "/admin/about", {"content": "x"})
    resp = routes_about.handle(event, "PUT", "/admin/about")
    assert resp["statusCode"] == 401


def test_put_about_rejects_non_admin(user_token):
    event = make_event("PUT", "/admin/about", {"content": "x"}, token=user_token)
    resp = routes_about.handle(event, "PUT", "/admin/about")
    assert resp["statusCode"] == 403


def test_put_about_saves_content_for_admin(aws, admin_token):
    event = make_event("PUT", "/admin/about", {"content": "<p>New</p>"}, token=admin_token)
    resp = routes_about.handle(event, "PUT", "/admin/about")
    assert body_of(resp) == {"saved": True}
    assert aws.config.get_item(Key={"config_key": "about"})["Item"]["content"] == "<p>New</p>"


def test_put_about_missing_content_saves_empty(aws, admin_token):
    event = make_event("PUT", "/admin/about", {}, token=admin_token)
    routes_about.handle(event, "PUT", "/admin/about")
    assert aws.config.get_item(Key={"config_key": "about"})["Item"]["content"] == ""


def test_unknown_about_path_404():
    resp = routes_about.handle(make_event("POST", "/about"), "POST", "/about")
    assert resp["statusCode"] == 404
