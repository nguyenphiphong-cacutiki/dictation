import json
from decimal import Decimal

from shared.response import ok, fail


def test_ok_default():
    r = ok()
    assert r["statusCode"] == 200
    assert json.loads(r["body"]) == {}


def test_ok_with_data():
    r = ok({"key": "value"})
    assert r["statusCode"] == 200
    assert json.loads(r["body"]) == {"key": "value"}


def test_ok_custom_status():
    r = ok({"lesson_id": "abc"}, 201)
    assert r["statusCode"] == 201


def test_ok_decimal_serialized_as_float():
    r = ok({"count": Decimal("5")})
    data = json.loads(r["body"])
    assert data["count"] == 5.0
    assert isinstance(data["count"], float)


def test_fail_default():
    r = fail("bad input")
    assert r["statusCode"] == 400
    assert json.loads(r["body"]) == {"error": "bad input"}


def test_fail_custom_status():
    r = fail("not found", 404)
    assert r["statusCode"] == 404
    assert json.loads(r["body"])["error"] == "not found"
