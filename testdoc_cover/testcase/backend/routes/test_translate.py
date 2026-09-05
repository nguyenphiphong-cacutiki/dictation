"""Covers backend/routes/translate.py — batching, target filtering, OpenAI I/O."""
import io
import json
import urllib.error

import pytest
from routes import translate as routes_translate

from ..conftest import body_of, make_event


def _call(body=None, token=None, method="POST", path="/translate"):
    return routes_translate.handle(make_event(method, path, body, token=token), method, path)


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")


@pytest.fixture
def openai_stub(monkeypatch):
    """Replace _openai_chat; echoes back a translation for each requested index."""
    calls = []

    def fake_chat(messages):
        calls.append(messages)
        user_msg = messages[1]["content"]
        indices = json.loads(user_msg.split("indices into Vietnamese: ")[1].split(".\n")[0])
        return json.dumps({"translations": {str(i): f" vi-{i} " for i in indices}})

    monkeypatch.setattr(routes_translate, "_openai_chat", fake_chat)
    return calls


def test_translate_requires_auth(configured):
    assert _call({"sentences": [{"transcript": "hi"}]})["statusCode"] == 401


def test_unknown_translate_path_404(user_token):
    assert _call(token=user_token, method="GET")["statusCode"] == 404


def test_translate_503_when_not_configured(user_token):
    resp = _call({"sentences": [{"transcript": "hi"}]}, token=user_token)
    assert resp["statusCode"] == 503


def test_translate_rejects_missing_or_invalid_sentences(configured, user_token):
    assert _call({}, token=user_token)["statusCode"] == 400
    assert _call({"sentences": "nope"}, token=user_token)["statusCode"] == 400
    assert _call({"sentences": []}, token=user_token)["statusCode"] == 400


def test_translate_defaults_to_all_nonempty_transcripts(configured, openai_stub, user_token):
    body = {"sentences": [{"transcript": "one"}, {"transcript": " "}, {"transcript": "three"}]}
    data = body_of(_call(body, token=user_token))
    assert set(data["translations"]) == {"0", "2"}
    assert data["translations"]["0"] == "vi-0"  # values are trimmed


def test_translate_filters_invalid_explicit_targets(configured, openai_stub, user_token):
    body = {
        "sentences": [{"transcript": "one"}, {"transcript": ""}, {"transcript": "three"}],
        "targets": [0, 1, 2, 99, -1, "x"],
    }
    data = body_of(_call(body, token=user_token))
    # 1 dropped (empty transcript), 99/-1 out of range, "x" not an int
    assert set(data["translations"]) == {"0", "2"}


def test_translate_400_when_no_valid_targets(configured, openai_stub, user_token):
    body = {"sentences": [{"transcript": "one"}], "targets": [5]}
    assert _call(body, token=user_token)["statusCode"] == 400


def test_translate_handles_non_dict_sentences(configured, openai_stub, user_token):
    body = {"sentences": ["raw string", {"transcript": "ok"}]}
    data = body_of(_call(body, token=user_token))
    assert set(data["translations"]) == {"1"}


def test_translate_batches_large_target_lists(configured, openai_stub, user_token):
    n = routes_translate.MAX_TARGETS_PER_CALL + 5
    body = {"sentences": [{"transcript": f"s{i}"} for i in range(n)]}
    data = body_of(_call(body, token=user_token))
    assert len(openai_stub) == 2  # 40 + 5
    assert len(data["translations"]) == n


def test_translate_context_contains_all_sentences(configured, openai_stub, user_token):
    body = {"sentences": [{"transcript": "alpha"}, {"transcript": "beta"}], "targets": [1]}
    _call(body, token=user_token)
    user_msg = openai_stub[0][1]["content"]
    assert "[0] alpha" in user_msg
    assert "[1] beta" in user_msg


def test_translate_502_on_network_error(configured, monkeypatch, user_token):
    def fail(messages):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(routes_translate, "_openai_chat", fail)
    resp = _call({"sentences": [{"transcript": "hi"}]}, token=user_token)
    assert resp["statusCode"] == 502


def test_translate_502_on_malformed_model_output(configured, monkeypatch, user_token):
    monkeypatch.setattr(routes_translate, "_openai_chat", lambda m: "not json")
    resp = _call({"sentences": [{"transcript": "hi"}]}, token=user_token)
    assert resp["statusCode"] == 502


def test_translate_batch_accepts_bare_translation_map(configured, monkeypatch):
    # The model may return the map directly without a "translations" wrapper.
    monkeypatch.setattr(routes_translate, "_openai_chat",
                        lambda m: json.dumps({"0": "xin chào"}))
    result = routes_translate._translate_batch("[0] hello", [0])
    assert result == {"0": "xin chào"}


def test_translate_batch_drops_unrequested_indices(configured, monkeypatch):
    monkeypatch.setattr(
        routes_translate, "_openai_chat",
        lambda m: json.dumps({"translations": {"0": "a", "7": "extra"}}),
    )
    assert routes_translate._translate_batch("[0] hello", [0]) == {"0": "a"}


def test_openai_chat_builds_request_and_parses_response(configured, monkeypatch):
    captured = {}

    class FakeResp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url
        captured["auth"] = req.get_header("Authorization")
        captured["payload"] = json.loads(req.data.decode())
        captured["timeout"] = timeout
        return FakeResp(json.dumps(
            {"choices": [{"message": {"content": '{"translations": {}}'}}]}
        ).encode())

    monkeypatch.setattr(routes_translate.urllib.request, "urlopen", fake_urlopen)
    content = routes_translate._openai_chat([{"role": "user", "content": "hi"}])

    assert content == '{"translations": {}}'
    assert captured["url"] == routes_translate.OPENAI_URL
    assert captured["auth"] == "Bearer sk-test"
    assert captured["payload"]["model"] == routes_translate.OPENAI_MODEL
    assert captured["payload"]["response_format"] == {"type": "json_object"}
    assert captured["timeout"] == routes_translate._TIMEOUT


def test_api_key_prefers_ssm_param(monkeypatch, aws):
    monkeypatch.setattr(routes_translate, "OPENAI_API_KEY_PARAM", "/app/openai")
    aws.ssm.params["/app/openai"] = "sk-from-ssm"
    assert routes_translate._api_key() == "sk-from-ssm"
