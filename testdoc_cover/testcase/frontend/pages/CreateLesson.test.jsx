// Covers frontend/src/pages/CreateLesson.jsx — sentence editing, validation,
// AI translation, reset, and the create/edit save flows.
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CreateLesson from '@src/pages/CreateLesson'
import { bodyOf, fetchCall, jsonRes, stubFetch } from '../helpers.jsx'

// Minimal WebAudio fake — enough for useBufferPlayer and the trim/encode path.
const fakeBuffer = {
  duration: 9,
  numberOfChannels: 1,
  sampleRate: 22050,
  length: 8,
  getChannelData: () => new Float32Array(8),
}

class FakeAudioContext {
  constructor() {
    this.state = 'running'
    this.currentTime = 0
    this.destination = {}
  }
  decodeAudioData() {
    return Promise.resolve(fakeBuffer)
  }
  createBufferSource() {
    return { connect() {}, disconnect() {}, start() {}, stop() {}, onended: null, buffer: null }
  }
  resume() {}
  close() {
    return Promise.resolve()
  }
}

class FakeOfflineAudioContext extends FakeAudioContext {
  startRendering() {
    return Promise.resolve(fakeBuffer)
  }
}

beforeEach(() => {
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext)
})

function renderCreate(route, initialPath = '/create') {
  const mockFetch = stubFetch(route || (() => jsonRes({})))
  const utils = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/create" element={<CreateLesson />} />
        <Route path="/create/:id" element={<CreateLesson />} />
        <Route path="/practice" element={<div>PRACTICE-PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )
  return { ...utils, mockFetch }
}

describe('create mode editing', () => {
  it('renders with one empty sentence row', () => {
    renderCreate()
    expect(screen.getByText('Create Lesson', { selector: 'h1' })).toBeInTheDocument()
    expect(screen.getByText('Sentences (1)')).toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('Transcript (what is said)')).toHaveLength(1)
  })

  it('adding a sentence seeds its start from the previous end', () => {
    renderCreate()
    fireEvent.change(screen.getByPlaceholderText('00:05.000'), { target: { value: '00:07.500' } })
    fireEvent.click(screen.getByText('+ Add Sentence'))
    expect(screen.getByText('Sentences (2)')).toBeInTheDocument()
    const startInputs = screen.getAllByPlaceholderText('00:00.000')
    expect(startInputs[1].value).toBe('00:07.500')
  })

  it('typing an end time fills the next empty start', () => {
    renderCreate()
    fireEvent.click(screen.getByText('+ Add Sentence'))
    const startInputs = screen.getAllByPlaceholderText('00:00.000')
    fireEvent.change(startInputs[1], { target: { value: '' } }) // clear it
    const endInputs = screen.getAllByPlaceholderText('00:05.000')
    fireEvent.change(endInputs[0], { target: { value: '00:03.000' } })
    expect(screen.getAllByPlaceholderText('00:00.000')[1].value).toBe('00:03.000')
  })

  it('removes a sentence row', () => {
    renderCreate()
    fireEvent.click(screen.getByText('+ Add Sentence'))
    expect(screen.getByText('Sentences (2)')).toBeInTheDocument()
    fireEvent.click(screen.getAllByTitle('Remove sentence')[0])
    expect(screen.getByText('Sentences (1)')).toBeInTheDocument()
  })

  it('reset clears the form', () => {
    renderCreate()
    fireEvent.change(screen.getByPlaceholderText(/Lesson title/), { target: { value: 'Draft' } })
    fireEvent.click(screen.getByText('+ Add Sentence'))
    fireEvent.click(screen.getByText('Reset'))
    expect(screen.getByPlaceholderText(/Lesson title/).value).toBe('')
    expect(screen.getByText('Sentences (1)')).toBeInTheDocument()
  })
})

describe('validation', () => {
  it('requires a title before saving', () => {
    renderCreate()
    fireEvent.click(screen.getByText('Create Lesson', { selector: 'button' }))
    expect(screen.getByText('Title is required')).toBeInTheDocument()
  })

  it('requires audio before saving', () => {
    renderCreate()
    fireEvent.change(screen.getByPlaceholderText(/Lesson title/), { target: { value: 'T' } })
    fireEvent.click(screen.getByText('Create Lesson', { selector: 'button' }))
    expect(screen.getByText('Please upload an audio file')).toBeInTheDocument()
  })
})

