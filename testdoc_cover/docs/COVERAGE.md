# Coverage map

What each test file verifies, by feature. Counts reflect the suite as of
2026-09-05 (266 tests: 150 backend, 116 frontend).

## Backend

### `test_handler.py` → `handler.py` (routing/CORS)
- OPTIONS preflight returns 200 + CORS headers; CORS attached to every response
- `/api` prefix stripping; bare `/api` → `/`; REST **and** HTTP API event formats
- Dispatch of every path prefix to its route module; `/admin/about` → `about` (not `admin`)
- Unknown path → 404; uncaught route exception → 500 (never raises)

### `routes/test_auth.py` → OTP login
- request-otp: invalid email (empty / no `@`); code stored with 10-min TTL; SES email carries the code; email lowercased/trimmed
- request-otp SES failures: unverified recipient (`MessageRejected`, e.g. SES sandbox) → 422 with a clear message and the stored OTP deleted; any other SES `ClientError` propagates (→ 500 at the handler) with the OTP also cleaned up
- verify-otp: missing fields; unknown/expired/wrong code → 401; success creates user + session, consumes OTP, returns decodable JWT; ADMIN_EMAILS grants admin; existing user keeps `user_id`
- 6-digit numeric OTP generator; unknown subpath → 404

### `routes/test_about.py` → about content
- Public GET (empty and saved content); PUT requires admin (401/403); PUT saves; missing content saves empty; unknown method → 404

### `routes/test_admin.py` → moderation & user admin
- Every endpoint gated by admin (401/403); unknown path → 404
- List lessons: strips `sentences`, sorts newest-first, int counts
- Pull: feedback required, 404 on missing, sets status+feedback; Restore: 404 on missing, republishes and clears feedback
- List users: normalizes `total_seconds`, sorts newest-first
- User sessions: filtered per user, int duration, None preserved; user lessons: strips sentences

### `routes/test_audio.py` → presigned audio
- Auth required; unknown path → 404
- upload-url: rejects unsupported/missing content type; all 6 allowed types map to correct extension; same-owner+same-extension key reused; extension change or foreign key → fresh key under own prefix
- delete: key required; foreign prefix → 403 (no delete); own key deleted from bucket

### `routes/test_lessons.py` → lesson CRUD & visibility
- List: anonymous sees only published community; owner sees own (incl. pulled + feedback) newest-first; community grouped per owner email; progress attached (real and zero-default); no `sentences` leakage; `_bulk_progress` batches >100 ids and handles empty
- Get: 404 missing / trailing-slash; pulled hidden from strangers, visible to owner/admin; presigned `audio_url` (None without key); progress only when logged in
- Create: auth/title/audio required; 201 persists full metadata, trimmed title, sentence_count
- Update: auth/404/403; field+count updates; owner update republishes a pulled lesson; admin update of someone else's pulled lesson does **not** republish
- Delete: auth/404/403; owner and admin can delete; unsupported method → 404

### `routes/test_progress.py` → practice progress
- Auth required; lesson id required; unsupported method → 404
- GET zero-default and stored values; PUT requires `current_sentence` (0 accepted); increment_practice bumps count, otherwise preserved; per-user scoping

### `routes/test_sessions.py` → session end (was previously untested)
- Path-shape routing (404s); unknown session → `ended: false`; already-ended idempotent
- Explicit duration stored; duration computed from `login_at` when absent; bad `login_at` → 0
- `total_seconds` accumulated on the user; accumulation failure doesn't fail the request

### `routes/test_translate.py` → AI translation
- Auth required; 503 unconfigured; invalid/missing sentences → 400
- Default targets = non-empty transcripts; explicit targets filtered (range/type/empty); none valid → 400; non-dict sentence entries tolerated
- Batching over `MAX_TARGETS_PER_CALL`; full transcript sent as context; values trimmed
- 502 on network error and malformed model output; bare-map responses accepted; unrequested indices dropped
- `_openai_chat`: request URL/auth/model/response_format/timeout + response parsing; `_api_key` prefers SSM param

