import sys
import traceback

from routes import auth, lessons, progress, admin, audio
from shared.response import fail

_CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
}


def handler(event, context):
    # Support both REST API and HTTP API event formats
    method = (
        event.get("httpMethod")
        or (event.get("requestContext") or {}).get("http", {}).get("method", "")
    ).upper()
    raw_path = event.get("path") or event.get("rawPath") or "/"

    # Strip /api prefix (added by CloudFront behavior path)
    path = raw_path[4:] if raw_path.startswith("/api") else raw_path
    if not path:
        path = "/"

    if method == "OPTIONS":
        return {"statusCode": 200, "headers": _CORS, "body": ""}

    try:
        if path.startswith("/auth"):
            resp = auth.handle(event, method, path)
        elif path.startswith("/admin"):
            resp = admin.handle(event, method, path)
        elif path.startswith("/lessons"):
            resp = lessons.handle(event, method, path)
        elif path.startswith("/progress"):
            resp = progress.handle(event, method, path)
        elif path.startswith("/audio"):
            resp = audio.handle(event, method, path)
        else:
            resp = fail("Not found", 404)
    except Exception as e:
        print(f"Unhandled error: {e}", file=sys.stderr)
        traceback.print_exc()
        resp = fail("Internal server error", 500)

    resp.setdefault("headers", {}).update(_CORS)
    return resp
