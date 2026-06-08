import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import DictationTab from '../components/DictationTab'
import TranscriptTab from '../components/TranscriptTab'

export default function PracticeSession() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lesson, setLesson] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState(0)
  const [completed, setCompleted] = useState(false)
  const progressRef = useRef({ current_sentence: 0, practice_count: 0 })

  useEffect(() => {
    api.get(`/lessons/${id}`)
      .then(data => {
        setLesson(data)
        progressRef.current = data.progress || { current_sentence: 0, practice_count: 0 }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleProgress(sentenceIdx, isLastSentence) {
    // When completing the last sentence: increment practice count and reset position to 0
    const body = {
      current_sentence: isLastSentence ? 0 : sentenceIdx,
      increment_practice: isLastSentence,
    }
    try {
      const data = await api.put(`/progress/${id}`, body)
      progressRef.current = data
    } catch { /* progress save is best-effort */ }
  }

  function handleComplete() {
    setCompleted(true)
  }

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full" /></div>
  if (error) return <p className="text-red-600 py-8 text-center">{error}</p>
  if (!lesson) return null

  const sentences = (lesson.sentences || []).map(s => ({
    ...s,
    start: parseFloat(s.start) || 0,
    end: parseFloat(s.end) || 0,
    audioUrl: lesson.audio_url,
  }))

  if (completed) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <div className="text-6xl">🏆</div>
        <h2 className="text-2xl font-bold text-gray-900">Lesson Complete!</h2>
        <p className="text-gray-600">You&apos;ve finished &ldquo;<strong>{lesson.title}</strong>&rdquo;</p>
        <div className="flex gap-3 justify-center mt-6">
          <button className="btn-secondary" onClick={() => navigate('/practice')}>Back to lessons</button>
          <button className="btn-primary" onClick={() => { setCompleted(false); setTab(0) }}>Practice again</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/practice')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <BackIcon />
        </button>
        <h1 className="text-xl font-semibold text-gray-900 truncate">{lesson.title}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {['Dictation', 'Full Transcript'].map((label, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === i
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 0 && sentences.length > 0 && (
        <DictationTab
          sentences={sentences}
          initialSentence={progressRef.current.current_sentence || 0}
          onProgress={handleProgress}
          onComplete={handleComplete}
        />
      )}

      {tab === 1 && (
        <TranscriptTab sentences={sentences} audioUrl={lesson.audio_url} />
      )}

      {sentences.length === 0 && (
        <p className="text-gray-500 text-center py-8">This lesson has no sentences yet.</p>
      )}
    </div>
  )
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
