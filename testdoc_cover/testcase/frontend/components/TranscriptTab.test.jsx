// Covers frontend/src/components/TranscriptTab.jsx — playback modes, seeking,
// sentence navigation and auto-advance.
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import TranscriptTab from '@src/components/TranscriptTab'

const sentences = [
  { transcript: 'First sentence', translation: 'Câu một', start: 0, end: 2 },
  { transcript: 'Second sentence', translation: '', start: 2, end: 4 },
  { transcript: 'Third sentence', translation: '', start: 4, end: 6 },
]

function renderTab() {
  const utils = render(<TranscriptTab sentences={sentences} audioUrl="blob:a" />)
  const audio = utils.container.querySelector('audio')
  Object.defineProperty(audio, 'duration', { configurable: true, value: 10 })
  fireEvent.loadedMetadata(audio)
  return { ...utils, audio }
}

it('renders every sentence with timestamp and translation', () => {
  renderTab()
  expect(screen.getByText('First sentence')).toBeInTheDocument()
  expect(screen.getByText('Second sentence')).toBeInTheDocument()
  expect(screen.getByText('Câu một')).toBeInTheDocument()
  expect(screen.getAllByText('0:00.0').length).toBeGreaterThan(0)
  expect(screen.getByText('0:02.0')).toBeInTheDocument()
})

it('play button toggles between Play and Pause with the audio events', () => {
  const { audio } = renderTab()
  expect(screen.getByText('Play')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Play'))
  expect(screen.getByText('Pause')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Pause'))
  expect(screen.getByText('Play')).toBeInTheDocument()
  expect(audio.currentTime).toBe(0)
})

it('clicking a sentence in full-audio mode seeks to its start and plays', () => {
  const { audio } = renderTab()
  fireEvent.click(screen.getByText('Second sentence'))
  expect(audio.currentTime).toBe(2)
  expect(screen.getByText('Pause')).toBeInTheDocument()
})

it('jump-to input seeks the audio on Enter', () => {
  const { audio } = renderTab()
  const input = screen.getByPlaceholderText('1:30')
  fireEvent.change(input, { target: { value: '0:03' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(audio.currentTime).toBe(3)
  expect(input.value).toBe('')
})

it('jump-to clamps to the audio duration', () => {
  const { audio } = renderTab()
  const input = screen.getByPlaceholderText('1:30')
  fireEvent.change(input, { target: { value: '999' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(audio.currentTime).toBe(10)
})

it('ignores an unparseable jump-to value', () => {
  const { audio } = renderTab()
  const input = screen.getByPlaceholderText('1:30')
  fireEvent.change(input, { target: { value: 'abc' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(audio.currentTime).toBe(0)
  expect(input.value).toBe('abc')
})

describe('sentence mode', () => {
  it('toggles on and shows prev/next controls with a counter', () => {
    renderTab()
    fireEvent.click(screen.getByTitle('Switch to sentence-by-sentence'))
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText('‹ Prev')).toBeInTheDocument()
    expect(screen.getByText('Next ›')).toBeInTheDocument()
  })

  it('starts from the sentence matching the current playback position', () => {
    const { audio } = renderTab()
    audio.currentTime = 3
    fireEvent.timeUpdate(audio)
    fireEvent.click(screen.getByTitle('Switch to sentence-by-sentence'))
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('steps between sentences and disables the bounds', () => {
    renderTab()
    fireEvent.click(screen.getByTitle('Switch to sentence-by-sentence'))
    expect(screen.getByText('‹ Prev')).toBeDisabled()
    fireEvent.click(screen.getByText('Next ›'))
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next ›'))
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    expect(screen.getByText('Next ›')).toBeDisabled()
  })

  it('clicking a sentence selects and plays just that sentence', () => {
    const { audio } = renderTab()
    fireEvent.click(screen.getByTitle('Switch to sentence-by-sentence'))
    fireEvent.click(screen.getByText('Third sentence'))
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    expect(audio.currentTime).toBe(4)
  })

  it('auto-advances to the next sentence when the current one ends', () => {
    const { audio } = renderTab()
    fireEvent.click(screen.getByTitle('Switch to sentence-by-sentence'))
    fireEvent.click(screen.getByText('Play')) // plays sentence 1, stops at 2
    audio.currentTime = 2.1
    fireEvent.timeUpdate(audio)
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(audio.currentTime).toBe(2) // snapped to sentence 2 start
  })

  it('pauses at the end of the last sentence', () => {
    const { audio } = renderTab()
    fireEvent.click(screen.getByTitle('Switch to sentence-by-sentence'))
    fireEvent.click(screen.getByText('Third sentence')) // stops at 6
    audio.currentTime = 6.5
    fireEvent.timeUpdate(audio)
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    expect(screen.getByText('Play')).toBeInTheDocument() // paused again
  })

  it('toggles back to full-audio mode', () => {
    renderTab()
    fireEvent.click(screen.getByTitle('Switch to sentence-by-sentence'))
    fireEvent.click(screen.getByTitle('Switch to full audio'))
    expect(screen.queryByText('‹ Prev')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('1:30')).toBeInTheDocument()
  })
})
