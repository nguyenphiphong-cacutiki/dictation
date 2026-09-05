// Covers frontend/src/pages/About.jsx — content states.
import React from 'react'
import { render, screen } from '@testing-library/react'
import About from '@src/pages/About'
import { jsonRes, stubFetch } from '../helpers.jsx'

it('shows a spinner while loading', () => {
  stubFetch(() => new Promise(() => {}))
  const { container } = render(<About />)
  expect(container.querySelector('.animate-spin')).toBeInTheDocument()
})

it('shows a placeholder when no content is configured', async () => {
  stubFetch(() => jsonRes({ content: '' }))
  render(<About />)
  expect(await screen.findByText(/No content yet/)).toBeInTheDocument()
})

it('renders the configured HTML content', async () => {
  stubFetch(() => jsonRes({ content: '<h1>Welcome</h1><p>Hello there</p>' }))
  render(<About />)
  expect(await screen.findByText('Welcome')).toBeInTheDocument()
  expect(screen.getByText('Hello there')).toBeInTheDocument()
})

it('falls back to the placeholder when the request fails', async () => {
  stubFetch(() => jsonRes({ error: 'boom' }, false, 500))
  render(<About />)
  expect(await screen.findByText(/No content yet/)).toBeInTheDocument()
})
