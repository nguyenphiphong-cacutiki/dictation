"""Covers backend/shared/db.py — table name config and lazy resource caching."""
from shared import db as shared_db


def test_table_names_have_defaults():
    assert shared_db.USERS_TABLE
    assert shared_db.OTP_TABLE
    assert shared_db.LESSONS_TABLE
    assert shared_db.PROGRESS_TABLE
    assert shared_db.SESSIONS_TABLE
    assert shared_db.CONFIG_TABLE


def test_ddb_resource_is_created_lazily_and_cached(monkeypatch):
    created = []

    class FakeBoto:
        @staticmethod
        def resource(service, region_name=None):
            created.append(service)
            return object()

    monkeypatch.setattr(shared_db, "_resource", None)
    monkeypatch.setattr(shared_db, "boto3", FakeBoto)
    first = shared_db.ddb()
    second = shared_db.ddb()
    assert first is second
    assert created == ["dynamodb"]


def test_table_delegates_to_resource(aws):
    tbl = shared_db.table(shared_db.LESSONS_TABLE)
    assert tbl is aws.lessons
