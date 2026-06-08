import json
from unittest.mock import MagicMock, patch

import handler as main_handler


def _event(method="GET", path="/", body=None, token=None, http_api=False):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if http_api:
        return {
            "requestContext": {"http": {"method": method}},
            "rawPath": path,
            "headers": headers,
            "body": json.dumps(body) if body is not None else None,
        }
    return {
        "httpMethod": method,
        "path": path,
        "headers": headers,
        "body": json.dumps(body) if body is not None else None,
    }


class TestCors:
    def test_options_returns_200_with_cors_headers(self):
        r = main_handler.handler(_event("OPTIONS", "/auth/request-otp"), None)
        assert r["statusCode"] == 200
        assert "Access-Control-Allow-Origin" in r["headers"]

    def test_all_responses_include_cors_headers(self):
        with patch("routes.auth.table", return_value=MagicMock()), \
             patch("routes.auth.ses", return_value=MagicMock(send_email=MagicMock())):
            r = main_handler.handler(
                _event("POST", "/auth/request-otp", {"email": "test@example.com"}), None
            )
        assert "Access-Control-Allow-Origin" in r["headers"]


class TestRouting:
    def test_auth_route(self):
        with patch("routes.auth.handle", return_value={"statusCode": 200, "body": "{}"}) as mock:
            main_handler.handler(_event("POST", "/auth/request-otp", {}), None)
            mock.assert_called_once()

    def test_admin_route(self):
        with patch("routes.admin.handle", return_value={"statusCode": 200, "body": "{}"}) as mock:
            main_handler.handler(_event("GET", "/admin/lessons"), None)
            mock.assert_called_once()

    def test_lessons_route(self):
        with patch("routes.lessons.handle", return_value={"statusCode": 200, "body": "{}"}) as mock:
            main_handler.handler(_event("GET", "/lessons"), None)
            mock.assert_called_once()

    def test_progress_route(self):
        with patch("routes.progress.handle", return_value={"statusCode": 200, "body": "{}"}) as mock:
            main_handler.handler(_event("GET", "/progress/lid-1"), None)
            mock.assert_called_once()

    def test_audio_route(self):
        with patch("routes.audio.handle", return_value={"statusCode": 200, "body": "{}"}) as mock:
            main_handler.handler(_event("POST", "/audio/upload-url"), None)
            mock.assert_called_once()

    def test_unknown_path_returns_404(self):
        r = main_handler.handler(_event("GET", "/unknown"), None)
        assert r["statusCode"] == 404

    def test_api_prefix_stripped(self):
        with patch("routes.lessons.handle", return_value={"statusCode": 200, "body": "{}"}) as mock:
            main_handler.handler(_event("GET", "/api/lessons"), None)
            # path passed to handler should be /lessons
            call_path = mock.call_args[0][2]
            assert call_path == "/lessons"

    def test_http_api_event_format(self):
        with patch("routes.lessons.handle", return_value={"statusCode": 200, "body": "{}"}) as mock:
            main_handler.handler(_event("GET", "/lessons", http_api=True), None)
            mock.assert_called_once()

    def test_unhandled_exception_returns_500(self):
        with patch("routes.lessons.handle", side_effect=RuntimeError("boom")):
            r = main_handler.handler(_event("GET", "/lessons"), None)
        assert r["statusCode"] == 500
