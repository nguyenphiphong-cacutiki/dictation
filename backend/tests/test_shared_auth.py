import pytest
import jwt as pyjwt

from shared.auth import create_token, decode_token, get_user, require_user, require_admin


def _make_event(token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return {"headers": headers}


class TestCreateDecodeToken:
    def test_round_trip(self):
        token = create_token("uid-1", "user@example.com", False)
        payload = decode_token(token)
        assert payload["user_id"] == "uid-1"
        assert payload["email"] == "user@example.com"
        assert payload["is_admin"] is False

    def test_admin_flag(self):
        token = create_token("uid-2", "admin@example.com", True)
        payload = decode_token(token)
        assert payload["is_admin"] is True

    def test_decode_invalid_token(self):
        with pytest.raises(pyjwt.PyJWTError):
            decode_token("not.a.token")

    def test_decode_wrong_secret(self, monkeypatch):
        token = create_token("uid-3", "x@x.com", False)
        monkeypatch.setenv("JWT_SECRET", "wrong-secret")
        import importlib
        import shared.auth as auth_mod
        importlib.reload(auth_mod)
        with pytest.raises(pyjwt.PyJWTError):
            auth_mod.decode_token(token)
        # restore
        monkeypatch.setenv("JWT_SECRET", "test-secret")
        importlib.reload(auth_mod)


class TestGetUser:
    def test_no_header_returns_none(self):
        assert get_user({"headers": {}}) is None

    def test_no_bearer_prefix_returns_none(self):
        assert get_user({"headers": {"Authorization": "Token abc"}}) is None

    def test_valid_token_returns_payload(self):
        token = create_token("uid-4", "u@u.com", False)
        user = get_user(_make_event(token))
        assert user["user_id"] == "uid-4"

    def test_invalid_token_returns_none(self):
        assert get_user(_make_event("invalid.jwt.here")) is None

    def test_lowercase_authorization_header(self):
        token = create_token("uid-5", "u@u.com", False)
        event = {"headers": {"authorization": f"Bearer {token}"}}
        user = get_user(event)
        assert user["user_id"] == "uid-5"


class TestRequireUser:
    def test_valid_returns_user(self):
        token = create_token("uid-6", "u@u.com", False)
        user, err = require_user(_make_event(token))
        assert user is not None
        assert err is None

    def test_no_token_returns_401(self):
        user, err = require_user({"headers": {}})
        assert user is None
        assert err["statusCode"] == 401


class TestRequireAdmin:
    def test_admin_user_passes(self):
        token = create_token("uid-7", "admin@example.com", True)
        user, err = require_admin(_make_event(token))
        assert user is not None
        assert err is None

    def test_non_admin_returns_403(self):
        token = create_token("uid-8", "user@example.com", False)
        user, err = require_admin(_make_event(token))
        assert user is None
        assert err["statusCode"] == 403

    def test_no_token_returns_401(self):
        user, err = require_admin({"headers": {}})
        assert user is None
        assert err["statusCode"] == 401
