"""Covers backend/routes/auth.py — OTP request and verification flows."""
from datetime import datetime, timedelta, timezone

import pytest
from botocore.exceptions import ClientError
from routes import auth as routes_auth
from shared.auth import decode_token

from ..conftest import body_of, make_event


def _request_otp(email):
    return routes_auth.handle(
        make_event("POST", "/auth/request-otp", {"email": email}),
        "POST", "/auth/request-otp",
    )


def _verify(email, code):
    return routes_auth.handle(
        make_event("POST", "/auth/verify-otp", {"email": email, "code": code}),
        "POST", "/auth/verify-otp",
    )


def _seed_otp(aws, email, code="123456", expired=False):
    delta = timedelta(minutes=-1 if expired else 10)
    aws.otp.put_item(Item={
        "email": email,
        "code": code,
        "expires_at": int((datetime.now(timezone.utc) + delta).timestamp()),
    })


def test_unknown_auth_path_404():
    resp = routes_auth.handle(make_event("GET", "/auth/other"), "GET", "/auth/other")
    assert resp["statusCode"] == 404


def test_request_otp_rejects_empty_email():
    assert _request_otp("")["statusCode"] == 400


def test_request_otp_rejects_email_without_at():
    assert _request_otp("not-an-email")["statusCode"] == 400


def test_request_otp_stores_code_and_sends_email(aws):
    resp = _request_otp("USER@Example.COM")
    assert resp["statusCode"] == 200

    stored = aws.otp.get_item(Key={"email": "user@example.com"})["Item"]
    assert len(stored["code"]) == 6
    assert stored["code"].isdigit()
    assert stored["expires_at"] > int(datetime.now(timezone.utc).timestamp())
    assert stored["ttl"] == stored["expires_at"]

    assert len(aws.ses.sent) == 1
    mail = aws.ses.sent[0]
    assert mail["Destination"]["ToAddresses"] == ["user@example.com"]
    assert stored["code"] in mail["Message"]["Body"]["Text"]["Data"]


def test_request_otp_unverified_recipient_422_and_otp_cleaned_up(aws):
    """SES sandbox rejects unverified recipients — user gets a clear 422, not a 500."""
    aws.ses.error_code = "MessageRejected"
    resp = _request_otp("blocked@example.com")
    assert resp["statusCode"] == 422
    assert "cannot receive" in body_of(resp)["error"]
    # the stored OTP must not linger for an email that never went out
    assert aws.otp.get_item(Key={"email": "blocked@example.com"}) == {}


def test_request_otp_other_ses_error_propagates(aws):
    aws.ses.error_code = "Throttling"
    with pytest.raises(ClientError):
        _request_otp("someone@example.com")
    assert aws.otp.get_item(Key={"email": "someone@example.com"}) == {}


def test_verify_otp_requires_email_and_code():
    assert _verify("", "123456")["statusCode"] == 400
    assert _verify("a@b.com", "")["statusCode"] == 400


def test_verify_otp_unknown_email_401():
    assert _verify("a@b.com", "123456")["statusCode"] == 401


def test_verify_otp_expired_401(aws):
    _seed_otp(aws, "a@b.com", expired=True)
    assert _verify("a@b.com", "123456")["statusCode"] == 401


def test_verify_otp_wrong_code_401(aws):
    _seed_otp(aws, "a@b.com", code="111111")
    assert _verify("a@b.com", "222222")["statusCode"] == 401


def test_verify_otp_creates_new_user_and_session(aws):
    _seed_otp(aws, "new@user.com")
    resp = _verify("new@user.com", "123456")
    assert resp["statusCode"] == 200
    data = body_of(resp)

    assert data["user"]["email"] == "new@user.com"
    assert data["user"]["is_admin"] is False
    payload = decode_token(data["token"])
    assert payload["email"] == "new@user.com"

    # user persisted
    user = aws.users.get_item(Key={"email": "new@user.com"})["Item"]
    assert user["user_id"] == data["user"]["user_id"]
    # OTP consumed
    assert aws.otp.get_item(Key={"email": "new@user.com"}) == {}
    # login session recorded
    session = aws.sessions.get_item(Key={"session_id": data["session_id"]})["Item"]
    assert session["email"] == "new@user.com"
    assert session["login_at"]


def test_verify_otp_admin_email_gets_admin_flag(aws):
    _seed_otp(aws, "admin@example.com")
    data = body_of(_verify("admin@example.com", "123456"))
    assert data["user"]["is_admin"] is True
    assert decode_token(data["token"])["is_admin"] is True


def test_verify_otp_existing_user_keeps_user_id(aws):
    aws.users.put_item(Item={"email": "old@user.com", "user_id": "keep-me", "is_admin": False})
    _seed_otp(aws, "old@user.com")
    data = body_of(_verify("old@user.com", "123456"))
    assert data["user"]["user_id"] == "keep-me"


def test_verify_otp_email_case_and_whitespace_normalized(aws):
    _seed_otp(aws, "a@b.com")
    assert _verify("  A@B.COM  ", "123456")["statusCode"] == 200


def test_otp_generator_shape():
    code = routes_auth._otp()
    assert len(code) == 6 and code.isdigit()
