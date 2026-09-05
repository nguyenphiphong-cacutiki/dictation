import json

from shared.auth import require_admin
from shared.db import CONFIG_TABLE, table
from shared.response import fail, ok

_ABOUT_KEY = "about"


def handle(event, method, path):
    if method == "GET" and path == "/about":
        return _get()
    if method == "PUT" and path == "/admin/about":
        _user, err = require_admin(event)
        if err:
            return err
        return _put(event)
    return fail("Not found", 404)


def _get():
    res = table(CONFIG_TABLE).get_item(Key={"config_key": _ABOUT_KEY})
    item = res.get("Item")
    return ok({"content": item.get("content", "") if item else ""})


def _put(event):
    body = json.loads(event.get("body") or "{}")
    content = body.get("content", "")
    table(CONFIG_TABLE).put_item(Item={"config_key": _ABOUT_KEY, "content": content})
    return ok({"saved": True})
