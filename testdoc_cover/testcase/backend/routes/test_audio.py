"""Covers backend/routes/audio.py — presigned uploads and owner-scoped deletes."""
import pytest
from routes import audio as routes_audio

from ..conftest import body_of, make_event


def _call(method, path, body=None, token=None):
    return routes_audio.handle(make_event(method, path, body, token=token), method, path)


def test_audio_routes_require_auth():
    assert _call("POST", "/audio/upload-url", {})["statusCode"] == 401
    assert _call("DELETE", "/audio", {})["statusCode"] == 401


def test_unknown_audio_path_404(user_token):
    assert _call("GET", "/audio/other", token=user_token)["statusCode"] == 404


def test_upload_url_rejects_unsupported_type(user_token):
    resp = _call("POST", "/audio/upload-url", {"content_type": "video/mp4"}, token=user_token)
    assert resp["statusCode"] == 400
    assert "Unsupported audio type" in body_of(resp)["error"]


def test_upload_url_rejects_missing_type(user_token):
    assert _call("POST", "/audio/upload-url", {}, token=user_token)["statusCode"] == 400


@pytest.mark.parametrize("content_type,ext", [
    ("audio/mpeg", "mp3"),
    ("audio/mp3", "mp3"),
    ("audio/wav", "wav"),
    ("audio/ogg", "ogg"),
    ("audio/aac", "aac"),
    ("audio/mp4", "m4a"),
])
def test_upload_url_maps_content_type_to_extension(aws, user_token, content_type, ext):
    data = body_of(_call("POST", "/audio/upload-url", {"content_type": content_type}, token=user_token))
    assert data["audio_key"].startswith("audio/user-1/")
    assert data["audio_key"].endswith(f".{ext}")
    assert data["upload_url"].startswith("https://s3.fake/")
    presigned = aws.s3.presigned[-1]
    assert presigned["op"] == "put_object"
    assert presigned["params"]["ContentType"] == content_type


def test_upload_url_reuses_own_key_with_same_extension(aws, user_token):
    body = {"content_type": "audio/wav", "audio_key": "audio/user-1/existing.wav"}
    data = body_of(_call("POST", "/audio/upload-url", body, token=user_token))
    assert data["audio_key"] == "audio/user-1/existing.wav"


def test_upload_url_new_key_when_extension_changes(user_token):
    body = {"content_type": "audio/wav", "audio_key": "audio/user-1/existing.mp3"}
    data = body_of(_call("POST", "/audio/upload-url", body, token=user_token))
    assert data["audio_key"] != "audio/user-1/existing.mp3"
    assert data["audio_key"].endswith(".wav")


def test_upload_url_ignores_foreign_users_key(user_token):
    body = {"content_type": "audio/wav", "audio_key": "audio/other-user/theirs.wav"}
    data = body_of(_call("POST", "/audio/upload-url", body, token=user_token))
    assert data["audio_key"].startswith("audio/user-1/")
    assert data["audio_key"] != "audio/other-user/theirs.wav"


def test_delete_requires_audio_key(user_token):
    assert _call("DELETE", "/audio", {}, token=user_token)["statusCode"] == 400


def test_delete_forbids_foreign_key(aws, user_token):
    resp = _call("DELETE", "/audio", {"audio_key": "audio/other-user/x.wav"}, token=user_token)
    assert resp["statusCode"] == 403
    assert aws.s3.deleted == []


def test_delete_own_key_deletes_object(aws, user_token):
    resp = _call("DELETE", "/audio", {"audio_key": "audio/user-1/x.wav"}, token=user_token)
    assert resp["statusCode"] == 200
    assert aws.s3.deleted == [{"bucket": routes_audio.AUDIO_BUCKET, "key": "audio/user-1/x.wav"}]
