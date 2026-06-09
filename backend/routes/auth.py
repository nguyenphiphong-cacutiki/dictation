import json
import os
import random
import string
import uuid
from datetime import datetime, timedelta, timezone

import boto3

from shared.auth import create_token
from shared.db import table, USERS_TABLE, OTP_TABLE, SESSIONS_TABLE
from shared.response import ok, fail

_ses = None
FROM_EMAIL = os.environ.get("FROM_EMAIL", "")
ADMIN_EMAILS = set(e.strip() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip())


def ses():
    global _ses
    if _ses is None:
        _ses = boto3.client("ses", region_name=os.environ.get("SES_REGION", "ap-southeast-1"))
    return _ses


def _otp():
    return "".join(random.choices(string.digits, k=6))


def handle(event, method, path):
    body = json.loads(event.get("body") or "{}")

    if method == "POST" and path == "/auth/request-otp":
        return _request_otp(body)
    if method == "POST" and path == "/auth/verify-otp":
        return _verify_otp(body)
    return fail("Not found", 404)


def _request_otp(body):
    email = (body.get("email") or "").strip().lower()
    if not email or "@" not in email:
        return fail("Invalid email")

    code = _otp()
    now = datetime.now(timezone.utc)
    expires_at = int((now + timedelta(minutes=10)).timestamp())

    table(OTP_TABLE).put_item(Item={
        "email": email,
        "code": code,
        "expires_at": expires_at,
        "ttl": expires_at,
    })

    ses().send_email(
        Source=FROM_EMAIL,
        Destination={"ToAddresses": [email]},
        Message={
            "Subject": {"Data": "Daily Dictation — OTP Code"},
            "Body": {
                "Text": {"Data": f"Your OTP: {code}\n\nExpires in 10 minutes."},
                "Html": {"Data": f"""
<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px">
  <h2 style="color:#1e293b">Daily Dictation</h2>
  <p style="color:#475569">Your one-time login code:</p>
  <div style="font-size:36px;font-weight:700;letter-spacing:12px;color:#4f46e5;
              background:#eef2ff;padding:20px;text-align:center;border-radius:12px">
    {code}
  </div>
  <p style="color:#94a3b8;font-size:13px;margin-top:16px">Expires in 10 minutes.</p>
</div>
"""},
            },
        },
    )
    return ok({"message": "OTP sent"})


def _verify_otp(body):
    email = (body.get("email") or "").strip().lower()
    code = (body.get("code") or "").strip()
    if not email or not code:
        return fail("Email and code are required")

    otp_table = table(OTP_TABLE)
    res = otp_table.get_item(Key={"email": email})
    item = res.get("Item")

    now_ts = int(datetime.now(timezone.utc).timestamp())
    if not item or item.get("expires_at", 0) < now_ts:
        return fail("Invalid or expired OTP", 401)
    if item["code"] != code:
        return fail("Invalid OTP", 401)

    otp_table.delete_item(Key={"email": email})

    users = table(USERS_TABLE)
    res = users.get_item(Key={"email": email})
    user = res.get("Item")

    if not user:
        user_id = str(uuid.uuid4())
        user = {
            "email": email,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_admin": email in ADMIN_EMAILS,
        }
        users.put_item(Item=user)

    is_admin = bool(user.get("is_admin")) or email in ADMIN_EMAILS
    token = create_token(user["user_id"], email, is_admin)

    session_id = str(uuid.uuid4())
    table(SESSIONS_TABLE).put_item(Item={
        "session_id": session_id,
        "user_id": user["user_id"],
        "email": email,
        "login_at": datetime.now(timezone.utc).isoformat(),
    })

    return ok({
        "token": token,
        "session_id": session_id,
        "user": {"user_id": user["user_id"], "email": email, "is_admin": is_admin},
    })
