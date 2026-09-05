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
