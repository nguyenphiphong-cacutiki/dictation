// Covers frontend/src/pages/AdminPanel.jsx — access gating and the three tabs.
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@src/contexts/AuthContext'
import AdminPanel from '@src/pages/AdminPanel'
import { bodyOf, fetchCall, jsonRes, seedUser, stubFetch } from '../helpers.jsx'

// Mimics App's PrivateRoute: don't mount the page until auth has restored,
// otherwise AdminPanel sees user=null and immediately redirects.
function Gate({ children }) {
  const { loading } = useAuth()
  return loading ? null : children
}

const lessons = [
  { lesson_id: 'l1', title: 'Good lesson', owner_email: 'a@x.com', sentence_count: 3, status: 'published' },
  { lesson_id: 'l2', title: 'Bad lesson', owner_email: 'b@x.com', sentence_count: 5, status: 'pulled', admin_feedback: 'Broken audio' },
]

const users = [
  { user_id: 'u1', email: 'alice@x.com', is_admin: true, created_at: '2026-01-01T00:00:00Z', total_seconds: 3700 },
  { user_id: 'u2', email: 'bob@x.com', is_admin: false, created_at: '2026-01-02T00:00:00Z', total_seconds: 65 },
]

function defaultRoute(url, opts = {}) {
  if (url.includes('/admin/lessons') && (!opts.method || opts.method === 'GET')) {
    return jsonRes({ lessons })
  }
  if (url.includes('/pull') || url.includes('/restore')) return jsonRes({ ok: true })
  if (url.match(/\/admin\/users\/[^/]+\/sessions/)) {
    return jsonRes({ sessions: [{ session_id: 's1', login_at: '2026-01-01T08:00:00Z', logout_at: null, duration_seconds: 120 }] })
  }
  if (url.match(/\/admin\/users\/[^/]+\/lessons/)) {
    return jsonRes({ lessons: [{ lesson_id: 'l9', title: 'User lesson', sentence_count: 2, status: 'published' }] })
  }
  if (url.includes('/admin/users')) return jsonRes({ users })
  if (url.includes('/admin/about')) return jsonRes({ saved: true })
  if (url.includes('/about')) return jsonRes({ content: '<p>About us</p>' })
  return jsonRes({})
}

