// Covers frontend/src/pages/Practice.jsx — lesson list, empty/error states.
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Practice from '@src/pages/Practice'
import { jsonRes, stubFetch } from '../helpers.jsx'

function renderPractice() {
  return render(
    <MemoryRouter initialEntries={['/practice']}>
      <Routes>
        <Route path="/practice" element={<Practice />} />
        <Route path="/create" element={<div>CREATE-PAGE</div>} />
        <Route path="/practice/:id" element={<div>SESSION-PAGE</div>} />
      </Routes>
    </MemoryRouter>
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
