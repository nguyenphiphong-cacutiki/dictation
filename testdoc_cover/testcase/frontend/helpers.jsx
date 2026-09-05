// Shared helpers for the testdoc_cover frontend suite. All network traffic is
// faked through a stubbed global fetch — nothing runs online.
import React from 'react'

export function jsonRes(body, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) }
}

/**
 * Stub global fetch with a router function: (url, opts) => response.
 * Returns the mock so tests can inspect calls.
 */
export function stubFetch(route) {
  const fn = vi.fn((url, opts = {}) => Promise.resolve(route(String(url), opts)))
  vi.stubGlobal('fetch', fn)
  return fn
}

/** Seed localStorage the way a real login would, so AuthProvider restores it. */
export function seedUser(user = { user_id: 'u1', email: 'u@x.com', is_admin: false }) {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify(user))
  return user
}

/** Find the fetch call whose URL contains `part`; returns [url, opts]. */
export function fetchCall(fetchMock, part) {
  return fetchMock.mock.calls.find(([url]) => String(url).includes(part))
}

export function bodyOf(call) {
  return JSON.parse(call[1].body)
}
