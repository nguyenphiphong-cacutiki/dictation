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
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.round((sec % 1) * 1000)
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
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

export default function CreateLesson() {
  const { id: editId } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [sentences, setSentences] = useState([EMPTY_SENTENCE()])
  const [audioFile, setAudioFile] = useState(null)
  const [audioKey, setAudioKey] = useState('')
  const [audioObjectUrl, setAudioObjectUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const audioRef = useRef(null)
  const [mainPlaying, setMainPlaying] = useState(false)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const [seekInput, setSeekInput] = useState('')
  const stopAtRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!editId) return
    api.get(`/lessons/${editId}`).then(data => {
      setTitle(data.title || '')
      setSentences(data.sentences?.length
        ? data.sentences.map(s => ({ ...s, id: s.id || Math.random().toString(36).slice(2) }))
        : [EMPTY_SENTENCE()])
      setAudioKey(data.audio_key || '')
      if (data.audio_url) setAudioObjectUrl(data.audio_url)
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

  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setAudioFile(file)
    const objUrl = URL.createObjectURL(file)
    setAudioObjectUrl(objUrl)
    setAudioKey('')
    setAudioDuration(0)
    setAudioCurrentTime(0)
    setUploading(true)
    setError('')
    try {
      const { upload_url, audio_key } = await api.post('/audio/upload-url', { content_type: file.type })
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      setAudioKey(audio_key)
    } catch (err) {
      setError('Audio upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  function addSentence() {
    const last = sentences[sentences.length - 1]
    setSentences(prev => [...prev, EMPTY_SENTENCE(last?.end || '00:00.000')])
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
    if (!audioKey) return setError(uploading ? 'Wait for audio upload to finish' : 'Please upload an audio file')
    const cleanedSentences = sentences.map(({ id: _id, ...s }) => s)
    setSaving(true)
    setError('')
    try {
      if (editId) {
        await api.put(`/lessons/${editId}`, { title, sentences: cleanedSentences, audio_key: audioKey })
      } else {
        await api.post('/lessons', { title, sentences: cleanedSentences, audio_key: audioKey })
      }
      navigate('/practice')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setTitle('')
    setSentences([EMPTY_SENTENCE()])
    setAudioFile(null)
    setAudioKey('')
    if (audioObjectUrl && !editId) URL.revokeObjectURL(audioObjectUrl)
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
          <button onClick={handleSave} className="btn-primary text-sm" disabled={saving || uploading}>
            {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Lesson'}
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
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : audioObjectUrl ? 'Replace Audio' : 'Upload Audio'}
              </button>
              {uploading && (
                <span className="text-sm text-gray-500 animate-pulse">Uploading to S3…</span>
              )}
              {audioKey && !uploading && (
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
              <div className="flex justify-between text-xs font-mono px-0.5">
                <span className="text-primary-600 font-semibold">{formatTime(audioCurrentTime)}</span>
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
            <button onClick={addSentence} className="btn-primary text-sm py-1.5">
              + Add Sentence
            </button>
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
                    <input
                      className="input text-sm"
                      placeholder="Translation (optional)"
                      value={s.translation}
                      onChange={e => updateSentence(idx, 'translation', e.target.value)}
                    />
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
