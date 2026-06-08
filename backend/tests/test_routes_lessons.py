import json
from unittest.mock import MagicMock, patch

from shared.auth import create_token
from tests.conftest import make_event


def _token(user_id="uid-1", email="user@example.com", is_admin=False):
    return create_token(user_id, email, is_admin)


def _lesson(lesson_id="lid-1", owner_id="uid-1", status="published"):
    return {
        "lesson_id": lesson_id,
        "owner_id": owner_id,
        "owner_email": "user@example.com",
        "title": "Test Lesson",
        "audio_key": "audio/uid-1/file.mp3",
        "sentences": ["Hello world", "Goodbye world"],
        "sentence_count": 2,
        "status": status,
        "admin_feedback": "",
        "created_at": "2024-01-01T00:00:00+00:00",
        "updated_at": "2024-01-01T00:00:00+00:00",
    }


class TestListLessons:
    def test_unauthenticated_gets_published_only(self):
        from routes.lessons import handle
        lessons_tbl = MagicMock()
        lessons_tbl.scan.return_value = {"Items": [_lesson()]}

        with patch("routes.lessons.table", return_value=lessons_tbl):
            r = handle(make_event("GET", "/lessons"), "GET", "/lessons")

        assert r["statusCode"] == 200
        body = json.loads(r["body"])
        assert "my_lessons" in body
        assert "community" in body
        assert body["my_lessons"] == []
        assert len(body["community"]) == 1

    def test_authenticated_owner_sees_own_lessons(self):
        from routes.lessons import handle
        token = _token("uid-1")
        lessons_tbl = MagicMock()
        lessons_tbl.scan.return_value = {"Items": [_lesson(owner_id="uid-1")]}

        prog_tbl = MagicMock()
        ddb_mock = MagicMock()
        ddb_mock.batch_get_item.return_value = {"Responses": {"dictation-progress": []}}

        with patch("routes.lessons.table", side_effect=lambda n: lessons_tbl if "lessons" in n else prog_tbl), \
             patch("routes.lessons.ddb", return_value=ddb_mock):
            r = handle(make_event("GET", "/lessons", token=token), "GET", "/lessons")

        assert r["statusCode"] == 200
        body = json.loads(r["body"])
        assert len(body["my_lessons"]) == 1
        assert body["community"] == []

    def test_pulled_lesson_hidden_from_community(self):
        from routes.lessons import handle
        lessons_tbl = MagicMock()
        lessons_tbl.scan.return_value = {"Items": [_lesson(status="pulled")]}

        with patch("routes.lessons.table", return_value=lessons_tbl):
            r = handle(make_event("GET", "/lessons"), "GET", "/lessons")

        body = json.loads(r["body"])
        assert body["community"] == []


class TestGetLesson:
    def test_not_found(self):
        from routes.lessons import handle
        tbl = MagicMock()
        tbl.get_item.return_value = {}

        with patch("routes.lessons.table", return_value=tbl):
            r = handle(make_event("GET", "/lessons/lid-99"), "GET", "/lessons/lid-99")

        assert r["statusCode"] == 404

    def test_published_accessible_without_auth(self):
        from routes.lessons import handle
        tbl = MagicMock()
        tbl.get_item.return_value = {"Item": _lesson()}

        with patch("routes.lessons.table", return_value=tbl), \
             patch("routes.lessons.s3", return_value=MagicMock(generate_presigned_url=MagicMock(return_value="http://url"))):
            r = handle(make_event("GET", "/lessons/lid-1"), "GET", "/lessons/lid-1")

        assert r["statusCode"] == 200

    def test_pulled_hidden_from_non_owner(self):
        from routes.lessons import handle
        tbl = MagicMock()
        tbl.get_item.return_value = {"Item": _lesson(owner_id="uid-owner", status="pulled")}

        with patch("routes.lessons.table", return_value=tbl):
            # request from different user
            token = _token("uid-other")
            r = handle(make_event("GET", "/lessons/lid-1", token=token), "GET", "/lessons/lid-1")

        assert r["statusCode"] == 404

    def test_pulled_visible_to_owner(self):
        from routes.lessons import handle
        tbl = MagicMock()
        tbl.get_item.side_effect = [
            {"Item": _lesson(owner_id="uid-1", status="pulled")},
            {},  # progress lookup
        ]
        token = _token("uid-1")

        with patch("routes.lessons.table", return_value=tbl), \
             patch("routes.lessons.s3", return_value=MagicMock(generate_presigned_url=MagicMock(return_value="http://url"))):
            r = handle(make_event("GET", "/lessons/lid-1", token=token), "GET", "/lessons/lid-1")

        assert r["statusCode"] == 200

    def test_pulled_visible_to_admin(self):
        from routes.lessons import handle
        tbl = MagicMock()
        tbl.get_item.side_effect = [
            {"Item": _lesson(owner_id="uid-other", status="pulled")},
            {},  # progress lookup
        ]
        token = _token("uid-admin", is_admin=True)

        with patch("routes.lessons.table", return_value=tbl), \
             patch("routes.lessons.s3", return_value=MagicMock(generate_presigned_url=MagicMock(return_value="http://url"))):
            r = handle(make_event("GET", "/lessons/lid-1", token=token), "GET", "/lessons/lid-1")

        assert r["statusCode"] == 200


