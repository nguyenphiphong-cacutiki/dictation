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

it('accepts a correct answer: source sentence fills the input, card shows only the translation', () => {
  const { onProgress } = renderTab()
  const textarea = typeAndSubmit('hello, world!')
  expect(screen.getByText('Correct!')).toBeInTheDocument()
  // The input box is replaced with the original source sentence…
  expect(textarea.value).toBe('Hello world')
  // …and the answer card shows only the translation, not the transcript.
  expect(screen.queryByText('Hello world', { selector: 'p' })).not.toBeInTheDocument()
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

it('hints the next missing word and appends a trailing space so typing can continue', () => {
  renderTab()
  const textarea = typeAndSubmit('Hello')
  expect(screen.getByText('Next word: "world"')).toBeInTheDocument()
  expect(textarea.value).toBe('Hello ')
})

it('does not add another trailing space when the input already ends with one', () => {
  renderTab()
  const textarea = typeAndSubmit('Hello ')
  expect(screen.getByText('Next word: "world"')).toBeInTheDocument()
  expect(textarea.value).toBe('Hello ')
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

it('lets the user switch the replay shortcut to F2 and persists the choice', () => {
  const play = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
  renderTab()
  fireEvent.change(screen.getByTitle('Keyboard shortcut for Replay'), { target: { value: 'F2' } })
  fireEvent.keyDown(window, { key: 'Control' })
  expect(play).not.toHaveBeenCalled() // old shortcut no longer replays
  fireEvent.keyDown(window, { key: 'F2' })
  expect(play).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('replay_shortcut')).toBe('F2')
  expect(screen.getByTitle('Replay (or press F2)')).toBeInTheDocument()
})

it('supports Shift as a replay shortcut', () => {
  const play = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
  renderTab()
  fireEvent.change(screen.getByTitle('Keyboard shortcut for Replay'), { target: { value: 'Shift' } })
  fireEvent.keyDown(window, { key: 'Shift' })
  expect(play).toHaveBeenCalled()
})

it('restores the saved replay shortcut on mount', () => {
  localStorage.setItem('replay_shortcut', 'F2')
  const play = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
  renderTab()
  expect(screen.getByTitle('Replay (or press F2)')).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'F2' })
  expect(play).toHaveBeenCalled()
})

it('falls back to Ctrl when the stored shortcut value is invalid', () => {
  localStorage.setItem('replay_shortcut', 'CapsLock')
  renderTab()
  expect(screen.getByTitle('Replay (or press Ctrl)')).toBeInTheDocument()
})

it('renders nothing when the sentence index is out of range', () => {
  const { container } = render(
    <DictationTab sentences={[]} initialSentence={0} />
  )
  expect(container).toBeEmptyDOMElement()
})
