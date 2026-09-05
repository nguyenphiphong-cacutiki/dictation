"""Shared fixtures for the testdoc_cover backend suite.

Everything runs fully offline: DynamoDB, S3, SES and SSM are replaced with
in-memory fakes patched into the backend modules' cached client singletons.
"""
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

# Make the backend source importable exactly the way Lambda does
# (handler.py, routes/, shared/ as top-level modules).
BACKEND_DIR = str(Path(__file__).resolve().parents[3] / "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Environment must be in place BEFORE the backend modules are imported —
# several values (ADMIN_EMAILS, FROM_EMAIL, table names) are read at import time.
os.environ.setdefault("JWT_SECRET", "testdoc-secret")
os.environ.pop("JWT_SECRET_PARAM", None)
os.environ.pop("OPENAI_API_KEY_PARAM", None)
os.environ.pop("OPENAI_API_KEY", None)
os.environ.setdefault("FROM_EMAIL", "noreply@example.com")
os.environ.setdefault("ADMIN_EMAILS", "admin@example.com")
os.environ.setdefault("AUDIO_BUCKET", "test-audio-bucket")

from routes import audio as routes_audio  # noqa: E402
from routes import auth as routes_auth  # noqa: E402
from routes import lessons as routes_lessons  # noqa: E402
from shared import auth as shared_auth  # noqa: E402
from shared import db as shared_db  # noqa: E402
from shared import secrets as shared_secrets  # noqa: E402

# ── In-memory AWS fakes ───────────────────────────────────────────────────────

TABLE_KEYS = {
    shared_db.USERS_TABLE: ("email",),
    shared_db.OTP_TABLE: ("email",),
    shared_db.LESSONS_TABLE: ("lesson_id",),
    shared_db.PROGRESS_TABLE: ("user_id", "lesson_id"),
    shared_db.SESSIONS_TABLE: ("session_id",),
    shared_db.CONFIG_TABLE: ("config_key",),
}


class FakeTable:
    def __init__(self, name, key_attrs):
        self.name = name
        self.key_attrs = key_attrs
        self.items = {}
        self.fail_update = False  # set True to simulate a DynamoDB error

    def _key(self, item):
        return tuple(item[k] for k in self.key_attrs)

    def put_item(self, Item):
        self.items[self._key(Item)] = dict(Item)
        return {}

    def get_item(self, Key):
        item = self.items.get(self._key(Key))
        return {"Item": dict(item)} if item is not None else {}

    def delete_item(self, Key):
        self.items.pop(self._key(Key), None)
        return {}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues,
                    ExpressionAttributeNames=None, **_):
        if self.fail_update:
            raise RuntimeError("simulated DynamoDB failure")
        item = self.items.setdefault(self._key(Key), dict(Key))
        names = ExpressionAttributeNames or {}
        expr = UpdateExpression.strip()
        if expr.upper().startswith("SET "):
            for part in expr[4:].split(","):
                lhs, rhs = (p.strip() for p in part.split("="))
                item[names.get(lhs, lhs)] = ExpressionAttributeValues[rhs]
        elif expr.upper().startswith("ADD "):
            attr, val = expr[4:].split()
            attr = names.get(attr, attr)
            item[attr] = item.get(attr, 0) + ExpressionAttributeValues[val]
        else:
            raise ValueError(f"FakeTable can't parse: {UpdateExpression}")
        return {}

    def scan(self, **_):
        return {"Items": [dict(i) for i in self.items.values()]}

    def query(self, KeyConditionExpression=None, ScanIndexForward=True, **_):
        expr = KeyConditionExpression.get_expression()
        attr = expr["values"][0].name
        value = expr["values"][1]
        matches = [dict(i) for i in self.items.values() if i.get(attr) == value]
        return {"Items": matches}


class FakeDDB:
    def __init__(self, tables):
        self.tables = tables

    def Table(self, name):  # noqa: N802 — mirrors boto3's API
        return self.tables[name]

    def batch_get_item(self, RequestItems):
        responses = {}
        for tname, spec in RequestItems.items():
            tbl = self.tables[tname]
            found = []
            for key in spec["Keys"]:
                res = tbl.get_item(Key=key)
                if "Item" in res:
                    found.append(res["Item"])
            responses[tname] = found
        return {"Responses": responses}


class FakeSES:
    def __init__(self):
        self.sent = []
        self.error_code = None  # e.g. "MessageRejected" to simulate a send failure

    def send_email(self, **kwargs):
        if self.error_code:
            from botocore.exceptions import ClientError
            raise ClientError(
                {"Error": {"Code": self.error_code, "Message": "simulated SES failure"}},
                "SendEmail",
            )
        self.sent.append(kwargs)
        return {"MessageId": "fake-message-id"}


class FakeS3:
    def __init__(self):
        self.presigned = []
        self.deleted = []

    def generate_presigned_url(self, operation, Params=None, ExpiresIn=None):
        self.presigned.append({"op": operation, "params": Params, "expires": ExpiresIn})
        return f"https://s3.fake/{Params['Key']}?op={operation}"

    def delete_object(self, Bucket, Key):
        self.deleted.append({"bucket": Bucket, "key": Key})
        return {}


class FakeSSM:
    def __init__(self):
        self.params = {}
        self.calls = 0

    def get_parameter(self, Name, WithDecryption=False):
        self.calls += 1
        return {"Parameter": {"Value": self.params[Name]}}


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def aws(monkeypatch):
    """Patch every cached AWS client with in-memory fakes for each test."""
    tables = {name: FakeTable(name, keys) for name, keys in TABLE_KEYS.items()}
    ddb = FakeDDB(tables)
    ses = FakeSES()
    s3 = FakeS3()
    ssm = FakeSSM()

    monkeypatch.setattr(shared_db, "_resource", ddb)
    monkeypatch.setattr(routes_auth, "_ses", ses)
    monkeypatch.setattr(routes_audio, "_s3", s3)
    monkeypatch.setattr(routes_lessons, "_s3", s3)
    monkeypatch.setattr(shared_secrets, "_ssm", ssm)
    monkeypatch.setattr(shared_secrets, "_cache", {})

    yield SimpleNamespace(
        tables=tables, ddb=ddb, ses=ses, s3=s3, ssm=ssm,
        users=tables[shared_db.USERS_TABLE],
        otp=tables[shared_db.OTP_TABLE],
        lessons=tables[shared_db.LESSONS_TABLE],
        progress=tables[shared_db.PROGRESS_TABLE],
        sessions=tables[shared_db.SESSIONS_TABLE],
        config=tables[shared_db.CONFIG_TABLE],
    )


def make_event(method="GET", path="/", body=None, token=None, headers=None):
    hdrs = dict(headers or {})
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    return {
        "httpMethod": method,
        "path": path,
        "headers": hdrs,
        "body": json.dumps(body) if body is not None else None,
    }


@pytest.fixture
def event_factory():
    return make_event


@pytest.fixture
def user_token():
    return shared_auth.create_token("user-1", "user@example.com", False)


@pytest.fixture
def admin_token():
    return shared_auth.create_token("admin-1", "admin@example.com", True)


def body_of(resp):
    return json.loads(resp["body"])
