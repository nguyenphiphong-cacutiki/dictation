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

function parseTime(str) {
  if (!str) return 0
  const [ms, ...rest] = str.split('.').reverse()
  const parts = rest.reverse()
  const seconds = parseFloat(parts.join(':').replace(/:/g, (_, i, a) => i === a.length - 1 ? '.' : ':') || '0')
  const [m, s] = parts.length >= 2 ? [parseInt(parts[0]), parseFloat(parts[1])] : [0, parseFloat(parts[0] || '0')]
  const millis = ms ? parseFloat(`0.${ms}`) : 0
  return m * 60 + s + millis
}

function toSeconds(timeStr) {
  if (!timeStr) return 0
  const [msPart, ...rest] = timeStr.split('.').reverse()
  const timePart = rest.reverse().join('.')
  const [min, sec] = timePart.includes(':') ? timePart.split(':').map(Number) : [0, parseFloat(timePart || '0')]
  const ms = msPart ? parseFloat(`0.${msPart}`) : 0
  return min * 60 + (sec || 0) + ms
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
  const stopAtRef = useRef(null)
  const fileInputRef = useRef(null)

  // Load existing lesson for edit
  useEffect(() => {
    if (!editId) return
    api.get(`/lessons/${editId}`).then(data => {
      setTitle(data.title || '')
      setSentences(data.sentences?.length ? data.sentences.map(s => ({ ...s, id: s.id || Math.random().toString(36).slice(2) })) : [EMPTY_SENTENCE()])
      setAudioKey(data.audio_key || '')
      if (data.audio_url) setAudioObjectUrl(data.audio_url)
    }).catch(() => {})
  }, [editId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    function check() {
      if (stopAtRef.current !== null && audio.currentTime >= stopAtRef.current) {
        audio.pause()
        stopAtRef.current = null
      }
    }
    audio.addEventListener('timeupdate', check)
    return () => audio.removeEventListener('timeupdate', check)
  }, [])

  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setAudioFile(file)
    const objUrl = URL.createObjectURL(file)
    setAudioObjectUrl(objUrl)
    setAudioKey('')

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

  async function handleSave() {
    if (!title.trim()) return setError('Title is required')
    if (!audioKey) return setError(uploading ? 'Wait for audio upload to finish' : 'Please upload an audio file')
    const cleanedSentences = sentences.map(({ id, ...s }) => s)

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
    setError('')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">{editId ? 'Edit Lesson' : 'Create Lesson'}</h1>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Lesson Title</label>
        <input className="input" placeholder="e.g. BBC News - Climate Report" value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      {/* Audio Upload */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary text-sm"
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : audioObjectUrl ? 'Replace Audio' : 'Upload Audio'}
          </button>
          {uploading && <span className="text-sm text-gray-500 animate-pulse">Uploading to S3…</span>}
          {audioKey && !uploading && <span className="text-sm text-green-600">Audio ready</span>}
          <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
        </div>

        {audioObjectUrl && (
          <div className="flex items-center gap-3">
            <audio
              ref={audioRef}
              src={audioObjectUrl}
              onPlay={() => setMainPlaying(true)}
              onPause={() => setMainPlaying(false)}
              onEnded={() => setMainPlaying(false)}
              preload="metadata"
              className="hidden"
            />
            <button onClick={toggleMain} className="btn-primary gap-2 text-sm py-1.5">
              {mainPlaying ? <PauseIcon /> : <PlayIcon />}
              {mainPlaying ? 'Pause' : 'Play'}
            </button>
            <span className="text-xs text-gray-400">{audioFile?.name || 'Loaded audio'}</span>
          </div>
        )}
      </div>

      {/* Sentences */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">Sentences ({sentences.length})</h2>
          <button onClick={addSentence} className="btn-primary text-sm py-1.5 gap-1">
            <span>+</span> Add Sentence
          </button>
        </div>

        {sentences.map((s, idx) => (
          <div key={s.id} className="card p-3 space-y-2">
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
                  onChange={e => {
                    updateSentence(idx, 'end', e.target.value)
                    // Auto-fill next sentence start
                    setSentences(prev => prev.map((sent, i) => i === idx + 1 && !sent.start ? { ...sent, start: e.target.value } : sent))
                  }}
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
              <div className="flex flex-col gap-1">
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

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3">
        <button onClick={handleSave} className="btn-primary flex-1" disabled={saving || uploading}>
          {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Lesson'}
        </button>
        {!editId && (
          <button onClick={handleReset} className="btn-secondary">
            Reset
          </button>
        )}
        <button onClick={() => navigate('/practice')} className="btn-secondary">
          Cancel
        </button>
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
