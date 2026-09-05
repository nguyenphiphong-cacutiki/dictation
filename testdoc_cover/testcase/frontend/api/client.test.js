// Covers frontend/src/api/client.js — request building, auth header, errors.
import { api } from '@src/api/client.js'
import { jsonRes } from '../helpers.jsx'

let mockFetch

beforeEach(() => {
  mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)
})

describe('request building', () => {
  it('GET hits /api-prefixed path with no body', async () => {
    mockFetch.mockResolvedValue(jsonRes({}))
    await api.get('/lessons')
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/lessons')
    expect(opts.method).toBe('GET')
    expect(opts.body).toBeUndefined()
  })

  it('POST serializes the JSON body', async () => {
    mockFetch.mockResolvedValue(jsonRes({}))
    await api.post('/auth/request-otp', { email: 'a@b.com' })
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ email: 'a@b.com' })
    expect(opts.headers['Content-Type']).toBe('application/json')
  })

  it('PUT serializes the JSON body', async () => {
    mockFetch.mockResolvedValue(jsonRes({}))
    await api.put('/progress/l1', { current_sentence: 2 })
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ current_sentence: 2 })
  })

  it('DELETE can carry a body', async () => {
    mockFetch.mockResolvedValue(jsonRes({}))
    await api.delete('/audio', { audio_key: 'k' })
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe('DELETE')
    expect(JSON.parse(opts.body)).toEqual({ audio_key: 'k' })
  })
})

describe('authorization header', () => {
  it('is omitted when no token is stored', async () => {
    mockFetch.mockResolvedValue(jsonRes({}))
    await api.get('/lessons')
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('carries the stored bearer token', async () => {
    localStorage.setItem('token', 'jwt-123')
    mockFetch.mockResolvedValue(jsonRes({}))
    await api.get('/lessons')
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-123')
  })
})

describe('responses and errors', () => {
  it('resolves with the parsed JSON payload', async () => {
    mockFetch.mockResolvedValue(jsonRes({ my_lessons: [1] }))
    await expect(api.get('/lessons')).resolves.toEqual({ my_lessons: [1] })
  })

  it('throws with server error message, status and data', async () => {
    mockFetch.mockResolvedValue(jsonRes({ error: 'Lesson not found' }, false, 404))
    await expect(api.get('/lessons/x')).rejects.toMatchObject({
      message: 'Lesson not found',
      status: 404,
      data: { error: 'Lesson not found' },
    })
  })

  it('falls back to a generic message when the error body is empty', async () => {
    mockFetch.mockResolvedValue(jsonRes({}, false, 500))
    await expect(api.get('/x')).rejects.toMatchObject({ message: 'Request failed' })
  })

  it('survives a non-JSON error response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502, json: () => Promise.reject(new Error('bad json')) })
    await expect(api.get('/x')).rejects.toMatchObject({ message: 'Request failed', status: 502 })
  })
})

describe('session expiry (401 handling)', () => {
  let assign

  beforeEach(() => {
    assign = vi.fn()
    vi.stubGlobal('location', { assign })
  })

  it('clears the stored session and redirects to /login on a 401 with a token', async () => {
    localStorage.setItem('token', 'stale-jwt')
    localStorage.setItem('user', '{"user_id":"u1"}')
    localStorage.setItem('session_id', 's1')
    localStorage.setItem('session_start', '123')
    mockFetch.mockResolvedValue(jsonRes({ error: 'Unauthorized' }, false, 401))

    await expect(api.get('/lessons')).rejects.toMatchObject({ status: 401 })
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('session_id')).toBeNull()
    expect(localStorage.getItem('session_start')).toBeNull()
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('does not redirect on a 401 from an /auth/ endpoint (e.g. wrong OTP)', async () => {
    localStorage.setItem('token', 'jwt')
    mockFetch.mockResolvedValue(jsonRes({ error: 'Invalid code' }, false, 401))

    await expect(api.post('/auth/verify-otp', { code: '000000' })).rejects.toMatchObject({ status: 401 })
    expect(localStorage.getItem('token')).toBe('jwt')
    expect(assign).not.toHaveBeenCalled()
  })

  it('does not redirect on a 401 when no token was sent', async () => {
    mockFetch.mockResolvedValue(jsonRes({ error: 'Unauthorized' }, false, 401))

    await expect(api.get('/lessons')).rejects.toMatchObject({ status: 401 })
    expect(assign).not.toHaveBeenCalled()
  })

  it('does not touch the session on non-401 errors', async () => {
    localStorage.setItem('token', 'jwt')
    mockFetch.mockResolvedValue(jsonRes({ error: 'Forbidden' }, false, 403))

    await expect(api.get('/admin/users')).rejects.toMatchObject({ status: 403 })
    expect(localStorage.getItem('token')).toBe('jwt')
    expect(assign).not.toHaveBeenCalled()
  })
})
