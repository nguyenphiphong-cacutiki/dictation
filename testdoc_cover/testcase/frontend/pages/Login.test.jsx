// Covers frontend/src/pages/Login.jsx — the two-step OTP login flow.
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@src/contexts/AuthContext'
import Login from '@src/pages/Login'
import { bodyOf, fetchCall, jsonRes, stubFetch } from '../helpers.jsx'

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/practice" element={<div>PRACTICE-PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

async function requestOtp(email = 'Me@Example.COM') {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: email } })
  fireEvent.click(screen.getByText('Send OTP'))
  await screen.findByText(/We sent a 6-digit code/)
}

it('renders the email step first', () => {
  renderLogin()
  expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
  expect(screen.getByText('Send OTP')).toBeInTheDocument()
})

it('requests an OTP with a normalized email and advances to the code step', async () => {
  const mockFetch = stubFetch(() => jsonRes({ message: 'OTP sent' }))
  renderLogin()
  await requestOtp('  Me@Example.COM ')

  const call = fetchCall(mockFetch, '/auth/request-otp')
  expect(bodyOf(call)).toEqual({ email: 'me@example.com' })
  expect(screen.getByPlaceholderText('123456')).toBeInTheDocument()
})

it('shows the server error when the OTP request fails', async () => {
  stubFetch(() => jsonRes({ error: 'Invalid email' }, false, 400))
  renderLogin()
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'x@y.com' } })
  fireEvent.click(screen.getByText('Send OTP'))
  expect(await screen.findByText('Invalid email')).toBeInTheDocument()
  // still on the email step
  expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
})

it('verifies the OTP, logs in and navigates to practice', async () => {
  const mockFetch = stubFetch((url) => {
    if (url.includes('/auth/verify-otp')) {
      return jsonRes({
        token: 'jwt-1',
        session_id: 'sess-1',
        user: { user_id: 'u1', email: 'me@example.com', is_admin: false },
      })
    }
    return jsonRes({ message: 'OTP sent' })
  })
  renderLogin()
  await requestOtp()

  fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } })
  fireEvent.click(screen.getByText('Sign in'))

  await screen.findByText('PRACTICE-PAGE')
  expect(bodyOf(fetchCall(mockFetch, '/auth/verify-otp'))).toEqual({
    email: 'me@example.com',
    code: '123456',
  })
  expect(localStorage.getItem('token')).toBe('jwt-1')
  expect(localStorage.getItem('session_id')).toBe('sess-1')
})

it('shows the server error when verification fails', async () => {
  stubFetch((url) =>
    url.includes('/auth/verify-otp')
      ? jsonRes({ error: 'Invalid OTP' }, false, 401)
      : jsonRes({ message: 'OTP sent' })
  )
  renderLogin()
  await requestOtp()
  fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '000000' } })
  fireEvent.click(screen.getByText('Sign in'))
  expect(await screen.findByText('Invalid OTP')).toBeInTheDocument()
})

it('change email returns to the first step and clears state', async () => {
  stubFetch(() => jsonRes({ message: 'OTP sent' }))
  renderLogin()
  await requestOtp()
  fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '111' } })
  fireEvent.click(screen.getByText('Change email'))
  await waitFor(() =>
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
  )
})
