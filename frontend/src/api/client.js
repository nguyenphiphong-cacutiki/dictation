const BASE = import.meta.env.VITE_API_URL || '/api'

async function request(method, path, body) {
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // An expired or invalidated token means the session is dead — clear it and
    // send the user back to login instead of letting every call fail with 401.
    // Auth endpoints are excluded: a wrong OTP is a normal 401, not a dead session.
    if (res.status === 401 && token && !path.startsWith('/auth/')) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('session_id')
      localStorage.removeItem('session_start')
      window.location.assign('/login')
    }
    throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data })
  }
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path, body) => request('DELETE', path, body),
}
