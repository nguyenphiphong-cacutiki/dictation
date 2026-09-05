// Covers frontend/src/contexts/AuthContext.jsx — session restore, login/logout,
// and the session-end beacon.
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { AuthProvider, useAuth } from '@src/contexts/AuthContext'
import { seedUser } from '../helpers.jsx'

function Probe() {
  const { user, loading, login, logout } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="email">{user ? user.email : 'anonymous'}</span>
      <button onClick={() => login('tok-1', { user_id: 'u9', email: 'new@x.com' }, 'sess-9')}>
        do-login
      </button>
      <button onClick={logout}>do-logout</button>
    </div>
  )
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  )
}

it('starts anonymous when nothing is stored', () => {
  renderProbe()
  expect(screen.getByTestId('email')).toHaveTextContent('anonymous')
  expect(screen.getByTestId('loading')).toHaveTextContent('false')
})

it('restores the stored user', () => {
  seedUser({ user_id: 'u1', email: 'stored@x.com', is_admin: false })
  renderProbe()
  expect(screen.getByTestId('email')).toHaveTextContent('stored@x.com')
})

it('clears corrupt stored user data', () => {
  localStorage.setItem('token', 't')
  localStorage.setItem('user', '{not json')
  renderProbe()
  expect(screen.getByTestId('email')).toHaveTextContent('anonymous')
  expect(localStorage.getItem('token')).toBeNull()
  expect(localStorage.getItem('user')).toBeNull()
})

it('login stores credentials and session bookkeeping', () => {
  renderProbe()
  fireEvent.click(screen.getByText('do-login'))
  expect(screen.getByTestId('email')).toHaveTextContent('new@x.com')
  expect(localStorage.getItem('token')).toBe('tok-1')
  expect(JSON.parse(localStorage.getItem('user')).user_id).toBe('u9')
  expect(localStorage.getItem('session_id')).toBe('sess-9')
  expect(Number(localStorage.getItem('session_start'))).toBeGreaterThan(0)
})

it('logout clears storage and beacons the session end', () => {
  const beacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
  renderProbe()
  fireEvent.click(screen.getByText('do-login'))
  fireEvent.click(screen.getByText('do-logout'))

  expect(screen.getByTestId('email')).toHaveTextContent('anonymous')
  expect(localStorage.getItem('token')).toBeNull()
  expect(localStorage.getItem('session_id')).toBeNull()
  expect(beacon).toHaveBeenCalledTimes(1)
  expect(beacon.mock.calls[0][0]).toBe('/api/sessions/sess-9/end')
})

it('logout without a session does not beacon', () => {
  const beacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
  seedUser()
  renderProbe()
  fireEvent.click(screen.getByText('do-logout'))
  expect(beacon).not.toHaveBeenCalled()
})

it('beforeunload beacons the active session', () => {
  const beacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
  renderProbe()
  fireEvent.click(screen.getByText('do-login'))
  window.dispatchEvent(new Event('beforeunload'))
  expect(beacon).toHaveBeenCalledTimes(1)
  expect(beacon.mock.calls[0][0]).toBe('/api/sessions/sess-9/end')
})

it('beforeunload without a session is a no-op', () => {
  const beacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
  renderProbe()
  window.dispatchEvent(new Event('beforeunload'))
  expect(beacon).not.toHaveBeenCalled()
})
