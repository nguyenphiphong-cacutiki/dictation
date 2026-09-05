"""Covers backend/shared/response.py — ok(), fail(), DecimalEncoder."""
import json
from decimal import Decimal

import pytest
from shared.response import DecimalEncoder, fail, ok


def test_ok_defaults_to_empty_object_and_200():
    resp = ok()
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {}


def test_ok_serializes_data_and_custom_status():
    resp = ok({"a": 1}, 201)
    assert resp["statusCode"] == 201
    assert json.loads(resp["body"]) == {"a": 1}


def test_ok_none_data_is_empty_object_not_null():
    assert json.loads(ok(None)["body"]) == {}


def test_ok_converts_decimals_to_floats():
    resp = ok({"count": Decimal("3"), "pct": Decimal("1.5")})
    assert json.loads(resp["body"]) == {"count": 3.0, "pct": 1.5}


def test_fail_wraps_message_with_default_400():
    resp = fail("Bad input")
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"]) == {"error": "Bad input"}


def test_fail_custom_status():
    assert fail("Nope", 403)["statusCode"] == 403


def test_decimal_encoder_rejects_unknown_types():
    with pytest.raises(TypeError):
        json.dumps({"x": object()}, cls=DecimalEncoder)
