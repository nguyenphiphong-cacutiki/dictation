import json
from unittest.mock import patch

import pytest

from shared.auth import create_token
from tests.conftest import make_event


def _token():
    return create_token("uid-1", "user@example.com", False)


@pytest.fixture(autouse=True)
def set_key(monkeypatch):
    # No OPENAI_API_KEY_PARAM is set, so the route falls back to the env var.
    monkeypatch.setattr("routes.translate.OPENAI_API_KEY_PARAM", "")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    yield


def _sentences(*texts):
    return [{"transcript": t, "translation": ""} for t in texts]


class TestAuthAndValidation:
    def test_unauthorized(self):
        from routes.translate import handle
        r = handle(make_event("POST", "/translate", {"sentences": _sentences("Hi")}),
                   "POST", "/translate")
        assert r["statusCode"] == 401

    def test_no_sentences(self):
        from routes.translate import handle
        r = handle(make_event("POST", "/translate", {"sentences": []}, token=_token()),
                   "POST", "/translate")
        assert r["statusCode"] == 400

    def test_nothing_to_translate_when_all_empty(self):
        from routes.translate import handle
        r = handle(make_event("POST", "/translate", {"sentences": _sentences("", "  ")}, token=_token()),
                   "POST", "/translate")
        assert r["statusCode"] == 400

    def test_not_configured(self, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        from routes.translate import handle
        r = handle(make_event("POST", "/translate", {"sentences": _sentences("Hi")}, token=_token()),
                   "POST", "/translate")
        assert r["statusCode"] == 503

    def test_unknown_path(self):
        from routes.translate import handle
        r = handle(make_event("GET", "/translate/x", token=_token()), "GET", "/translate/x")
        assert r["statusCode"] == 404


class TestTranslate:
    def test_bulk_default_targets_skips_empty(self):
        from routes.translate import handle
        chat = json.dumps({"translations": {"0": "Xin chào", "2": "Tạm biệt"}})
        with patch("routes.translate._openai_chat", return_value=chat) as m:
            r = handle(make_event("POST", "/translate",
                                  {"sentences": _sentences("Hello", "", "Goodbye")}, token=_token()),
                       "POST", "/translate")
        assert r["statusCode"] == 200
        body = json.loads(r["body"])
        assert body["translations"] == {"0": "Xin chào", "2": "Tạm biệt"}
        # Empty sentence index 1 must not be requested
        sent_prompt = m.call_args[0][0][1]["content"]
        assert "[1] " in sent_prompt  # still in context
        assert "Vietnamese: [0, 2]" in sent_prompt

    def test_single_target(self):
        from routes.translate import handle
        chat = json.dumps({"translations": {"1": "Câu hai"}})
        with patch("routes.translate._openai_chat", return_value=chat):
            r = handle(make_event("POST", "/translate",
                                  {"sentences": _sentences("One", "Two", "Three"), "targets": [1]},
                                  token=_token()),
                       "POST", "/translate")
        assert r["statusCode"] == 200
        assert json.loads(r["body"])["translations"] == {"1": "Câu hai"}

    def test_out_of_range_target_dropped(self):
        from routes.translate import handle
        with patch("routes.translate._openai_chat") as m:
            r = handle(make_event("POST", "/translate",
                                  {"sentences": _sentences("One"), "targets": [5]}, token=_token()),
                       "POST", "/translate")
        assert r["statusCode"] == 400
        m.assert_not_called()

    def test_chunking_multiple_calls(self):
        import routes.translate as t
        from routes.translate import handle
        t.MAX_TARGETS_PER_CALL = 2
        try:
            calls = []

            def fake_chat(messages):
                # Echo back the requested indices as translations
                prompt = messages[1]["content"]
                idx_part = prompt.split("Vietnamese: [")[1].split("]")[0]
                idxs = [s.strip() for s in idx_part.split(",")]
                calls.append(idxs)
                return json.dumps({"translations": {i: f"vi-{i}" for i in idxs}})

            with patch("routes.translate._openai_chat", side_effect=fake_chat):
                r = handle(make_event("POST", "/translate",
                                      {"sentences": _sentences("a", "b", "c", "d", "e")}, token=_token()),
                           "POST", "/translate")
            assert r["statusCode"] == 200
            body = json.loads(r["body"])
            assert len(body["translations"]) == 5
            assert len(calls) == 3  # 5 targets / 2 per call
        finally:
            t.MAX_TARGETS_PER_CALL = 40

    def test_openai_error_returns_502(self):
        from routes.translate import handle
        with patch("routes.translate._openai_chat", side_effect=ValueError("boom")):
            r = handle(make_event("POST", "/translate",
                                  {"sentences": _sentences("Hi")}, token=_token()),
                       "POST", "/translate")
        assert r["statusCode"] == 502
