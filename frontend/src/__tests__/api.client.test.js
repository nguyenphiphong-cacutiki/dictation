import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// api/client.js uses import.meta.env and localStorage — jsdom provides both
// We need to mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Re-import after stub so the module picks up the stubbed fetch
const { api } = await import('../api/client.js')

function makeResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  }
}

beforeEach(() => {
  localStorage.clear()
  mockFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('api.get', () => {
  it('sends a GET request to the correct path', async () => {
    mockFetch.mockResolvedValue(makeResponse({ lessons: [] }))
    await api.get('/lessons')
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/lessons')
    expect(opts.method).toBe('GET')
  })

  it('does not include Authorization header when no token', async () => {
    mockFetch.mockResolvedValue(makeResponse({}))
    await api.get('/lessons')
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers['Authorization']).toBeUndefined()
  })

  it('includes Bearer token from localStorage', async () => {
    localStorage.setItem('token', 'my-jwt')
    mockFetch.mockResolvedValue(makeResponse({}))
    await api.get('/lessons')
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers['Authorization']).toBe('Bearer my-jwt')
  })

  it('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValue(makeResponse({ count: 3 }))
    const data = await api.get('/lessons')
    expect(data).toEqual({ count: 3 })
  })
})

describe('api.post', () => {
  it('sends a POST with JSON body', async () => {
    mockFetch.mockResolvedValue(makeResponse({ ok: true }))
    await api.post('/auth/request-otp', { email: 'x@x.com' })
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ email: 'x@x.com' })
  })

  it('sets Content-Type to application/json', async () => {
    mockFetch.mockResolvedValue(makeResponse({}))
    await api.post('/auth/request-otp', {})
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers['Content-Type']).toBe('application/json')
  })
})

describe('api.put', () => {
  it('sends a PUT with JSON body', async () => {
    mockFetch.mockResolvedValue(makeResponse({}))
    await api.put('/progress/lid-1', { current_sentence: 3 })
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ current_sentence: 3 })
  })
})

describe('api.delete', () => {
  it('sends a DELETE without a body', async () => {
    mockFetch.mockResolvedValue(makeResponse({ deleted: true }))
    await api.delete('/lessons/lid-1')
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe('DELETE')
    expect(opts.body).toBeUndefined()
  })
})

describe('error handling', () => {
  it('throws on non-ok response with error message from body', async () => {
    mockFetch.mockResolvedValue(makeResponse({ error: 'Not found' }, false, 404))
    await expect(api.get('/lessons/bad')).rejects.toMatchObject({
      message: 'Not found',
      status: 404,
    })
  })

  it('throws with fallback message when body has no error field', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, false, 500))
    await expect(api.get('/broken')).rejects.toMatchObject({
      message: 'Request failed',
    })
  })

  it('attaches data to thrown error', async () => {
    mockFetch.mockResolvedValue(makeResponse({ error: 'Unauthorized', hint: 'login' }, false, 401))
    await expect(api.post('/secure', {})).rejects.toMatchObject({
      data: { error: 'Unauthorized', hint: 'login' },
    })
  })
})
