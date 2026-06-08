import React, { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function AdminPanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [pullModal, setPullModal] = useState(null) // lesson_id
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user?.is_admin) { navigate('/practice'); return }
    api.get('/admin/lessons')
      .then(d => setLessons(d.lessons || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user, navigate])

  async function pullLesson(lesson_id) {
    if (!feedback.trim()) return
    setSubmitting(true)
    try {
      await api.put(`/admin/lessons/${lesson_id}/pull`, { feedback })
      setLessons(prev => prev.map(l => l.lesson_id === lesson_id ? { ...l, status: 'pulled', admin_feedback: feedback } : l))
      setPullModal(null)
      setFeedback('')
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function restoreLesson(lesson_id) {
    try {
      await api.put(`/admin/lessons/${lesson_id}/restore`, {})
      setLessons(prev => prev.map(l => l.lesson_id === lesson_id ? { ...l, status: 'published', admin_feedback: '' } : l))
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full" /></div>

  const published = lessons.filter(l => l.status === 'published')
  const pulled = lessons.filter(l => l.status === 'pulled')

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Admin Panel</h1>

      <section>
        <h2 className="text-base font-medium text-gray-700 mb-3">Published Lessons ({published.length})</h2>
        <div className="space-y-2">
          {published.map(l => (
            <div key={l.lesson_id} className="card p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{l.title}</p>
                <p className="text-xs text-gray-500">{l.owner_email} · {l.sentence_count} sentences</p>
              </div>
              <button
                onClick={() => { setPullModal(l.lesson_id); setFeedback('') }}
                className="btn-danger text-xs py-1.5 px-3 shrink-0"
              >
                Pull
              </button>
            </div>
          ))}
          {published.length === 0 && <p className="text-gray-500 text-sm">No published lessons.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-base font-medium text-gray-700 mb-3">Pulled Lessons ({pulled.length})</h2>
        <div className="space-y-2">
          {pulled.map(l => (
            <div key={l.lesson_id} className="card p-4 border-red-200 bg-red-50">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{l.title}</p>
                  <p className="text-xs text-gray-500">{l.owner_email} · {l.sentence_count} sentences</p>
                  {l.admin_feedback && <p className="text-xs text-red-700 mt-1">Feedback: {l.admin_feedback}</p>}
                </div>
                <button
                  onClick={() => restoreLesson(l.lesson_id)}
                  className="btn-secondary text-xs py-1.5 px-3 shrink-0"
                >
                  Restore
                </button>
              </div>
            </div>
          ))}
          {pulled.length === 0 && <p className="text-gray-500 text-sm">No pulled lessons.</p>}
        </div>
      </section>

      {/* Pull modal */}
      {pullModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-900">Pull lesson</h3>
            <p className="text-sm text-gray-600">Provide feedback for the contributor:</p>
            <textarea
              rows={3}
              className="input resize-none"
              placeholder="e.g. Timestamps are incorrect, please fix sentences 3-5"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary text-sm" onClick={() => setPullModal(null)}>Cancel</button>
              <button className="btn-danger text-sm" onClick={() => pullLesson(pullModal)} disabled={submitting || !feedback.trim()}>
                {submitting ? 'Pulling…' : 'Pull Lesson'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
