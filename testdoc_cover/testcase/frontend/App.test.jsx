// Covers frontend/src/App.jsx — route guards and redirects.
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@src/App'
import { jsonRes, seedUser, stubFetch } from './helpers.jsx'

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
}

beforeEach(() => {
  stubFetch((url) => {
    if (url.includes('/lessons')) return jsonRes({ my_lessons: [], community: [] })
    if (url.includes('/about')) return jsonRes({ content: '' })
    return jsonRes({})
  })
})

it('sends anonymous visitors to the login page', async () => {
  renderApp('/')
  expect(await screen.findByText('Send OTP')).toBeInTheDocument()
})

it('keeps anonymous visitors out of private pages', async () => {
  renderApp('/practice')
  expect(await screen.findByText('Send OTP')).toBeInTheDocument()
})

it('routes authenticated users to practice by default', async () => {
  seedUser()
  renderApp('/')
  expect(await screen.findByText('My Lessons')).toBeInTheDocument()
})

it('redirects authenticated users away from the login page', async () => {
  seedUser()
  renderApp('/login')
  expect(await screen.findByText('My Lessons')).toBeInTheDocument()
})

it('redirects unknown paths to practice', async () => {
  seedUser()
  renderApp('/no-such-page')
  expect(await screen.findByText('My Lessons')).toBeInTheDocument()
})

it('renders the about page for authenticated users', async () => {
  seedUser()
  renderApp('/about')
  expect(await screen.findByText(/No content yet/)).toBeInTheDocument()
})
