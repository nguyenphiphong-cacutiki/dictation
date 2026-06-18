import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'

const EMPTY_SENTENCE = (prevEnd = '00:00.000') => ({
  id: Math.random().toString(36).slice(2),
  start: prevEnd,
  end: '',
  transcript: '',
  translation: '',
})

function toSeconds(timeStr) {
  if (!timeStr) return 0
  const [msPart, ...rest] = timeStr.split('.').reverse()
  const timePart = rest.reverse().join('.')
  const [min, sec] = timePart.includes(':') ? timePart.split(':').map(Number) : [0, parseFloat(timePart || '0')]
  const ms = msPart ? parseFloat(`0.${msPart}`) : 0
  return min * 60 + (sec || 0) + ms
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00.000'
  const totalMs = Math.round(sec * 1000)
  const ms = totalMs % 1000
  const totalSec = Math.floor(totalMs / 1000)
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function parseTimeInput(str) {
  if (!str) return null
  str = str.trim()
  const colonIdx = str.indexOf(':')
  if (colonIdx !== -1) {
    const min = parseFloat(str.slice(0, colonIdx)) || 0
    const rest = parseFloat(str.slice(colonIdx + 1)) || 0
    return min * 60 + rest
  }
  const v = parseFloat(str)
  return isNaN(v) ? null : v
}

function _wavStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

function encodeWav(audioBuffer) {
  const ch = audioBuffer.numberOfChannels
  const sr = audioBuffer.sampleRate
  const n = audioBuffer.length
  const dataSize = n * ch * 2
  const header = new ArrayBuffer(44)
  const hv = new DataView(header)
  _wavStr(hv, 0, 'RIFF'); hv.setUint32(4, 36 + dataSize, true)
  _wavStr(hv, 8, 'WAVE'); _wavStr(hv, 12, 'fmt ')
  hv.setUint32(16, 16, true); hv.setUint16(20, 1, true)
  hv.setUint16(22, ch, true); hv.setUint32(24, sr, true)
  hv.setUint32(28, sr * ch * 2, true); hv.setUint16(32, ch * 2, true)
  hv.setUint16(34, 16, true); _wavStr(hv, 36, 'data'); hv.setUint32(40, dataSize, true)
  // Int16Array writes are 10-20x faster than DataView.setInt16 in a hot loop
  const samples = new Int16Array(n * ch)
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, audioBuffer.getChannelData(c)[i]))
      samples[i * ch + c] = Math.round(s < 0 ? s * 0x8000 : s * 0x7FFF)
    }
  }
  return new Blob([header, samples.buffer], { type: 'audio/wav' })
}

// For re-trimming stored audio: WAV is 44-byte header + raw 16-bit PCM at 22050 Hz mono.
// We know this format because we always write it. Fetch only the needed byte range —
// no full download, no decode, no encode.
async function retrimStoredWav(url, startSec, endSec) {
  const SR = 22050
  const startSample = Math.round(startSec * SR)
  const endSample = Math.round(endSec * SR)
  if (endSample <= startSample) throw new Error('Empty trim range')
  const byteStart = 44 + startSample * 2
  const byteEnd = 44 + endSample * 2 - 1
  const res = await fetch(url, { headers: { Range: `bytes=${byteStart}-${byteEnd}` } })
  if (!res.ok) throw new Error(`Range fetch failed: ${res.status}`)
  const samples = await res.arrayBuffer()
  const dataSize = samples.byteLength  // use actual size in case S3 clipped to EOF
  const header = new ArrayBuffer(44)
  const hv = new DataView(header)
  _wavStr(hv, 0, 'RIFF'); hv.setUint32(4, 36 + dataSize, true)
  _wavStr(hv, 8, 'WAVE'); _wavStr(hv, 12, 'fmt ')
  hv.setUint32(16, 16, true); hv.setUint16(20, 1, true)
  hv.setUint16(22, 1, true); hv.setUint32(24, SR, true)
  hv.setUint32(28, SR * 2, true); hv.setUint16(32, 2, true)
  hv.setUint16(34, 16, true); _wavStr(hv, 36, 'data'); hv.setUint32(40, dataSize, true)
  return new Blob([header, samples], { type: 'audio/wav' })
}

