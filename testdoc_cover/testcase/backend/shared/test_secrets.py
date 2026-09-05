"""Covers backend/shared/secrets.py — SSM fetch with per-container caching."""
import pytest
from shared import secrets as shared_secrets
from shared.secrets import get_secret


def test_get_secret_fetches_from_ssm(aws):
    aws.ssm.params["/app/key"] = "s3cret"
    assert get_secret("/app/key") == "s3cret"
    assert aws.ssm.calls == 1


def test_get_secret_caches_after_first_fetch(aws):
    aws.ssm.params["/app/key"] = "s3cret"
    get_secret("/app/key")
    get_secret("/app/key")
    get_secret("/app/key")
    assert aws.ssm.calls == 1


def test_get_secret_distinct_params_fetched_separately(aws):
    aws.ssm.params["/a"] = "one"
    aws.ssm.params["/b"] = "two"
    assert get_secret("/a") == "one"
    assert get_secret("/b") == "two"
    assert aws.ssm.calls == 2


def test_get_secret_missing_param_raises(aws):
    with pytest.raises(KeyError):
        get_secret("/does/not/exist")


def test_client_is_created_lazily_and_cached(monkeypatch):
    created = []

    class FakeBoto:
        @staticmethod
        def client(service, region_name=None):
            created.append(service)
            return object()

    monkeypatch.setattr(shared_secrets, "_ssm", None)
    monkeypatch.setattr(shared_secrets, "boto3", FakeBoto)
    first = shared_secrets._client()
    second = shared_secrets._client()
    assert first is second
    assert created == ["ssm"]
