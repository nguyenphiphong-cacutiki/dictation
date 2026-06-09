import json
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import make_event


@pytest.fixture(autouse=True)
def reset_ses():
    import routes.auth as auth_mod
    auth_mod._ses = None
    yield
    auth_mod._ses = None


def _mock_table(items_by_key=None, put_result=None, delete_result=None):
    tbl = MagicMock()
    tbl.put_item.return_value = {}
    tbl.delete_item.return_value = {}
    if items_by_key is not None:
        tbl.get_item.side_effect = lambda Key: {"Item": items_by_key.get(tuple(Key.values()))}
    return tbl


class TestRequestOtp:
    def test_missing_email(self):
        from routes.auth import handle
        r = handle(make_event("POST", "/auth/request-otp", {}), "POST", "/auth/request-otp")
        assert r["statusCode"] == 400

    def test_invalid_email_no_at(self):
        from routes.auth import handle
        r = handle(make_event("POST", "/auth/request-otp", {"email": "notanemail"}), "POST", "/auth/request-otp")
        assert r["statusCode"] == 400

    def test_success(self):
        from routes.auth import handle
        mock_tbl = MagicMock()
        mock_ses = MagicMock()
        mock_ses.send_email.return_value = {}

        with patch("routes.auth.table", return_value=mock_tbl), \
             patch("routes.auth.ses", return_value=mock_ses):
            r = handle(make_event("POST", "/auth/request-otp", {"email": "user@example.com"}),
                       "POST", "/auth/request-otp")

        assert r["statusCode"] == 200
        assert json.loads(r["body"])["message"] == "OTP sent"
        mock_tbl.put_item.assert_called_once()
        mock_ses.send_email.assert_called_once()

    def test_email_normalised_to_lowercase(self):
        from routes.auth import handle
        mock_tbl = MagicMock()
        mock_ses = MagicMock()

        with patch("routes.auth.table", return_value=mock_tbl), \
             patch("routes.auth.ses", return_value=mock_ses):
            handle(make_event("POST", "/auth/request-otp", {"email": "User@Example.COM"}),
                   "POST", "/auth/request-otp")

        call_args = mock_tbl.put_item.call_args[1]["Item"]
        assert call_args["email"] == "user@example.com"


class TestVerifyOtp:
    def test_missing_fields(self):
        from routes.auth import handle
        r = handle(make_event("POST", "/auth/verify-otp", {}), "POST", "/auth/verify-otp")
        assert r["statusCode"] == 400

    def test_otp_not_found(self):
        from routes.auth import handle
        mock_tbl = MagicMock()
        mock_tbl.get_item.return_value = {}

        with patch("routes.auth.table", return_value=mock_tbl):
            r = handle(make_event("POST", "/auth/verify-otp",
                                  {"email": "user@example.com", "code": "123456"}),
                       "POST", "/auth/verify-otp")

        assert r["statusCode"] == 401

    def test_otp_expired(self):
        from routes.auth import handle
        expired_ts = int((datetime.now(timezone.utc) - timedelta(minutes=5)).timestamp())
        mock_tbl = MagicMock()
        mock_tbl.get_item.return_value = {"Item": {"email": "u@u.com", "code": "111111", "expires_at": expired_ts}}

        with patch("routes.auth.table", return_value=mock_tbl):
            r = handle(make_event("POST", "/auth/verify-otp",
                                  {"email": "u@u.com", "code": "111111"}),
                       "POST", "/auth/verify-otp")

        assert r["statusCode"] == 401

    def test_wrong_code(self):
        from routes.auth import handle
        future_ts = int((datetime.now(timezone.utc) + timedelta(minutes=9)).timestamp())
        mock_tbl = MagicMock()
        mock_tbl.get_item.return_value = {"Item": {"email": "u@u.com", "code": "999999", "expires_at": future_ts}}

        with patch("routes.auth.table", return_value=mock_tbl):
            r = handle(make_event("POST", "/auth/verify-otp",
                                  {"email": "u@u.com", "code": "000000"}),
                       "POST", "/auth/verify-otp")

        assert r["statusCode"] == 401

    def test_success_existing_user(self):
        from routes.auth import handle
        future_ts = int((datetime.now(timezone.utc) + timedelta(minutes=9)).timestamp())
        otp_item = {"email": "u@u.com", "code": "123456", "expires_at": future_ts}
        existing_user = {"email": "u@u.com", "user_id": "uid-existing", "is_admin": False}

        otp_tbl = MagicMock()
        users_tbl = MagicMock()
        otp_tbl.get_item.return_value = {"Item": otp_item}
        users_tbl.get_item.return_value = {"Item": existing_user}

        call_count = [0]
        def table_factory(name):
            call_count[0] += 1
            return otp_tbl if "otp" in name else users_tbl

        with patch("routes.auth.table", side_effect=table_factory):
            r = handle(make_event("POST", "/auth/verify-otp",
                                  {"email": "u@u.com", "code": "123456"}),
                       "POST", "/auth/verify-otp")

        assert r["statusCode"] == 200
        body = json.loads(r["body"])
        assert "token" in body
        assert body["user"]["user_id"] == "uid-existing"

    def test_success_new_user_created(self):
        from routes.auth import handle
        future_ts = int((datetime.now(timezone.utc) + timedelta(minutes=9)).timestamp())
        otp_item = {"email": "new@u.com", "code": "654321", "expires_at": future_ts}

        otp_tbl = MagicMock()
        users_tbl = MagicMock()
        sessions_tbl = MagicMock()
        otp_tbl.get_item.return_value = {"Item": otp_item}
        users_tbl.get_item.return_value = {}  # no existing user

        def table_factory(name):
            if "otp" in name:
                return otp_tbl
            if "session" in name:
                return sessions_tbl
            return users_tbl

        with patch("routes.auth.table", side_effect=table_factory):
            r = handle(make_event("POST", "/auth/verify-otp",
                                  {"email": "new@u.com", "code": "654321"}),
                       "POST", "/auth/verify-otp")

        assert r["statusCode"] == 200
        users_tbl.put_item.assert_called_once()
        sessions_tbl.put_item.assert_called_once()
        body = json.loads(r["body"])
        assert "session_id" in body

    def test_admin_email_gets_admin_flag(self):
        from routes.auth import handle
        import routes.auth as auth_mod
        original = auth_mod.ADMIN_EMAILS
        auth_mod.ADMIN_EMAILS = {"admin@example.com"}

        future_ts = int((datetime.now(timezone.utc) + timedelta(minutes=9)).timestamp())
        otp_item = {"email": "admin@example.com", "code": "000000", "expires_at": future_ts}

        otp_tbl = MagicMock()
        users_tbl = MagicMock()
        otp_tbl.get_item.return_value = {"Item": otp_item}
        users_tbl.get_item.return_value = {}

        def table_factory(name):
            return otp_tbl if "otp" in name else users_tbl

        with patch("routes.auth.table", side_effect=table_factory):
            r = handle(make_event("POST", "/auth/verify-otp",
                                  {"email": "admin@example.com", "code": "000000"}),
                       "POST", "/auth/verify-otp")

        auth_mod.ADMIN_EMAILS = original
        body = json.loads(r["body"])
        assert body["user"]["is_admin"] is True


class TestHandleRouting:
    def test_unknown_path_returns_404(self):
        from routes.auth import handle
        r = handle(make_event("GET", "/auth/unknown"), "GET", "/auth/unknown")
        assert r["statusCode"] == 404
