import json
from unittest.mock import MagicMock, patch

from shared.auth import create_token

from tests.conftest import make_event


def _token(is_admin=True):
    return create_token("uid-admin", "admin@example.com", is_admin)


def _lesson(lesson_id="lid-1", status="published"):
    return {
        "lesson_id": lesson_id,
        "title": "Test",
        "owner_id": "uid-owner",
        "owner_email": "owner@example.com",
        "sentences": ["a", "b"],
        "sentence_count": 2,
        "status": status,
        "admin_feedback": "",
        "created_at": "2024-01-01T00:00:00+00:00",
        "updated_at": "2024-01-01T00:00:00+00:00",
    }


class TestAdminAccess:
    def test_non_admin_forbidden(self):
        from routes.admin import handle
        token = _token(is_admin=False)
        r = handle(make_event("GET", "/admin/lessons", token=token), "GET", "/admin/lessons")
        assert r["statusCode"] == 403

    def test_unauthenticated_returns_401(self):
        from routes.admin import handle
        r = handle(make_event("GET", "/admin/lessons"), "GET", "/admin/lessons")
        assert r["statusCode"] == 401


class TestListAll:
    def test_lists_all_lessons_without_sentences(self):
        from routes.admin import handle
        token = _token()
        tbl = MagicMock()
        tbl.scan.return_value = {"Items": [_lesson("lid-1"), _lesson("lid-2")]}

        with patch("routes.admin.table", return_value=tbl):
            r = handle(make_event("GET", "/admin/lessons", token=token), "GET", "/admin/lessons")

        assert r["statusCode"] == 200
        body = json.loads(r["body"])
        assert len(body["lessons"]) == 2
        for lesson in body["lessons"]:
            assert "sentences" not in lesson

    def test_paginated_scan(self):
        from routes.admin import handle
        token = _token()
        tbl = MagicMock()
        tbl.scan.side_effect = [
            {"Items": [_lesson("lid-1")], "LastEvaluatedKey": {"lesson_id": "lid-1"}},
            {"Items": [_lesson("lid-2")]},
        ]

        with patch("routes.admin.table", return_value=tbl):
            r = handle(make_event("GET", "/admin/lessons", token=token), "GET", "/admin/lessons")

        body = json.loads(r["body"])
        assert len(body["lessons"]) == 2


class TestPullLesson:
    def test_missing_feedback(self):
        from routes.admin import handle
        token = _token()
        r = handle(make_event("PUT", "/admin/lessons/lid-1/pull", {}, token=token),
                   "PUT", "/admin/lessons/lid-1/pull")
        assert r["statusCode"] == 400

    def test_lesson_not_found(self):
        from routes.admin import handle
        token = _token()
        tbl = MagicMock()
        tbl.get_item.return_value = {}

        with patch("routes.admin.table", return_value=tbl):
            r = handle(make_event("PUT", "/admin/lessons/lid-1/pull",
                                  {"feedback": "Bad content"}, token=token),
                       "PUT", "/admin/lessons/lid-1/pull")

        assert r["statusCode"] == 404

    def test_success(self):
        from routes.admin import handle
        token = _token()
        tbl = MagicMock()
        tbl.get_item.return_value = {"Item": _lesson()}

        with patch("routes.admin.table", return_value=tbl):
            r = handle(make_event("PUT", "/admin/lessons/lid-1/pull",
                                  {"feedback": "Please fix this"}, token=token),
                       "PUT", "/admin/lessons/lid-1/pull")

        assert r["statusCode"] == 200
        assert json.loads(r["body"])["pulled"] is True
        tbl.update_item.assert_called_once()
        call = tbl.update_item.call_args[1]
        assert call["ExpressionAttributeValues"][":s"] == "pulled"
        assert call["ExpressionAttributeValues"][":f"] == "Please fix this"


class TestRestoreLesson:
    def test_lesson_not_found(self):
        from routes.admin import handle
        token = _token()
        tbl = MagicMock()
        tbl.get_item.return_value = {}

        with patch("routes.admin.table", return_value=tbl):
            r = handle(make_event("PUT", "/admin/lessons/lid-1/restore", token=token),
                       "PUT", "/admin/lessons/lid-1/restore")

        assert r["statusCode"] == 404

    def test_success(self):
        from routes.admin import handle
        token = _token()
        tbl = MagicMock()
        tbl.get_item.return_value = {"Item": _lesson(status="pulled")}

        with patch("routes.admin.table", return_value=tbl):
            r = handle(make_event("PUT", "/admin/lessons/lid-1/restore", token=token),
                       "PUT", "/admin/lessons/lid-1/restore")

        assert r["statusCode"] == 200
        assert json.loads(r["body"])["restored"] is True
        call = tbl.update_item.call_args[1]
        assert call["ExpressionAttributeValues"][":s"] == "published"
        assert call["ExpressionAttributeValues"][":f"] == ""


class TestUnknownPath:
    def test_returns_404(self):
        from routes.admin import handle
        token = _token()
        r = handle(make_event("GET", "/admin/unknown", token=token), "GET", "/admin/unknown")
        assert r["statusCode"] == 404
