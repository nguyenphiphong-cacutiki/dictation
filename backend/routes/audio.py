import json
import os
import uuid

import boto3

from shared.auth import require_user
from shared.response import ok, fail

_s3 = None
AUDIO_BUCKET = os.environ.get("AUDIO_BUCKET", "")
_region = os.environ.get("AWS_REGION", "ap-southeast-1")

ALLOWED_TYPES = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/aac": "aac",
    "audio/mp4": "m4a",
}


def s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", region_name=_region)
    return _s3


def handle(event, method, path):
    user, err = require_user(event)
    if err:
        return err

    if method == "POST" and path == "/audio/upload-url":
        return _upload_url(event, user)
    if method == "DELETE" and path == "/audio":
        return _delete_audio(event, user)
    return fail("Not found", 404)


def _upload_url(event, user):
    body = json.loads(event.get("body") or "{}")
    content_type = (body.get("content_type") or "").strip()
    ext = ALLOWED_TYPES.get(content_type)
    if not ext:
        return fail(f"Unsupported audio type. Allowed: {', '.join(ALLOWED_TYPES.keys())}")

    prefix = f"audio/{user['user_id']}/"
    # Reuse (overwrite in place) the caller's existing object only when it belongs
    # to them AND keeps the same extension. A .wav key must always hold WAV so the
    # client's byte-range re-trim stays valid; a format change gets a fresh key.
    preferred = (body.get("audio_key") or "").strip()
    if preferred and preferred.startswith(prefix) and preferred.endswith(f".{ext}"):
        key = preferred
    else:
        key = f"{prefix}{uuid.uuid4()}.{ext}"
    url = s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": AUDIO_BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=3600,
    )
    return ok({"upload_url": url, "audio_key": key})


def _delete_audio(event, user):
    body = json.loads(event.get("body") or "{}")
    key = (body.get("audio_key") or "").strip()
    if not key:
        return fail("audio_key is required")
    if not key.startswith(f"audio/{user['user_id']}/"):
        return fail("Forbidden", 403)
    s3().delete_object(Bucket=AUDIO_BUCKET, Key=key)
    return ok({})
