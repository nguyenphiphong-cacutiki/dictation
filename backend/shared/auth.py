import os
from datetime import datetime, timedelta, timezone

import jwt

_SECRET = os.environ.get("JWT_SECRET", "change-me")
_ALGO = "HS256"
_DAYS = 30


def create_token(user_id: str, email: str, is_admin: bool) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "is_admin": is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(days=_DAYS),
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGO)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _SECRET, algorithms=[_ALGO])


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