describe('AI translation', () => {
  it('complains when no sentence needs translation', () => {
    renderCreate()
    fireEvent.click(screen.getByText('AI Translate All'))
    expect(screen.getByText('No sentences need translation')).toBeInTheDocument()
  })

  it('translates all untranslated sentences', async () => {
    const { mockFetch } = renderCreate((url) =>
      url.includes('/translate')
        ? jsonRes({ translations: { 0: 'Xin chào' } })
        : jsonRes({})
    )
    fireEvent.change(screen.getByPlaceholderText('Transcript (what is said)'), {
      target: { value: 'Hello' },
    })
    fireEvent.click(screen.getByText('AI Translate All'))

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Translation (optional)').value).toBe('Xin chào')
    )
    const call = fetchCall(mockFetch, '/translate')
    expect(bodyOf(call)).toEqual({ sentences: [{ transcript: 'Hello' }], targets: [0] })
  })

  it('shows the backend error when translation fails', async () => {
    renderCreate((url) =>
      url.includes('/translate')
        ? jsonRes({ error: 'Translation is not configured' }, false, 503)
        : jsonRes({})
    )
    fireEvent.change(screen.getByPlaceholderText('Transcript (what is said)'), {
      target: { value: 'Hello' },
    })
    fireEvent.click(screen.getByText('AI Translate All'))
    expect(await screen.findByText('Translation is not configured')).toBeInTheDocument()
  })

  it('per-sentence translate button is disabled without a transcript', () => {
    renderCreate()
    expect(screen.getByTitle('AI translate this sentence')).toBeDisabled()
  })

  it('translates a single sentence on demand', async () => {
    const { mockFetch } = renderCreate((url) =>
      url.includes('/translate')
        ? jsonRes({ translations: { 0: 'Một câu' } })
        : jsonRes({})
    )
    fireEvent.change(screen.getByPlaceholderText('Transcript (what is said)'), {
      target: { value: 'A sentence' },
    })
    fireEvent.click(screen.getByTitle('AI translate this sentence'))
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Translation (optional)').value).toBe('Một câu')
    )
    expect(bodyOf(fetchCall(mockFetch, '/translate')).targets).toEqual([0])
  })
})

describe('saving', () => {
  function uploadRoutes(url, opts = {}) {
    if (url.includes('/audio/upload-url')) {
      return jsonRes({ upload_url: 'https://s3.fake/upload', audio_key: 'audio/u1/new.mp3' })
    }
    if (url.includes('https://s3.fake/upload')) return { ok: true, status: 200, json: () => Promise.resolve({}) }
    if (url.includes('/lessons')) return jsonRes({ lesson_id: 'new-l1' })
    return jsonRes({})
  }

  it('uploads a new audio file and creates the lesson', async () => {
    const { mockFetch } = renderCreate(uploadRoutes)
    fireEvent.change(screen.getByPlaceholderText(/Lesson title/), { target: { value: 'My lesson' } })

    const file = new File(['audio-bytes'], 'clip.mp3', { type: 'audio/mpeg' })
    const fileInput = document.querySelector('input[type="file"]')
    fireEvent.change(fileInput, { target: { files: [file] } })
    expect(screen.getByText('clip.mp3')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Create Lesson', { selector: 'button' }))
    await screen.findByText('PRACTICE-PAGE')

    const uploadUrlCall = fetchCall(mockFetch, '/audio/upload-url')
    expect(bodyOf(uploadUrlCall)).toEqual({ content_type: 'audio/mpeg', audio_key: '' })
    const putUpload = fetchCall(mockFetch, 'https://s3.fake/upload')
    expect(putUpload[1].method).toBe('PUT')
    const createCall = fetchCall(mockFetch, '/api/lessons')
    expect(createCall[1].method).toBe('POST')
    expect(bodyOf(createCall).title).toBe('My lesson')
    expect(bodyOf(createCall).audio_key).toBe('audio/u1/new.mp3')
  })

  it('shows the backend error when creation fails', async () => {
    renderCreate((url, opts = {}) => {
      if (url.includes('/audio/upload-url')) {
        return jsonRes({ upload_url: 'https://s3.fake/upload', audio_key: 'k' })
      }
      if (url.includes('https://s3.fake/upload')) return { ok: true, status: 200, json: () => Promise.resolve({}) }
      if (url.includes('/lessons')) return jsonRes({ error: 'Title is required' }, false, 400)
      return jsonRes({})
    })
    fireEvent.change(screen.getByPlaceholderText(/Lesson title/), { target: { value: 'X' } })
    const file = new File(['audio'], 'a.mp3', { type: 'audio/mpeg' })
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } })
    fireEvent.click(screen.getByText('Create Lesson', { selector: 'button' }))
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
  })
})

