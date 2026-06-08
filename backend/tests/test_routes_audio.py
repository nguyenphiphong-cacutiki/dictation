import json
from unittest.mock import MagicMock, patch

import pytest

from shared.auth import create_token
from tests.conftest import make_event


def _token():
    return create_token("uid-1", "user@example.com", False)


@pytest.fixture(autouse=True)
def reset_s3():
    import routes.audio as audio_mod
    audio_mod._s3 = None
    yield
    audio_mod._s3 = None


class TestUploadUrl:
    def test_unauthorized(self):
        from routes.audio import handle
        r = handle(make_event("POST", "/audio/upload-url", {"content_type": "audio/mpeg"}),
                   "POST", "/audio/upload-url")
        assert r["statusCode"] == 401

    def test_unsupported_content_type(self):
        from routes.audio import handle
        token = _token()
        r = handle(make_event("POST", "/audio/upload-url", {"content_type": "video/mp4"}, token=token),
                   "POST", "/audio/upload-url")
        assert r["statusCode"] == 400

    def test_missing_content_type(self):
        from routes.audio import handle
        token = _token()
        r = handle(make_event("POST", "/audio/upload-url", {}, token=token),
                   "POST", "/audio/upload-url")
        assert r["statusCode"] == 400

    def test_success_returns_upload_url_and_key(self):
        from routes.audio import handle
        token = _token()
        mock_s3 = MagicMock()
        mock_s3.generate_presigned_url.return_value = "https://s3.example.com/presigned"

        with patch("routes.audio.s3", return_value=mock_s3):
            r = handle(make_event("POST", "/audio/upload-url",
                                  {"content_type": "audio/mpeg"}, token=token),
                       "POST", "/audio/upload-url")

        assert r["statusCode"] == 200
        body = json.loads(r["body"])
        assert body["upload_url"] == "https://s3.example.com/presigned"
        assert body["audio_key"].startswith("audio/uid-1/")
        assert body["audio_key"].endswith(".mp3")

    @pytest.mark.parametrize("content_type,ext", [
        ("audio/mpeg", "mp3"),
        ("audio/mp3", "mp3"),
        ("audio/wav", "wav"),
        ("audio/ogg", "ogg"),
        ("audio/aac", "aac"),
        ("audio/mp4", "m4a"),
    ])
    def test_all_allowed_types(self, content_type, ext):
        from routes.audio import handle
        token = _token()
        mock_s3 = MagicMock()
        mock_s3.generate_presigned_url.return_value = "https://url"

        with patch("routes.audio.s3", return_value=mock_s3):
            r = handle(make_event("POST", "/audio/upload-url",
                                  {"content_type": content_type}, token=token),
                       "POST", "/audio/upload-url")

        assert r["statusCode"] == 200
        assert json.loads(r["body"])["audio_key"].endswith(f".{ext}")


class TestUnknownPath:
    def test_returns_404(self):
        from routes.audio import handle
        token = _token()
        r = handle(make_event("GET", "/audio/something", token=token), "GET", "/audio/something")
        assert r["statusCode"] == 404
