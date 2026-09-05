import os

import pytest

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("USERS_TABLE", "dictation-users")
os.environ.setdefault("OTP_TABLE", "dictation-otp")
os.environ.setdefault("LESSONS_TABLE", "dictation-lessons")
os.environ.setdefault("PROGRESS_TABLE", "dictation-progress")
os.environ.setdefault("AUDIO_BUCKET", "test-bucket")
os.environ.setdefault("FROM_EMAIL", "noreply@example.com")
os.environ.setdefault("ADMIN_EMAILS", "admin@example.com")


def make_event(method="GET", path="/", body=None, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return {
        "httpMethod": method,
        "path": path,
        "headers": headers,
        "body": __import__("json").dumps(body) if body is not None else None,
    }


@pytest.fixture
def event_factory():
    return make_event