describe('edit mode', () => {
  const existing = {
    lesson_id: 'e1',
    title: 'Existing lesson',
    audio_key: 'audio/u1/a.wav',
    audio_url: 'https://s3.fake/a.wav',
    sentences: [
      { start: '0:00.000', end: '0:02.000', transcript: 'Line one', translation: 'Dòng một' },
    ],
  }

  function editRoutes(url, opts = {}) {
    if (url.includes('/lessons/e1') && (!opts.method || opts.method === 'GET')) {
      if (opts.method === 'PUT') return jsonRes({ lesson_id: 'e1' })
      return jsonRes(existing)
    }
    if (url.includes('https://s3.fake/a.wav')) {
      return { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }
    }
    return jsonRes({})
  }

  it('loads the existing lesson into the form', async () => {
    renderCreate(editRoutes, '/create/e1')
    expect(await screen.findByDisplayValue('Existing lesson')).toBeInTheDocument()
    expect(screen.getByText('Edit Lesson')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Line one')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Dòng một')).toBeInTheDocument()
    expect(screen.getByText('Save Changes')).toBeInTheDocument()
    expect(screen.queryByText('Reset')).not.toBeInTheDocument()
  })

  it('seek slider follows the drag and commits the position on release', async () => {
    renderCreate(editRoutes, '/create/e1')
    await screen.findByDisplayValue('Existing lesson')
    await screen.findByText('0:09.000') // decoded duration → player is up

    const slider = document.querySelector('input[type="range"]')
    fireEvent.pointerDown(slider)
    fireEvent.change(slider, { target: { value: '5' } })
    // While dragging, the readout tracks the drag position (not the playhead)
    expect(screen.getByText('0:05.000')).toBeInTheDocument()
    fireEvent.pointerUp(slider)
    // After release the playhead is committed to the drag position
    expect(screen.getByText('0:05.000')).toBeInTheDocument()
  })

  it('seek slider seeks immediately on a change without a drag (keyboard)', async () => {
    renderCreate(editRoutes, '/create/e1')
    await screen.findByDisplayValue('Existing lesson')
    await screen.findByText('0:09.000')

    const slider = document.querySelector('input[type="range"]')
    fireEvent.change(slider, { target: { value: '3' } })
    expect(screen.getByText('0:03.000')).toBeInTheDocument()
  })

  it('saves changes without re-uploading when trim bounds are unchanged', async () => {
    const { mockFetch } = renderCreate((url, opts = {}) => {
      if (url.includes('/lessons/e1')) {
        return opts.method === 'PUT' ? jsonRes({ lesson_id: 'e1' }) : jsonRes(existing)
      }
      return editRoutes(url, opts)
    }, '/create/e1')

    await screen.findByDisplayValue('Existing lesson')
    fireEvent.change(screen.getByDisplayValue('Existing lesson'), {
      target: { value: 'Renamed lesson' },
    })
    fireEvent.click(screen.getByText('Save Changes'))
    await screen.findByText('PRACTICE-PAGE')

    expect(fetchCall(mockFetch, '/audio/upload-url')).toBeUndefined()
    const putCall = mockFetch.mock.calls.find(
      ([url, opts]) => String(url).includes('/api/lessons/e1') && opts?.method === 'PUT'
    )
    const body = bodyOf(putCall)
    expect(body.title).toBe('Renamed lesson')
    expect(body.audio_key).toBe('audio/u1/a.wav')
    expect(body.sentences[0].start).toBe('0:00.000')
  })
})
