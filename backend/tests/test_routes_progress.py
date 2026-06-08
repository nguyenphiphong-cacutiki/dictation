import json
from unittest.mock import MagicMock, patch

from shared.auth import create_token
from tests.conftest import make_event


def _token(user_id="uid-1"):
    return create_token(user_id, "user@example.com", False)


class TestGetProgress:
    def test_unauthorized(self):
        from routes.progress import handle
        r = handle(make_event("GET", "/progress/lid-1"), "GET", "/progress/lid-1")
        assert r["statusCode"] == 401

    def test_missing_lesson_id(self):
        from routes.progress import handle
        token = _token()
        r = handle(make_event("GET", "/progress", token=token), "GET", "/progress")
        assert r["statusCode"] == 400

    def test_no_existing_progress_returns_zeros(self):
        from routes.progress import handle
        token = _token()
        tbl = MagicMock()
        tbl.get_item.return_value = {}

        with patch("routes.progress.table", return_value=tbl):
            r = handle(make_event("GET", "/progress/lid-1", token=token), "GET", "/progress/lid-1")

        assert r["statusCode"] == 200
        body = json.loads(r["body"])
        assert body["current_sentence"] == 0
        assert body["practice_count"] == 0

    def test_returns_existing_progress(self):
        from routes.progress import handle
        token = _token()
        tbl = MagicMock()
        tbl.get_item.return_value = {"Item": {"user_id": "uid-1", "lesson_id": "lid-1",
                                              "current_sentence": 3, "practice_count": 2}}

        with patch("routes.progress.table", return_value=tbl):
            r = handle(make_event("GET", "/progress/lid-1", token=token), "GET", "/progress/lid-1")

        body = json.loads(r["body"])
        assert body["current_sentence"] == 3
        assert body["practice_count"] == 2


class TestUpdateProgress:
    def test_missing_current_sentence(self):
        from routes.progress import handle
        token = _token()
        tbl = MagicMock()

        with patch("routes.progress.table", return_value=tbl):
            r = handle(make_event("PUT", "/progress/lid-1", {}, token=token),
                       "PUT", "/progress/lid-1")

        assert r["statusCode"] == 400

    def test_update_sets_sentence(self):
        from routes.progress import handle
        token = _token()
        tbl = MagicMock()
        tbl.get_item.return_value = {}

        with patch("routes.progress.table", return_value=tbl):
            r = handle(make_event("PUT", "/progress/lid-1",
                                  {"current_sentence": 5}, token=token),
                       "PUT", "/progress/lid-1")

        assert r["statusCode"] == 200
        body = json.loads(r["body"])
        assert body["current_sentence"] == 5
        assert body["practice_count"] == 0

    def test_increment_practice_count(self):
        from routes.progress import handle
        token = _token()
        tbl = MagicMock()
        tbl.get_item.return_value = {"Item": {"practice_count": 2, "current_sentence": 3}}

        with patch("routes.progress.table", return_value=tbl):
            r = handle(make_event("PUT", "/progress/lid-1",
                                  {"current_sentence": 0, "increment_practice": True},
                                  token=token),
                       "PUT", "/progress/lid-1")

        body = json.loads(r["body"])
        assert body["practice_count"] == 3

    def test_no_increment_practice_keeps_count(self):
        from routes.progress import handle
        token = _token()
        tbl = MagicMock()
        tbl.get_item.return_value = {"Item": {"practice_count": 5, "current_sentence": 0}}

        with patch("routes.progress.table", return_value=tbl):
            r = handle(make_event("PUT", "/progress/lid-1",
                                  {"current_sentence": 2},
                                  token=token),
                       "PUT", "/progress/lid-1")

        body = json.loads(r["body"])
        assert body["practice_count"] == 5

    def test_unknown_method_returns_404(self):
        from routes.progress import handle
        token = _token()
        r = handle(make_event("DELETE", "/progress/lid-1", token=token), "DELETE", "/progress/lid-1")
        assert r["statusCode"] == 404
