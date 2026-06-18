import json
import os
import urllib.error
import urllib.request

from shared.auth import require_user
from shared.response import ok, fail
from shared.secrets import get_secret

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_API_KEY_PARAM = os.environ.get("OPENAI_API_KEY_PARAM", "")


def _api_key():
    # Fetched from SSM at runtime (cached). Falls back to a direct env var for
    # local dev and tests.
    if OPENAI_API_KEY_PARAM:
        return get_secret(OPENAI_API_KEY_PARAM)
    return os.environ.get("OPENAI_API_KEY", "")

# Max number of sentences to translate in a single OpenAI request. The full
# transcript is always sent as context, but only this many targets are asked
# for per call so very large lessons stay well under the model token limit.
MAX_TARGETS_PER_CALL = 40
_TIMEOUT = 25


def handle(event, method, path):
    if method == "POST" and path == "/translate":
        user, err = require_user(event)
        if err:
            return err
        return _translate(event)
    return fail("Not found", 404)


def _translate(event):
    if not _api_key():
        return fail("Translation is not configured", 503)

    body = json.loads(event.get("body") or "{}")
    sentences = body.get("sentences") or []
    targets = body.get("targets")

    if not isinstance(sentences, list) or not sentences:
        return fail("No sentences provided")

    transcripts = [(s.get("transcript") or "").strip() if isinstance(s, dict) else ""
                   for s in sentences]

    # Default targets: every sentence that has text. Otherwise honour the
    # explicit list, dropping out-of-range or empty-transcript indices.
    if targets is None:
        targets = [i for i, t in enumerate(transcripts) if t]
    else:
        targets = [i for i in targets
                   if isinstance(i, int) and 0 <= i < len(transcripts) and transcripts[i]]

    if not targets:
        return fail("Nothing to translate")

    # Numbered, ordered context shared across every batch.
    context = "\n".join(f"[{i}] {t}" for i, t in enumerate(transcripts))

    translations = {}
    try:
        for start in range(0, len(targets), MAX_TARGETS_PER_CALL):
            batch = targets[start:start + MAX_TARGETS_PER_CALL]
            translations.update(_translate_batch(context, batch))
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as e:
        print(f"Translation failed: {e}")
        return fail("Translation request failed", 502)

    return ok({"translations": translations})


def _translate_batch(context, target_indices):
    system = (
        "You are a professional translator. You translate English sentences from "
        "an audio transcript into natural, fluent Vietnamese."
    )
    user = (
        "Full transcript in order, one numbered sentence per line:\n\n"
        f"{context}\n\n"
        f"Translate ONLY the sentences with these indices into Vietnamese: {target_indices}.\n"
        "Use the surrounding sentences as context for natural, accurate translations, "
        "but translate each target sentence on its own.\n"
        'Respond with a JSON object of the form {"translations": {"<index>": "<vietnamese>"}} '
        "containing exactly the requested indices as string keys."
    )

    content = _openai_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ])

    data = json.loads(content)
    result = data.get("translations", data)
    # Keep only requested indices, as string keys, with trimmed values.
    return {str(i): str(result[str(i)]).strip()
            for i in target_indices if str(i) in result}


def _openai_chat(messages):
    payload = json.dumps({
        "model": OPENAI_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }).encode()

    req = urllib.request.Request(
        OPENAI_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {_api_key()}",
        },
        method="POST",
    )
    # URL is the constant HTTPS OpenAI endpoint, not user-controlled.
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:  # nosec B310
        body = json.loads(resp.read().decode())
    return body["choices"][0]["message"]["content"]
