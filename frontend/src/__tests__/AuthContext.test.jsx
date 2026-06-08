import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '../contexts/AuthContext.jsx'

function TestConsumer() {
  const { user, loading, login, logout } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? JSON.stringify(user) : 'null'}</span>
      <button onClick={() => login('tok', { user_id: 'uid-1', email: 'u@u.com', is_admin: false })}>
        login
      </button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('AuthProvider initial state', () => {
  it('starts with loading=false after mount', async () => {
    renderWithAuth()
    // loading flips to false after useEffect
    await act(async () => {})
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })

  it('user is null when no token in localStorage', async () => {
    renderWithAuth()
    await act(async () => {})
    expect(screen.getByTestId('user').textContent).toBe('null')
  })

  it('restores user from localStorage on mount', async () => {
    localStorage.setItem('token', 'existing-token')
    localStorage.setItem('user', JSON.stringify({ user_id: 'uid-99', email: 'stored@u.com' }))
    renderWithAuth()
    await act(async () => {})
    const user = JSON.parse(screen.getByTestId('user').textContent)
    expect(user.user_id).toBe('uid-99')
  })

  it('clears storage on invalid JSON user value', async () => {
    localStorage.setItem('token', 'tok')
    localStorage.setItem('user', 'not-json{{')
    renderWithAuth()
    await act(async () => {})
    expect(screen.getByTestId('user').textContent).toBe('null')
    expect(localStorage.getItem('token')).toBeNull()
  })
})

describe('login', () => {
  it('sets user state', async () => {
    renderWithAuth()
    await act(async () => {})

    await act(async () => {
      screen.getByText('login').click()
    })

    const user = JSON.parse(screen.getByTestId('user').textContent)
    expect(user.user_id).toBe('uid-1')
  })

  it('stores token and user in localStorage', async () => {
    renderWithAuth()
    await act(async () => {})

    await act(async () => {
      screen.getByText('login').click()
    })

    expect(localStorage.getItem('token')).toBe('tok')
    expect(JSON.parse(localStorage.getItem('user')).email).toBe('u@u.com')
  })
})

describe('logout', () => {
  it('clears user state', async () => {
    localStorage.setItem('token', 'tok')
    localStorage.setItem('user', JSON.stringify({ user_id: 'uid-1' }))
    renderWithAuth()
    await act(async () => {})

    await act(async () => {
      screen.getByText('logout').click()
    })

    expect(screen.getByTestId('user').textContent).toBe('null')
  })

  it('removes token and user from localStorage', async () => {
    localStorage.setItem('token', 'tok')
    localStorage.setItem('user', JSON.stringify({ user_id: 'uid-1' }))
    renderWithAuth()
    await act(async () => {})

    await act(async () => {
      screen.getByText('logout').click()
    })

    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
  })
})
