# testdoc_cover — Test Suite Documentation

This directory holds the project's exhaustive regression test suite. Every
backend route/module and every frontend component/page has at least one test
here, and the whole suite runs **fully offline** — AWS (DynamoDB, S3, SES,
SSM), OpenAI, and all HTTP traffic are replaced with in-memory fakes and
stubbed `fetch`.

> This suite complements (does not replace) the smaller CI suites in
> `backend/tests/` and `frontend/src/__tests__/`, which `./ci.sh` runs.

## How to run

```bash
# Everything (backend + frontend)
./testdoc_cover/run_tests.sh

# One side only
./testdoc_cover/run_tests.sh backend
./testdoc_cover/run_tests.sh frontend
```

Direct invocations, e.g. for a single file or test:

```bash
# Backend — pytest (requires: pytest, PyJWT, boto3; same deps ci.sh installs)
python3 -m pytest testdoc_cover/testcase/backend -q
python3 -m pytest testdoc_cover/testcase/backend/routes/test_sessions.py -v
python3 -m pytest testdoc_cover/testcase/backend -k "verify_otp" -v

# Frontend — vitest (requires frontend/node_modules; run `npm ci` in frontend/ once)
cd frontend
npx vitest run --config ../testdoc_cover/testcase/frontend/vitest.config.mjs
npx vitest run --config ../testdoc_cover/testcase/frontend/vitest.config.mjs -t "sentence mode"
```

Frameworks: **pytest** (backend), **vitest + @testing-library/react + jsdom**
(frontend, JSX via `@vitejs/plugin-react`).

## Directory map

The test tree mirrors the source tree, so a coverage gap is visible by
comparing directory listings:

```
testcase/
├── backend/                       ← mirrors backend/
│   ├── conftest.py                shared fixtures: FakeTable/FakeDDB/FakeSES/
│   │                              FakeS3/FakeSSM, event factory, token fixtures
│   ├── test_handler.py            → backend/handler.py
│   ├── routes/
│   │   ├── test_about.py          → backend/routes/about.py
│   │   ├── test_admin.py          → backend/routes/admin.py
│   │   ├── test_audio.py          → backend/routes/audio.py
│   │   ├── test_auth.py           → backend/routes/auth.py
│   │   ├── test_lessons.py        → backend/routes/lessons.py
│   │   ├── test_progress.py       → backend/routes/progress.py
│   │   ├── test_sessions.py       → backend/routes/sessions.py
│   │   └── test_translate.py      → backend/routes/translate.py
│   └── shared/
│       ├── test_auth.py           → backend/shared/auth.py
│       ├── test_db.py             → backend/shared/db.py
│       ├── test_response.py       → backend/shared/response.py
│       └── test_secrets.py        → backend/shared/secrets.py
└── frontend/                      ← mirrors frontend/src/
    ├── vitest.config.mjs           suite config (jsdom, @src alias → frontend/src)
    ├── setup.js                   jest-dom + media/scroll/beacon shims
    ├── helpers.jsx                fetch stubbing, auth seeding, call inspection
    ├── node_modules → ../../../frontend/node_modules   (symlink; recreated by run_tests.sh)
    ├── App.test.jsx               → frontend/src/App.jsx
    ├── api/client.test.js         → frontend/src/api/client.js
    ├── contexts/AuthContext.test.jsx → frontend/src/contexts/AuthContext.jsx
    ├── components/
    │   ├── DictationTab.test.jsx  → frontend/src/components/DictationTab.jsx
    │   ├── Layout.test.jsx        → frontend/src/components/Layout.jsx
    │   ├── LessonCard.test.jsx    → frontend/src/components/LessonCard.jsx
    │   └── TranscriptTab.test.jsx → frontend/src/components/TranscriptTab.jsx
    └── pages/
        ├── About.test.jsx         → frontend/src/pages/About.jsx
        ├── AdminPanel.test.jsx    → frontend/src/pages/AdminPanel.jsx
        ├── CreateLesson.test.jsx  → frontend/src/pages/CreateLesson.jsx
        ├── Login.test.jsx         → frontend/src/pages/Login.jsx
        ├── Practice.test.jsx      → frontend/src/pages/Practice.jsx
        └── PracticeSession.test.jsx → frontend/src/pages/PracticeSession.jsx
```

`frontend/src/main.jsx` is bootstrap-only (createRoot + BrowserRouter) and has
no testable logic; its routing behavior is covered by `App.test.jsx`.

See [COVERAGE.md](COVERAGE.md) for what each file covers, per feature.

## How the offline fakes work

**Backend** (`testcase/backend/conftest.py`): the autouse `aws` fixture patches
the module-level cached clients that the backend creates lazily:

| Real dependency | Patched attribute | Fake |
|---|---|---|
| DynamoDB | `shared.db._resource` | `FakeDDB` / `FakeTable` (dict-backed; supports put/get/delete/scan/query/update incl. `SET`/`ADD` expressions and `batch_get_item`) |
| SES | `routes.auth._ses` | `FakeSES` (records `send_email` calls) |
| S3 | `routes.audio._s3`, `routes.lessons._s3` | `FakeS3` (records presigns/deletes, returns `https://s3.fake/...` URLs) |
| SSM | `shared.secrets._ssm` | `FakeSSM` (dict of params, counts calls) |

OpenAI is faked per-test by monkeypatching `routes.translate._openai_chat` (or
`urllib.request.urlopen` for the transport test). JWT uses the `JWT_SECRET`
env var set by conftest. Build events with the `event_factory` fixture /
`make_event`, and use the `user_token` / `admin_token` fixtures for auth.

**Frontend** (`testcase/frontend/helpers.jsx` + `setup.js`): all network I/O
goes through `stubFetch(routeFn)`, which stubs global `fetch` with a URL-based
router. `seedUser()` pre-populates `localStorage` the way a real login does.
`setup.js` shims what jsdom lacks: `HTMLMediaElement.play/pause` (dispatching
real `play`/`pause` events), `scrollIntoView`, `sendBeacon`, and
`URL.createObjectURL`. `CreateLesson.test.jsx` additionally stubs
`AudioContext`/`OfflineAudioContext` for the audio trim/save paths.

## Adding a test for a new feature (self-service)

1. Create (or extend) the test file that mirrors the source file you changed:
   `backend/routes/foo.py` → `testcase/backend/routes/test_foo.py`;
   `frontend/src/pages/Foo.jsx` → `testcase/frontend/pages/Foo.test.jsx`.
2. Cover at minimum: the happy path, edge cases (empty/null/boundary), and
   error handling (invalid input, failed API call).
3. Keep it offline — use the conftest fakes / `stubFetch`; never call real
   services. If a new AWS call shape is needed, extend the fakes in
   `conftest.py` rather than bypassing them.
4. Update [COVERAGE.md](COVERAGE.md) with the new coverage.
5. Run `./testdoc_cover/run_tests.sh` — the suite must be 100% green.

**When a test fails after a code change**, diagnose before editing anything:
- If the change accidentally broke existing behavior → fix the *source*.
- If the behavior change was intentional → update the *test* (and this doc).
Never delete or weaken a failing test just to get a pass.
