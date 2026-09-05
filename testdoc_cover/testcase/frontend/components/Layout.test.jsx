// Covers frontend/src/components/Layout.jsx — nav, admin link gating, sign out.
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Layout from '@src/components/Layout'
import { AuthProvider } from '@src/contexts/AuthContext'
import { seedUser } from '../helpers.jsx'

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>LOGIN-PAGE</div>} />
          <Route element={<Layout />}>
            <Route index element={<div>OUTLET-CONTENT</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

it('shows brand, nav links, user email and outlet content', () => {
  seedUser({ user_id: 'u1', email: 'me@x.com', is_admin: false })
  renderLayout()
  expect(screen.getByText('Daily Dictation')).toBeInTheDocument()
  expect(screen.getByText('Practice')).toBeInTheDocument()
  expect(screen.getByText('Create Lesson')).toBeInTheDocument()
  expect(screen.getByText('About')).toBeInTheDocument()
  expect(screen.getByText('me@x.com')).toBeInTheDocument()
  expect(screen.getByText('OUTLET-CONTENT')).toBeInTheDocument()
})

it('hides the Admin link from regular users', () => {
  seedUser({ user_id: 'u1', email: 'me@x.com', is_admin: false })
  renderLayout()
  expect(screen.queryByText('Admin')).not.toBeInTheDocument()
})

it('shows the Admin link to admins', () => {
  seedUser({ user_id: 'a1', email: 'admin@x.com', is_admin: true })
  renderLayout()
  expect(screen.getByText('Admin')).toBeInTheDocument()
})

it('sign out logs the user out and navigates to /login', () => {
  seedUser()
  renderLayout()
  fireEvent.click(screen.getByText('Sign out'))
  expect(screen.getByText('LOGIN-PAGE')).toBeInTheDocument()
  expect(localStorage.getItem('token')).toBeNull()
})
