from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def reset_secrets():
    import shared.secrets as s
    s._ssm = None
    s._cache = {}
    yield
    s._ssm = None
    s._cache = {}


def test_get_secret_fetches_with_decryption():
    import shared.secrets as s
    mock = MagicMock()
    mock.get_parameter.return_value = {"Parameter": {"Value": "the-secret"}}
    with patch.object(s, "_client", return_value=mock):
        assert s.get_secret("/dictation/dev/jwt_secret") == "the-secret"
    mock.get_parameter.assert_called_once_with(
        Name="/dictation/dev/jwt_secret", WithDecryption=True
    )


def test_get_secret_is_cached():
    import shared.secrets as s
    mock = MagicMock()
    mock.get_parameter.return_value = {"Parameter": {"Value": "v"}}
    with patch.object(s, "_client", return_value=mock):
        s.get_secret("/p")
        s.get_secret("/p")
    # Second call served from cache — SSM hit only once.
    mock.get_parameter.assert_called_once()


def test_auth_uses_ssm_when_param_set():
    from shared import auth
    with patch.object(auth, "_PARAM", "/dictation/dev/jwt_secret"), \
         patch("shared.auth.get_secret", return_value="ssm-secret") as gs:
        token = auth.create_token("u1", "e@x.com", False)
        decoded = auth.decode_token(token)
    assert decoded["user_id"] == "u1"
    assert gs.called
