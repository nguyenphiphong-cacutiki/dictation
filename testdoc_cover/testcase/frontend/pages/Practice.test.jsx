// Covers frontend/src/pages/Practice.jsx — lesson list, empty/error states,
// and lesson deletion (owner / admin).
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Practice from '@src/pages/Practice'
import { AuthProvider } from '@src/contexts/AuthContext'
import { fetchCall, jsonRes, seedUser, stubFetch } from '../helpers.jsx'

function renderPractice() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/practice']}>
        <Routes>
          <Route path="/practice" element={<Practice />} />
          <Route path="/create" element={<div>CREATE-PAGE</div>} />
          <Route path="/practice/:id" element={<div>SESSION-PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  )
}

const lesson = (id, title) => ({
  lesson_id: id,
  title,
  sentence_count: 3,
  status: 'published',
  admin_feedback: '',
  owner_email: 'o@x.com',
  created_at: '2026-01-01',
})

it('shows a spinner while loading', () => {
  stubFetch(() => new Promise(() => {})) // never resolves
  const { container } = renderPractice()
  expect(container.querySelector('.animate-spin')).toBeInTheDocument()
})

it('shows the error message when the request fails', async () => {
  stubFetch(() => jsonRes({ error: 'Server exploded' }, false, 500))
  renderPractice()
  expect(await screen.findByText('Server exploded')).toBeInTheDocument()
})

it('shows an empty state when the user has no lessons', async () => {
  stubFetch(() => jsonRes({ my_lessons: [], community: [] }))
  renderPractice()
  expect(await screen.findByText(/No lessons yet/)).toBeInTheDocument()
  expect(screen.queryByText('Community Lessons')).not.toBeInTheDocument()
})

it('renders my lessons and grouped community lessons', async () => {
  stubFetch(() => jsonRes({
    my_lessons: [{ ...lesson('l1', 'Mine 1') }],
    community: [
      { owner_email: 'alice@x.com', lessons: [lesson('l2', 'Alice lesson')] },
      { owner_email: 'bob@x.com', lessons: [lesson('l3', 'Bob lesson')] },
    ],
  }))
  renderPractice()
  expect(await screen.findByText('Mine 1')).toBeInTheDocument()
  expect(screen.getByText('Community Lessons')).toBeInTheDocument()
  expect(screen.getByText('alice@x.com')).toBeInTheDocument()
  expect(screen.getByText('Alice lesson')).toBeInTheDocument()
  expect(screen.getByText('bob@x.com')).toBeInTheDocument()
  expect(screen.getByText('Bob lesson')).toBeInTheDocument()
})

it('marks my pulled lessons on their card', async () => {
  stubFetch(() => jsonRes({
    my_lessons: [{ ...lesson('l1', 'Pulled one'), status: 'pulled', admin_feedback: 'Fix audio' }],
    community: [],
  }))
  renderPractice()
  expect(await screen.findByText('Admin: Fix audio')).toBeInTheDocument()
})

it('navigates to the lesson editor from the new lesson button', async () => {
  stubFetch(() => jsonRes({ my_lessons: [], community: [] }))
  renderPractice()
  fireEvent.click(await screen.findByText('+ New Lesson'))
  expect(screen.getByText('CREATE-PAGE')).toBeInTheDocument()
})

// ── Lesson deletion ───────────────────────────────────────────────────────────

const listWithLessons = () => ({
  my_lessons: [lesson('l1', 'Mine 1')],
  community: [{ owner_email: 'alice@x.com', lessons: [lesson('l2', 'Alice lesson')] }],
})

it('deletes my lesson after confirmation and removes its card', async () => {
  const mockFetch = stubFetch((url, opts = {}) =>
    opts.method === 'DELETE' ? jsonRes({ deleted: true }) : jsonRes(listWithLessons())
  )
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderPractice()
  await screen.findByText('Mine 1')

  fireEvent.click(screen.getByTitle('Delete lesson'))
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Mine 1'))

  const del = fetchCall(mockFetch, '/lessons/l1')
  expect(del[1].method).toBe('DELETE')
  expect(await screen.findByText(/No lessons yet/)).toBeInTheDocument()
  expect(screen.queryByText('Mine 1')).not.toBeInTheDocument()
})

it('does not delete when the confirmation is dismissed', async () => {
  const mockFetch = stubFetch(() => jsonRes(listWithLessons()))
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  renderPractice()
  await screen.findByText('Mine 1')

  fireEvent.click(screen.getByTitle('Delete lesson'))
  expect(mockFetch.mock.calls.some(([, opts]) => opts?.method === 'DELETE')).toBe(false)
  expect(screen.getByText('Mine 1')).toBeInTheDocument()
})

it('shows the backend error when deletion fails', async () => {
  stubFetch((url, opts = {}) =>
    opts.method === 'DELETE'
      ? jsonRes({ error: 'Forbidden' }, false, 403)
      : jsonRes(listWithLessons())
  )
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderPractice()
  await screen.findByText('Mine 1')

  fireEvent.click(screen.getByTitle('Delete lesson'))
  expect(await screen.findByText('Forbidden')).toBeInTheDocument()
})

it('hides the delete button on community lessons for regular users', async () => {
  seedUser({ user_id: 'u1', email: 'u@x.com', is_admin: false })
  stubFetch(() => jsonRes(listWithLessons()))
  renderPractice()
  await screen.findByText('Alice lesson')
  // Only my own card has a delete button
  expect(screen.getAllByTitle('Delete lesson')).toHaveLength(1)
})

it('lets an admin delete a community lesson and drops the empty owner group', async () => {
  seedUser({ user_id: 'adm', email: 'admin@x.com', is_admin: true })
  const mockFetch = stubFetch((url, opts = {}) =>
    opts.method === 'DELETE' ? jsonRes({ deleted: true }) : jsonRes(listWithLessons())
  )
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderPractice()
  await screen.findByText('Alice lesson')

  expect(screen.getAllByTitle('Delete lesson')).toHaveLength(2) // mine + community
  fireEvent.click(screen.getAllByTitle('Delete lesson')[1])

  const del = fetchCall(mockFetch, '/lessons/l2')
  expect(del[1].method).toBe('DELETE')
  await waitFor(() => {
    expect(screen.queryByText('Alice lesson')).not.toBeInTheDocument()
  })
  // The now-empty owner group disappears entirely
  expect(screen.queryByText('alice@x.com')).not.toBeInTheDocument()
  expect(screen.queryByText('Community Lessons')).not.toBeInTheDocument()
})