### `shared/test_auth.py` — JWT create/decode roundtrip, SSM vs env secret, header parsing (case, scheme), garbage/expired/forged tokens, `require_user`/`require_admin` guard matrix
### `shared/test_db.py` — table name defaults, lazy+cached resource, `table()` delegation
### `shared/test_response.py` — `ok`/`fail` shapes, statuses, Decimal encoding, encoder TypeError
### `shared/test_secrets.py` — SSM fetch, per-param caching, lazy client

## Frontend

### `api/client.test.js` → `api/client.js`
- URL prefixing, methods, JSON bodies, Content-Type; bearer header from localStorage (and omitted without); parsed success payloads; thrown errors carry message/status/data; fallback message; non-JSON error body survived
- Session expiry: 401 with a stored token clears token/user/session_id/session_start and redirects to `/login`; no redirect for `/auth/*` 401s (wrong OTP), tokenless 401s, or non-401 errors

### `contexts/AuthContext.test.jsx`
- Anonymous start; restore from storage; corrupt storage cleared; login persists token/user/session bookkeeping; logout clears + beacons session end; beacon skipped without session; `beforeunload` beacon (with and without session)

### `App.test.jsx` — route guards
- Anonymous → login (from `/` and private pages); authenticated → practice; login page redirects authed users; unknown paths redirect; about reachable

### `components/Layout.test.jsx`
- Brand/nav/email/outlet render; Admin link only for admins; sign out logs out and lands on /login

### `components/LessonCard.test.jsx`
- Title/count; progress % + bar visibility rules (none / partial / complete); pulled feedback; practice-count star + badge; card → practice navigation; owner-only edit button navigating to editor (with stopPropagation); zero sentence_count safe

### `components/DictationTab.test.jsx`
- Position display + initialSentence; correct answers (exact, case/punctuation-insensitive, apostrophe/hyphen normalization); translation shown on success; wrong/missing/extra hint types with original-token hints; hint cleared on typing; advance + progress callbacks; last-sentence completion (`onProgress(idx, true)` + `onComplete`); Ctrl replay and replay button; empty sentence list renders nothing

### `components/TranscriptTab.test.jsx`
- Sentence list with timestamps/translations; play/pause toggling via media events; click-to-seek in full-audio mode; jump-to input (parse, clamp, invalid); sentence mode: toggle on/off, counter, prev/next bounds, entry at current playback position, click-to-play a sentence, auto-advance at sentence end, pause after last sentence

### `pages/Login.test.jsx`
- Email step; OTP request with normalized email; server errors on both steps; verification → login storage + navigate; change-email reset

### `pages/Practice.test.jsx`
- Loading spinner; error state; empty state; my + grouped community lessons; pulled badge passthrough; new-lesson navigation

### `pages/About.test.jsx`
- Loading; empty placeholder; HTML content rendering; fetch-failure fallback

### `pages/PracticeSession.test.jsx`
- Lesson load + default dictation tab; load error; transcript tab switch; empty-sentence notice; resume from saved progress; completion saves progress (`current_sentence: 0`, `increment_practice: true`) and shows trophy; practice-again restart; back-to-lessons navigation

### `pages/AdminPanel.test.jsx`
- Non-admin redirect; lessons tab sections, pull modal (feedback gate, PUT, optimistic move, cancel), restore; users tab list/badges/duration formatting, search filter, expand loads sessions+lessons; about tab load/save/preview

### `pages/CreateLesson.test.jsx`
- Initial row; add sentence seeds start from previous end; end-time propagation to empty next start; remove row; reset; title/audio validation; translate-all (no candidates, success mapping, backend error), per-sentence translate (disabled gate, success); create flow with file upload (upload-url body, S3 PUT, lesson POST payload); backend error surfaced; edit mode load (fields, buttons); save-without-retrim when bounds unchanged (PUT payload, no upload-url call)
