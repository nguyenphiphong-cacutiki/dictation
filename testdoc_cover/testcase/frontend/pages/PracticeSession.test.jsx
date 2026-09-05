// Covers frontend/src/pages/PracticeSession.jsx — lesson load, timestamp
// parsing, tab switching, progress saving and lesson completion.
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PracticeSession from '@src/pages/PracticeSession'
import { bodyOf, fetchCall, jsonRes, stubFetch } from '../helpers.jsx'

const lesson = {
  lesson_id: 'l1',
  title: 'Morning News',
  audio_url: 'https://s3.fake/a.wav',
  sentences: [
    { start: '0:00.000', end: '0:02.000', transcript: 'Good morning', translation: 'Chào buổi sáng' },
  ],
  progress: { current_sentence: 0, practice_count: 0 },
}

function renderSession(route = (url) => jsonRes(lesson)) {
  const mockFetch = stubFetch((url, opts) => {
    if (url.includes('/progress/')) return jsonRes({ current_sentence: 0, practice_count: 1 })
    return route(url, opts)
  })
  const utils = render(
    <MemoryRouter initialEntries={['/practice/l1']}>
      <Routes>
        <Route path="/practice" element={<div>LIST-PAGE</div>} />
        <Route path="/practice/:id" element={<PracticeSession />} />
      </Routes>
    </MemoryRouter>
  )
  return { ...utils, mockFetch }
}

it('loads the lesson and shows the dictation tab by default', async () => {
  renderSession()
  expect(await screen.findByText('Morning News')).toBeInTheDocument()
  expect(screen.getByText('Dictation')).toBeInTheDocument()
  expect(screen.getByPlaceholderText(/Type what you hear/)).toBeInTheDocument()
})

it('shows the error message when the lesson fails to load', async () => {
  renderSession(() => jsonRes({ error: 'Lesson not found' }, false, 404))
  expect(await screen.findByText('Lesson not found')).toBeInTheDocument()
})

it('switches to the full transcript tab', async () => {
  renderSession()
  await screen.findByText('Morning News')
  fireEvent.click(screen.getByText('Full Transcript'))
  expect(screen.getByText('Good morning')).toBeInTheDocument()
  expect(screen.getByText('Chào buổi sáng')).toBeInTheDocument()
  expect(screen.queryByPlaceholderText(/Type what you hear/)).not.toBeInTheDocument()
})

it('tells the user when a lesson has no sentences', async () => {
  renderSession(() => jsonRes({ ...lesson, sentences: [] }))
  expect(await screen.findByText(/no sentences yet/)).toBeInTheDocument()
})

it('resumes from the saved progress position', async () => {
  const twoSentences = {
    ...lesson,
    sentences: [
      ...lesson.sentences,
      { start: '0:02.000', end: '0:04.000', transcript: 'Second line', translation: '' },
    ],
    progress: { current_sentence: 1, practice_count: 0 },
  }
  renderSession(() => jsonRes(twoSentences))
  expect(await screen.findByText('2 / 2')).toBeInTheDocument()
})

it('completing the lesson saves progress and shows the trophy screen', async () => {
  const { mockFetch } = renderSession()
  await screen.findByText('Morning News')

  const textarea = screen.getByPlaceholderText(/Type what you hear/)
  fireEvent.change(textarea, { target: { value: 'Good morning' } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
  expect(screen.getByText('Correct!')).toBeInTheDocument()

  fireEvent.click(screen.getByText('Finish'))
  expect(await screen.findByText('Lesson Complete!')).toBeInTheDocument()

  const progressCall = fetchCall(mockFetch, '/progress/l1')
  expect(progressCall[1].method).toBe('PUT')
  expect(bodyOf(progressCall)).toEqual({ current_sentence: 0, increment_practice: true })
})

it('practice again restarts the lesson from the completion screen', async () => {
  renderSession()
  await screen.findByText('Morning News')
  const textarea = screen.getByPlaceholderText(/Type what you hear/)
  fireEvent.change(textarea, { target: { value: 'Good morning' } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
  fireEvent.click(screen.getByText('Finish'))
  await screen.findByText('Lesson Complete!')

  fireEvent.click(screen.getByText('Practice again'))
  expect(screen.getByPlaceholderText(/Type what you hear/)).toBeInTheDocument()
})

it('back to lessons returns to the lesson list', async () => {
  renderSession()
  await screen.findByText('Morning News')
  const textarea = screen.getByPlaceholderText(/Type what you hear/)
  fireEvent.change(textarea, { target: { value: 'Good morning' } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
  fireEvent.click(screen.getByText('Finish'))
  await screen.findByText('Lesson Complete!')

  fireEvent.click(screen.getByText('Back to lessons'))
  expect(screen.getByText('LIST-PAGE')).toBeInTheDocument()
})