class TestCreateLesson:
    def test_missing_title(self):
        from routes.lessons import handle
        token = _token()
        r = handle(make_event("POST", "/lessons", {"audio_key": "k"}, token=token), "POST", "/lessons")
        assert r["statusCode"] == 400

    def test_missing_audio_key(self):
        from routes.lessons import handle
        token = _token()
        r = handle(make_event("POST", "/lessons", {"title": "T"}, token=token), "POST", "/lessons")
        assert r["statusCode"] == 400

    def test_unauthorized(self):
        from routes.lessons import handle
        r = handle(make_event("POST", "/lessons", {"title": "T", "audio_key": "k"}), "POST", "/lessons")
        assert r["statusCode"] == 401

    def test_success(self):
        from routes.lessons import handle
        token = _token()
        tbl = MagicMock()

        with patch("routes.lessons.table", return_value=tbl):
            r = handle(make_event("POST", "/lessons",
                                  {"title": "My Lesson", "audio_key": "audio/uid-1/x.mp3", "sentences": ["a", "b"]},
                                  token=token),
                       "POST", "/lessons")

        assert r["statusCode"] == 201
        tbl.put_item.assert_called_once()
        item = tbl.put_item.call_args[1]["Item"]
        assert item["title"] == "My Lesson"
        assert item["sentence_count"] == 2


class TestUpdateLesson:
    def test_not_found(self):
        from routes.lessons import handle
        token = _token()
        tbl = MagicMock()
        tbl.get_item.return_value = {}

        with patch("routes.lessons.table", return_value=tbl):
            r = handle(make_event("PUT", "/lessons/lid-1", {"title": "New"}, token=token),
                       "PUT", "/lessons/lid-1")

        assert r["statusCode"] == 404

    def test_forbidden_for_non_owner(self):
        from routes.lessons import handle
        token = _token("uid-other")
        tbl = MagicMock()
        tbl.get_item.return_value = {"Item": _lesson(owner_id="uid-owner")}

        with patch("routes.lessons.table", return_value=tbl):
            r = handle(make_event("PUT", "/lessons/lid-1", {"title": "X"}, token=token),
                       "PUT", "/lessons/lid-1")

        assert r["statusCode"] == 403

    def test_owner_can_update(self):
        from routes.lessons import handle
        token = _token("uid-1")
        tbl = MagicMock()
        tbl.get_item.return_value = {"Item": _lesson(owner_id="uid-1")}

        with patch("routes.lessons.table", return_value=tbl):
            r = handle(make_event("PUT", "/lessons/lid-1", {"title": "Updated"}, token=token),
                       "PUT", "/lessons/lid-1")

        assert r["statusCode"] == 200
        tbl.update_item.assert_called_once()

    def test_republish_on_update_when_pulled(self):
        from routes.lessons import handle
        token = _token("uid-1")
        tbl = MagicMock()
        tbl.get_item.return_value = {"Item": _lesson(owner_id="uid-1", status="pulled")}

        with patch("routes.lessons.table", return_value=tbl):
            r = handle(make_event("PUT", "/lessons/lid-1", {"title": "Fixed"}, token=token),
                       "PUT", "/lessons/lid-1")

        assert r["statusCode"] == 200
        call = tbl.update_item.call_args[1]
        values = call["ExpressionAttributeValues"]
        assert ":status" in values and values[":status"] == "published"


class TestDeleteLesson:
    def test_not_found(self):
        from routes.lessons import handle
        token = _token()
        tbl = MagicMock()
        tbl.get_item.return_value = {}

        with patch("routes.lessons.table", return_value=tbl):
            r = handle(make_event("DELETE", "/lessons/lid-1", token=token), "DELETE", "/lessons/lid-1")

        assert r["statusCode"] == 404

    def test_forbidden(self):
        from routes.lessons import handle
        token = _token("uid-other")
        tbl = MagicMock()
        tbl.get_item.return_value = {"Item": _lesson(owner_id="uid-owner")}

        with patch("routes.lessons.table", return_value=tbl):
            r = handle(make_event("DELETE", "/lessons/lid-1", token=token), "DELETE", "/lessons/lid-1")

        assert r["statusCode"] == 403

    def test_success(self):
        from routes.lessons import handle
        token = _token("uid-1")
        tbl = MagicMock()
        tbl.get_item.return_value = {"Item": _lesson(owner_id="uid-1")}

        with patch("routes.lessons.table", return_value=tbl):
            r = handle(make_event("DELETE", "/lessons/lid-1", token=token), "DELETE", "/lessons/lid-1")

        assert r["statusCode"] == 200
        tbl.delete_item.assert_called_once_with(Key={"lesson_id": "lid-1"})