function renderAdmin(route = defaultRoute, user) {
  seedUser(user || { user_id: 'a1', email: 'admin@x.com', is_admin: true })
  const mockFetch = stubFetch(route)
  const utils = render(
    <MemoryRouter initialEntries={['/admin']}>
      <AuthProvider>
        <Routes>
          <Route path="/admin" element={<Gate><AdminPanel /></Gate>} />
          <Route path="/practice" element={<div>PRACTICE-PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
  return { ...utils, mockFetch }
}

it('redirects non-admin users to practice', async () => {
  renderAdmin(defaultRoute, { user_id: 'u1', email: 'u@x.com', is_admin: false })
  expect(await screen.findByText('PRACTICE-PAGE')).toBeInTheDocument()
})

describe('lessons tab', () => {
  it('splits lessons into published and pulled sections', async () => {
    renderAdmin()
    expect(await screen.findByText('Good lesson')).toBeInTheDocument()
    expect(screen.getByText('Published Lessons (1)')).toBeInTheDocument()
    expect(screen.getByText('Pulled Lessons (1)')).toBeInTheDocument()
    expect(screen.getByText('Bad lesson')).toBeInTheDocument()
    expect(screen.getByText('Feedback: Broken audio')).toBeInTheDocument()
  })

  it('pulling a lesson requires feedback and moves it to pulled', async () => {
    const { mockFetch } = renderAdmin()
    fireEvent.click(await screen.findByText('Pull'))

    const confirmBtn = screen.getByText('Pull Lesson')
    expect(confirmBtn).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText(/Timestamps are incorrect/), {
      target: { value: 'Wrong timing' },
    })
    expect(confirmBtn).not.toBeDisabled()
    fireEvent.click(confirmBtn)

    await waitFor(() => expect(screen.getByText('Published Lessons (0)')).toBeInTheDocument())
    expect(screen.getByText('Pulled Lessons (2)')).toBeInTheDocument()
    const call = fetchCall(mockFetch, '/admin/lessons/l1/pull')
    expect(call[1].method).toBe('PUT')
    expect(bodyOf(call)).toEqual({ feedback: 'Wrong timing' })
  })

  it('cancel closes the pull modal without a request', async () => {
    const { mockFetch } = renderAdmin()
    fireEvent.click(await screen.findByText('Pull'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Pull Lesson')).not.toBeInTheDocument()
    expect(fetchCall(mockFetch, '/pull')).toBeUndefined()
  })

  it('restoring a pulled lesson republishes it', async () => {
    const { mockFetch } = renderAdmin()
    fireEvent.click(await screen.findByText('Restore'))
    await waitFor(() => expect(screen.getByText('Published Lessons (2)')).toBeInTheDocument())
    expect(screen.getByText('Pulled Lessons (0)')).toBeInTheDocument()
    expect(fetchCall(mockFetch, '/admin/lessons/l2/restore')[1].method).toBe('PUT')
  })
})

describe('users tab', () => {
  it('lists users with admin badge and formatted totals', async () => {
    renderAdmin()
    fireEvent.click(screen.getByText('Users'))
    expect(await screen.findByText('alice@x.com')).toBeInTheDocument()
    expect(screen.getByText('bob@x.com')).toBeInTheDocument()
    expect(screen.getByText('Admin', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Total: 1h 1m')).toBeInTheDocument()
    expect(screen.getByText('Total: 1m 5s')).toBeInTheDocument()
    expect(screen.getByText('2 users')).toBeInTheDocument()
  })

  it('filters users by email search', async () => {
    renderAdmin()
    fireEvent.click(screen.getByText('Users'))
    await screen.findByText('alice@x.com')
    fireEvent.change(screen.getByPlaceholderText('Search by email…'), { target: { value: 'BOB' } })
    expect(screen.queryByText('alice@x.com')).not.toBeInTheDocument()
    expect(screen.getByText('bob@x.com')).toBeInTheDocument()
    expect(screen.getByText('1 user')).toBeInTheDocument()
  })

  it('expanding a user loads their sessions and lessons', async () => {
    const { mockFetch } = renderAdmin()
    fireEvent.click(screen.getByText('Users'))
    fireEvent.click(await screen.findByText('bob@x.com'))

    expect(await screen.findByText('Sessions (1)')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText('Lessons (1)')).toBeInTheDocument()
    expect(screen.getByText('User lesson')).toBeInTheDocument()
    expect(fetchCall(mockFetch, '/admin/users/u2/sessions')).toBeTruthy()
    expect(fetchCall(mockFetch, '/admin/users/u2/lessons')).toBeTruthy()
  })
})

describe('about tab', () => {
  it('loads the current content into the editor', async () => {
    renderAdmin()
    fireEvent.click(screen.getByText('About'))
    expect(await screen.findByDisplayValue('<p>About us</p>')).toBeInTheDocument()
  })

  it('saves edited content', async () => {
    const { mockFetch } = renderAdmin()
    fireEvent.click(screen.getByText('About'))
    const editor = await screen.findByDisplayValue('<p>About us</p>')
    fireEvent.change(editor, { target: { value: '<p>New content</p>' } })
    fireEvent.click(screen.getByText('Save'))

    expect(await screen.findByText('Saved!')).toBeInTheDocument()
    const call = fetchCall(mockFetch, '/admin/about')
    expect(call[1].method).toBe('PUT')
    expect(bodyOf(call)).toEqual({ content: '<p>New content</p>' })
  })

  it('preview renders the HTML content', async () => {
    renderAdmin()
    fireEvent.click(screen.getByText('About'))
    await screen.findByDisplayValue('<p>About us</p>')
    fireEvent.click(screen.getByText('Preview'))
    expect(screen.getByText('About us')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })
})
