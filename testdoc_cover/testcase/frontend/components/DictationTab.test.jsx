// Covers frontend/src/components/DictationTab.jsx — answer checking, hints,
// sentence advancement, completion and replay.
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import DictationTab from '@src/components/DictationTab'

const sentences = [
  { transcript: 'Hello world', translation: 'Chào thế giới', start: 0, end: 2, audioUrl: 'blob:a' },
  { transcript: "It's a well-known fact", translation: '', start: 2, end: 4, audioUrl: 'blob:a' },
]

function renderTab(props = {}) {
  const onProgress = vi.fn()
  const onComplete = vi.fn()
  const utils = render(
    <DictationTab
      sentences={sentences}
      initialSentence={0}
      onProgress={onProgress}
      onComplete={onComplete}
      {...props}
    />
  )
  return { ...utils, onProgress, onComplete }
}

function typeAndSubmit(value) {
  const textarea = screen.getByPlaceholderText(/Type what you hear/)
  fireEvent.change(textarea, { target: { value } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
  return textarea
}

it('shows sentence position and check button', () => {
  renderTab()
  expect(screen.getByText('1 / 2')).toBeInTheDocument()
  expect(screen.getByText('Check (Enter)')).toBeInTheDocument()
})

it('starts from initialSentence', () => {
  renderTab({ initialSentence: 1 })
  expect(screen.getByText('2 / 2')).toBeInTheDocument()
})

it('accepts an exact answer and shows transcript with translation', () => {
  const { onProgress } = renderTab()
  typeAndSubmit('Hello world')
  expect(screen.getByText('Correct!')).toBeInTheDocument()
  expect(screen.getByText('Hello world', { selector: 'p' })).toBeInTheDocument()
  expect(screen.getByText('Chào thế giới')).toBeInTheDocument()
  expect(onProgress).toHaveBeenCalledWith(0, false)
})

it('ignores case and punctuation when checking', () => {
  renderTab()
  typeAndSubmit('  hello, WORLD!  ')
  expect(screen.getByText('Correct!')).toBeInTheDocument()
})

it('treats apostrophes and hyphens as equivalent to plain words', () => {
  renderTab({ initialSentence: 1 })
  typeAndSubmit('its a well known fact')
  expect(screen.getByText('Correct!')).toBeInTheDocument()
})

it('hints the first wrong word using the original token', () => {
  renderTab()
  typeAndSubmit('Hello monde')
  expect(screen.getByText('Hint: "world"')).toBeInTheDocument()
})

it('hints the next missing word', () => {
  renderTab()
  typeAndSubmit('Hello')
  expect(screen.getByText('Next word: "world"')).toBeInTheDocument()
})

it('flags too many words', () => {
  renderTab()
  typeAndSubmit('Hello world again')
  expect(screen.getByText('Too many words')).toBeInTheDocument()
})

it('clears the hint when the user keeps typing', () => {
  renderTab()
  const textarea = typeAndSubmit('Hello')
  expect(screen.getByText(/Next word/)).toBeInTheDocument()
  fireEvent.change(textarea, { target: { value: 'Hello w' } })
  expect(screen.queryByText(/Next word/)).not.toBeInTheDocument()
})

it('advances to the next sentence after a correct answer', () => {
  const { onProgress } = renderTab()
  typeAndSubmit('Hello world')
  fireEvent.click(screen.getByText('Next →'))
  expect(screen.getByText('2 / 2')).toBeInTheDocument()
  expect(onProgress).toHaveBeenLastCalledWith(1, false)
  expect(screen.queryByText('Correct!')).not.toBeInTheDocument()
})

it('marks the last sentence as a lesson completion', () => {
  const { onProgress, onComplete } = renderTab({ initialSentence: 1 })
  typeAndSubmit("It's a well-known fact")
  expect(onProgress).toHaveBeenCalledWith(1, true)
  expect(screen.getByText('Finish')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Finish'))
  expect(onComplete).toHaveBeenCalledTimes(1)
})

it('replays the current sentence when Ctrl is pressed', () => {
  const play = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
  renderTab()
  fireEvent.keyDown(window, { key: 'Control' })
  expect(play).toHaveBeenCalled()
})

it('replay button plays the audio', () => {
  const play = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
  renderTab()
  fireEvent.click(screen.getByTitle('Replay (or press Ctrl)'))
  expect(play).toHaveBeenCalled()
})

it('renders nothing when the sentence index is out of range', () => {
  const { container } = render(
    <DictationTab sentences={[]} initialSentence={0} />
  )
  expect(container).toBeEmptyDOMElement()
})
