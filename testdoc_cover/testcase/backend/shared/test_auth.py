"""Covers backend/shared/auth.py — token lifecycle and auth guards."""
from datetime import datetime, timedelta, timezone

import jwt
from shared import auth as shared_auth
from shared.auth import (
    create_token,
    decode_token,
    get_user,
    require_admin,
    require_user,
)

from ..conftest import make_event


def test_create_and_decode_roundtrip():
    token = create_token("u1", "a@b.com", True)
    payload = decode_token(token)
    assert payload["user_id"] == "u1"
    assert payload["email"] == "a@b.com"
    assert payload["is_admin"] is True
    assert "exp" in payload


def test_secret_falls_back_to_env_without_param(monkeypatch):
    monkeypatch.setattr(shared_auth, "_PARAM", "")
    monkeypatch.setenv("JWT_SECRET", "env-secret")
    assert shared_auth._secret() == "env-secret"


def test_secret_uses_ssm_when_param_configured(monkeypatch, aws):
    monkeypatch.setattr(shared_auth, "_PARAM", "/app/jwt")
    aws.ssm.params["/app/jwt"] = "ssm-secret"
    assert shared_auth._secret() == "ssm-secret"


def test_get_user_returns_payload_for_valid_bearer():
    token = create_token("u1", "a@b.com", False)
    user = get_user(make_event(token=token))
    assert user["user_id"] == "u1"


def test_get_user_accepts_lowercase_authorization_header():
    token = create_token("u1", "a@b.com", False)
    event = {"headers": {"authorization": f"Bearer {token}"}}
    assert get_user(event)["user_id"] == "u1"


def test_get_user_none_when_no_header():
    assert get_user({"headers": {}}) is None
    assert get_user({"headers": None}) is None
    assert get_user({}) is None


def test_get_user_none_for_non_bearer_scheme():
    assert get_user({"headers": {"Authorization": "Basic abc"}}) is None


def test_get_user_none_for_garbage_token():
    assert get_user({"headers": {"Authorization": "Bearer not-a-jwt"}}) is None


def test_get_user_none_for_expired_token():
    expired = jwt.encode(
        {"user_id": "u1", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        shared_auth._secret(),
        algorithm="HS256",
    )
    assert get_user({"headers": {"Authorization": f"Bearer {expired}"}}) is None


def test_get_user_none_for_wrong_signature():
    forged = jwt.encode({"user_id": "u1"}, "other-secret", algorithm="HS256")
    assert get_user({"headers": {"Authorization": f"Bearer {forged}"}}) is None


def test_require_user_returns_401_without_auth():
    user, err = require_user(make_event())
    assert user is None
    assert err["statusCode"] == 401


def test_require_user_passes_with_valid_token():
    token = create_token("u1", "a@b.com", False)
    user, err = require_user(make_event(token=token))
    assert err is None
    assert user["user_id"] == "u1"


def test_require_admin_401_without_auth():
    user, err = require_admin(make_event())
    assert user is None
    assert err["statusCode"] == 401


def test_require_admin_403_for_regular_user():
    token = create_token("u1", "a@b.com", False)
    user, err = require_admin(make_event(token=token))
    assert user is None
    assert err["statusCode"] == 403


def test_require_admin_passes_for_admin():
    token = create_token("adm", "admin@example.com", True)
    user, err = require_admin(make_event(token=token))
    assert err is None
    assert user["is_admin"] is True
