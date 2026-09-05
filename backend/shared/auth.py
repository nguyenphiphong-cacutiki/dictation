import os
from datetime import datetime, timedelta, timezone

import jwt

from shared.secrets import get_secret

_PARAM = os.environ.get("JWT_SECRET_PARAM", "")
_ALGO = "HS256"
_DAYS = 30


def _secret():
    # In Lambda the secret is fetched from SSM at runtime (cached). Falls back to
    # a direct JWT_SECRET env var for local dev and tests.
    if _PARAM:
        return get_secret(_PARAM)
    return os.environ.get("JWT_SECRET", "change-me")


def create_token(user_id: str, email: str, is_admin: bool) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "is_admin": is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(days=_DAYS),
    }
    return jwt.encode(payload, _secret(), algorithm=_ALGO)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _secret(), algorithms=[_ALGO])


def get_user(event) -> dict | None:
    headers = event.get("headers") or {}
    auth = headers.get("Authorization") or headers.get("authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    try:
        return decode_token(auth[7:])
    except jwt.PyJWTError:
        return None


def require_user(event):
    user = get_user(event)
    if not user:
        return None, {"statusCode": 401, "body": '{"error":"Unauthorized"}'}
    return user, None


def require_admin(event):
    user, err = require_user(event)
    if err:
        return None, err
    if not user.get("is_admin"):
        return None, {"statusCode": 403, "body": '{"error":"Forbidden"}'}
    return user, None