async function trimAudioBuffer(arrayBuffer, startSec, endSec) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  let full
  try {
    full = await ctx.decodeAudioData(arrayBuffer)
  } finally {
    ctx.close()
  }
  // Render at 22050 Hz mono: 4x smaller than 44100 Hz stereo → much faster upload.
  // OfflineAudioContext handles resampling + stereo→mono downmix natively,
  // and renders faster than real-time.
  const targetSR = 22050
  const duration = endSec - startSec
  const frameCount = Math.max(1, Math.round(duration * targetSR))
  const offlineCtx = new OfflineAudioContext(1, frameCount, targetSR)
  const source = offlineCtx.createBufferSource()
  source.buffer = full
  source.connect(offlineCtx.destination)
  source.start(0, startSec, duration)
  return await offlineCtx.startRendering()
}

export default function CreateLesson() {
  const { id: editId } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [sentences, setSentences] = useState([EMPTY_SENTENCE()])
  const [audioFile, setAudioFile] = useState(null)
  const [audioKey, setAudioKey] = useState('')
  const [audioObjectUrl, setAudioObjectUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStep, setSaveStep] = useState('')
  const [error, setError] = useState('')
  const [translating, setTranslating] = useState(false)
  const [translatingIdx, setTranslatingIdx] = useState(null)
  const audioRef = useRef(null)
  const origTrimBoundsRef = useRef({ firstMs: null, lastMs: null })
  const [mainPlaying, setMainPlaying] = useState(false)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const [seekInput, setSeekInput] = useState('')
  const stopAtRef = useRef(null)
  const fileInputRef = useRef(null)
  const sentencesBottomRef = useRef(null)

  useEffect(() => {
    if (!editId) return
    api.get(`/lessons/${editId}`).then(data => {
      setTitle(data.title || '')
      const loaded = data.sentences?.length
        ? data.sentences.map(s => ({ ...s, id: s.id || Math.random().toString(36).slice(2) }))
        : [EMPTY_SENTENCE()]
      setSentences(loaded)
      setAudioKey(data.audio_key || '')
      if (data.audio_url) setAudioObjectUrl(data.audio_url)

      // Record original trim bounds so we can detect changes on save
      const rawLoaded = loaded.map(({ id: _id, ...s }) => s)
      const timed = rawLoaded.filter(s => s.start && s.end && toSeconds(s.end) > toSeconds(s.start))
      origTrimBoundsRef.current = timed.length > 0
        ? { firstMs: Math.round(toSeconds(timed[0].start) * 1000), lastMs: Math.round(toSeconds(timed[timed.length - 1].end) * 1000) }
        : { firstMs: null, lastMs: null }
    }).catch(() => {})
  }, [editId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    function onTimeUpdate() {
      if (stopAtRef.current !== null && audio.currentTime >= stopAtRef.current) {
        audio.pause()
        stopAtRef.current = null
      }
      setAudioCurrentTime(audio.currentTime)
    }
    audio.addEventListener('timeupdate', onTimeUpdate)
    return () => audio.removeEventListener('timeupdate', onTimeUpdate)
  }, [audioObjectUrl])

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setAudioFile(file)
    if (audioObjectUrl && !editId) URL.revokeObjectURL(audioObjectUrl)
    setAudioObjectUrl(URL.createObjectURL(file))
    setAudioKey('')
    setAudioDuration(0)
    setAudioCurrentTime(0)
    setError('')
  }

  function addSentence() {
    const last = sentences[sentences.length - 1]
    setSentences(prev => [...prev, EMPTY_SENTENCE(last?.end || '00:00.000')])
    setTimeout(() => sentencesBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
  }

  function removeSentence(idx) {
    setSentences(prev => prev.filter((_, i) => i !== idx))
  }

  function updateSentence(idx, field, value) {
    setSentences(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  function updateEnd(idx, value) {
    setSentences(prev => prev.map((s, i) => {
      if (i === idx) return { ...s, end: value }
      if (i === idx + 1 && !s.start) return { ...s, start: value }
      return s
    }))
  }

  // Map the index→Vietnamese object returned by /translate back onto sentences.
  function applyTranslations(translations) {
    setSentences(prev => prev.map((s, i) => {
      const t = translations[String(i)]
      return t != null ? { ...s, translation: t } : s
    }))
  }

  // Translate every sentence that has a transcript but no translation yet,
  // sending the full ordered transcript as context in one request.
  async function translateAll() {
    const targets = sentences.reduce((acc, s, i) => {
      if (s.transcript.trim() && !s.translation.trim()) acc.push(i)
      return acc
    }, [])
    if (targets.length === 0) return setError('No sentences need translation')
    setError('')
    setTranslating(true)
    try {
      const { translations } = await api.post('/translate', {
        sentences: sentences.map(s => ({ transcript: s.transcript })),
        targets,
      })
      applyTranslations(translations)
    } catch (err) {
      setError(err.message || 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }

  // Translate a single sentence (even if it already has a translation),
  // using all sentences in order as context.
  async function translateOne(idx) {
    if (!sentences[idx]?.transcript.trim()) return
    setError('')
    setTranslatingIdx(idx)
    try {
      const { translations } = await api.post('/translate', {
        sentences: sentences.map(s => ({ transcript: s.transcript })),
        targets: [idx],
      })
      applyTranslations(translations)
    } catch (err) {
      setError(err.message || 'Translation failed')
    } finally {
      setTranslatingIdx(null)
    }
  }

  function playSentence(s) {
    const audio = audioRef.current
    if (!audio) return
    const start = toSeconds(s.start)
    const end = toSeconds(s.end)
    if (end <= start) return
    stopAtRef.current = end
    audio.currentTime = start
    audio.play()
  }

  function toggleMain() {
    const audio = audioRef.current
    if (!audio) return
    stopAtRef.current = null
    if (mainPlaying) audio.pause()
    else audio.play()
  }

  function seekRelative(delta) {
    const audio = audioRef.current
    if (!audio) return
    stopAtRef.current = null
    audio.currentTime = Math.max(0, Math.min(audioDuration || 0, audio.currentTime + delta))
    setAudioCurrentTime(audio.currentTime)
  }

  function handleSliderChange(e) {
    const audio = audioRef.current
    if (!audio) return
    stopAtRef.current = null
    audio.currentTime = parseFloat(e.target.value)
    setAudioCurrentTime(audio.currentTime)
  }

  function handleSeekKeyDown(e) {
    if (e.key !== 'Enter') return
    const t = parseTimeInput(seekInput)
    if (t === null) return
    const audio = audioRef.current
    if (!audio) return
    stopAtRef.current = null
    audio.currentTime = Math.max(0, Math.min(audioDuration, t))
    setAudioCurrentTime(audio.currentTime)
    setSeekInput('')
  }

  async function handleSave() {
    if (!title.trim()) return setError('Title is required')
    if (!audioKey && !audioFile) return setError('Please upload an audio file')

    const rawSentences = sentences.map(({ id: _id, ...s }) => s)
    setSaving(true)
    setSaveStep('')
    setError('')

    try {
      let finalAudioKey = audioKey
      let finalSentences = rawSentences

      const timed = rawSentences.filter(s => s.start && s.end && toSeconds(s.end) > toSeconds(s.start))
      const firstStartMs = timed.length > 0 ? Math.round(toSeconds(timed[0].start) * 1000) : 0
      const lastEndMs = timed.length > 0 ? Math.round(toSeconds(timed[timed.length - 1].end) * 1000) : 0
      const hasBounds = timed.length > 0 && lastEndMs > firstStartMs

      const orig = origTrimBoundsRef.current
      const boundsChanged = orig.firstMs !== firstStartMs || orig.lastMs !== lastEndMs

      if (audioFile) {
        // New audio file — always trim to bounds then upload
        if (hasBounds) {
          try {
            setSaveStep('Trimming…')
            const arrayBuffer = await audioFile.arrayBuffer()
            const trimmedBuf = await trimAudioBuffer(arrayBuffer, firstStartMs / 1000, lastEndMs / 1000)
            const wavBlob = encodeWav(trimmedBuf)
            setSaveStep('Uploading…')
            const { upload_url, audio_key: trimmedKey } = await api.post('/audio/upload-url', { content_type: 'audio/wav', audio_key: audioKey })
            await fetch(upload_url, { method: 'PUT', body: wavBlob, headers: { 'Content-Type': 'audio/wav' } })
            finalAudioKey = trimmedKey
            finalSentences = rawSentences.map(s => ({
              ...s,
              start: formatTime(Math.max(0, Math.round(toSeconds(s.start) * 1000) - firstStartMs) / 1000),
              end: formatTime(Math.max(0, Math.round(toSeconds(s.end) * 1000) - firstStartMs) / 1000),
            }))
          } catch {
            // Trimming failed — upload original file as-is
            setSaveStep('Uploading…')
            const { upload_url, audio_key } = await api.post('/audio/upload-url', { content_type: audioFile.type, audio_key: audioKey })
            await fetch(upload_url, { method: 'PUT', body: audioFile, headers: { 'Content-Type': audioFile.type } })
            finalAudioKey = audio_key
          }
        } else {
          setSaveStep('Uploading…')
          const { upload_url, audio_key } = await api.post('/audio/upload-url', { content_type: audioFile.type, audio_key: audioKey })
          await fetch(upload_url, { method: 'PUT', body: audioFile, headers: { 'Content-Type': audioFile.type } })
          finalAudioKey = audio_key
        }
      } else if (hasBounds && boundsChanged) {
        // No new file, but A or B changed — re-trim the stored audio.
        // If it's our own WAV (22050 Hz mono 16-bit), use a Range request to fetch only the
        // needed bytes — no full download, no decode. Fall back to full decode for other formats.
        setSaveStep('Trimming…')
        let wavBlob
        if (audioKey.endsWith('.wav')) {
          wavBlob = await retrimStoredWav(audioObjectUrl, firstStartMs / 1000, lastEndMs / 1000)
        } else {
          const res = await fetch(audioObjectUrl)
          const arrayBuffer = await res.arrayBuffer()
          const trimmedBuf = await trimAudioBuffer(arrayBuffer, firstStartMs / 1000, lastEndMs / 1000)
          wavBlob = encodeWav(trimmedBuf)
        }
        setSaveStep('Uploading…')
        const { upload_url, audio_key: trimmedKey } = await api.post('/audio/upload-url', { content_type: 'audio/wav', audio_key: audioKey })
        await fetch(upload_url, { method: 'PUT', body: wavBlob, headers: { 'Content-Type': 'audio/wav' } })
        finalAudioKey = trimmedKey
        finalSentences = rawSentences.map(s => ({
          ...s,
          start: formatTime(Math.max(0, Math.round(toSeconds(s.start) * 1000) - firstStartMs) / 1000),
          end: formatTime(Math.max(0, Math.round(toSeconds(s.end) * 1000) - firstStartMs) / 1000),
        }))
      }
      // else: no new file + bounds unchanged → keep existing audioKey and sentences as-is

      if (!finalAudioKey) return setError('Audio upload failed')

      if (editId) {
        await api.put(`/lessons/${editId}`, { title, sentences: finalSentences, audio_key: finalAudioKey })
      } else {
        await api.post('/lessons', { title, sentences: finalSentences, audio_key: finalAudioKey })
      }
      // The key is reused in place when the format is unchanged; it only differs when
      // the audio format changed, in which case the old object is now orphaned — delete it.
      if (audioKey && finalAudioKey !== audioKey) {
        api.delete('/audio', { audio_key: audioKey }).catch(() => {})
      }
      navigate('/practice')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
      setSaveStep('')
    }
  }

  function handleReset() {
    setTitle('')
    setSentences([EMPTY_SENTENCE()])
    setAudioFile(null)
    setAudioKey('')
    if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl)
    setAudioObjectUrl('')
    setAudioDuration(0)
    setAudioCurrentTime(0)
    setError('')
  }

  const pct = audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">

      {/* Top bar: title + action buttons */}
      <div className="flex items-center gap-3 mb-4 flex-wrap shrink-0">
        <h1 className="text-xl font-semibold text-gray-900 shrink-0">
          {editId ? 'Edit Lesson' : 'Create Lesson'}
        </h1>
        <input
          className="input flex-1 min-w-48"
          placeholder="Lesson title (e.g. BBC News – Climate Report)"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <div className="flex gap-2 shrink-0">
          <button onClick={handleSave} className="btn-primary text-sm" disabled={saving}>
            {saving ? (saveStep || 'Saving…') : editId ? 'Save Changes' : 'Create Lesson'}
          </button>
          {!editId && (
            <button onClick={handleReset} className="btn-secondary text-sm">Reset</button>
          )}
          <button onClick={() => navigate('/practice')} className="btn-secondary text-sm">Cancel</button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3 shrink-0">{error}</p>
      )}

      {/* Two-column body */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── Left panel: Audio (1/3) ── */}
        <div className="w-1/3 shrink-0 flex flex-col gap-4 overflow-y-auto">

          {/* Upload */}
          <div className="card p-4 space-y-3 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary text-sm"
                disabled={saving}
              >
                {audioObjectUrl ? 'Replace Audio' : 'Upload Audio'}
              </button>
              {audioKey && !audioFile && (
                <span className="text-sm text-green-600">Ready</span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            {audioFile && (
              <p className="text-xs text-gray-400 truncate">{audioFile.name}</p>
            )}
          </div>

          {/* Player */}
          {audioObjectUrl && (
            <div className="card p-4 space-y-4 shrink-0">
              <audio
                ref={audioRef}
                src={audioObjectUrl}
                onPlay={() => setMainPlaying(true)}
                onPause={() => setMainPlaying(false)}
                onEnded={() => setMainPlaying(false)}
                onLoadedMetadata={e => setAudioDuration(e.target.duration)}
                preload="metadata"
                className="hidden"
              />

              {/* Time */}
              <div className="flex justify-between items-center text-xs font-mono px-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-primary-600 font-semibold">{formatTime(audioCurrentTime)}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(formatTime(audioCurrentTime))}
                    className="p-0.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                    title="Copy current time"
                  >
                    <CopyIcon />
                  </button>
                </div>
                <span className="text-gray-400">{formatTime(audioDuration)}</span>
              </div>

              {/* Seek slider */}
              <div className="relative h-5 flex items-center">
                <div className="absolute inset-x-0 h-2 bg-gray-200 rounded-full overflow-hidden pointer-events-none">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{ width: `${pct}%`, transition: 'width 0.08s linear' }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={audioDuration || 100}
                  step={0.1}
                  value={audioCurrentTime}
                  onChange={handleSliderChange}
                  className="absolute inset-x-0 w-full opacity-0 cursor-pointer h-5"
                />
              </div>

              {/* Controls: −5s · Play/Pause · +5s */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => seekRelative(-5)}
                  className="text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                  title="Seek back 5 seconds"
                >
                  −5s
                </button>
                <button
                  onClick={toggleMain}
                  className="w-10 h-10 flex items-center justify-center bg-primary-600 text-white rounded-full hover:bg-primary-700 transition-colors"
                >
                  {mainPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button
                  onClick={() => seekRelative(5)}
                  className="text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                  title="Seek forward 5 seconds"
                >
                  +5s
                </button>
              </div>

              {/* Jump-to time input */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 shrink-0">Jump to:</label>
                <input
                  type="text"
                  value={seekInput}
                  onChange={e => setSeekInput(e.target.value)}
                  onKeyDown={handleSeekKeyDown}
                  placeholder="1:23.000"
                  className="input text-xs font-mono py-1.5 flex-1"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel: Sentences (2/3) ── */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h2 className="text-sm font-medium text-gray-700">
              Sentences ({sentences.length})
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={translateAll}
                disabled={translating}
                className="btn-secondary text-sm py-1.5 flex items-center gap-1.5"
                title="Translate all untranslated sentences with AI"
              >
                {translating ? <Spinner /> : <TranslateIcon />}
                {translating ? 'Translating…' : 'AI Translate All'}
              </button>
              <button onClick={addSentence} className="btn-primary text-sm py-1.5">
                + Add Sentence
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {sentences.map((s, idx) => (
              <div key={s.id} className="card p-3">
                <div className="flex gap-2 items-start">

                  {/* Timestamps */}
                  <div className="flex flex-col gap-1 w-32 shrink-0">
                    <label className="text-xs text-gray-500">Start (m:ss.ms)</label>
                    <input
                      className="input text-xs font-mono py-1.5"
                      placeholder="00:00.000"
                      value={s.start}
                      onChange={e => updateSentence(idx, 'start', e.target.value)}
                    />
                    <label className="text-xs text-gray-500">End (m:ss.ms)</label>
                    <input
                      className="input text-xs font-mono py-1.5"
                      placeholder="00:05.000"
                      value={s.end}
                      onChange={e => updateEnd(idx, e.target.value)}
                    />
                  </div>

                  {/* Transcript + Translation */}
                  <div className="flex-1 space-y-1.5">
                    <textarea
                      rows={2}
                      className="input resize-none text-sm"
                      placeholder="Transcript (what is said)"
                      value={s.transcript}
                      onChange={e => updateSentence(idx, 'transcript', e.target.value)}
                    />
                    <div className="flex gap-1.5">
                      <input
                        className="input text-sm flex-1"
                        placeholder="Translation (optional)"
                        value={s.translation}
                        onChange={e => updateSentence(idx, 'translation', e.target.value)}
                      />
                      <button
                        onClick={() => translateOne(idx)}
                        disabled={translatingIdx === idx || !s.transcript.trim()}
                        className="px-2 text-primary-600 hover:bg-primary-50 rounded shrink-0 disabled:opacity-40 disabled:hover:bg-transparent"
                        title="AI translate this sentence"
                      >
                        {translatingIdx === idx ? <Spinner /> : <TranslateIcon />}
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 shrink-0">
                    {audioObjectUrl && (
                      <button
                        onClick={() => playSentence(s)}
                        className="p-1.5 text-primary-600 hover:bg-primary-50 rounded"
                        title="Play this sentence"
                      >
                        <PlayIcon />
                      </button>
                    )}
                    <button
                      onClick={() => removeSentence(idx)}
                      className="p-1.5 text-red-400 hover:bg-red-50 rounded"
                      title="Remove sentence"
                    >
                      <XIcon />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div ref={sentencesBottomRef} />
          </div>
        </div>

      </div>
    </div>
  )
}

function PlayIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
}
function PauseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
}
function XIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
}
function CopyIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
}
function TranslateIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l6 6" /><path d="M4 14l6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="M22 22l-5-10-5 10" /><path d="M14 18h6" /></svg>
}
function Spinner() {
  return <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
}
