import React, { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(secs) {
  if (!secs || secs <= 0) return '—'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTs(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

// ─── Lessons Tab ─────────────────────────────────────────────────────────────

function LessonsTab() {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [pullModal, setPullModal] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.get('/admin/lessons')
      .then(d => setLessons(d.lessons || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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

  if (loading) return <Spinner />

  const published = lessons.filter(l => l.status === 'published')
  const pulled = lessons.filter(l => l.status === 'pulled')

  return (
    <div className="space-y-6">
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
                <button onClick={() => restoreLesson(l.lesson_id)} className="btn-secondary text-xs py-1.5 px-3 shrink-0">
                  Restore
                </button>
              </div>
            </div>
          ))}
          {pulled.length === 0 && <p className="text-gray-500 text-sm">No pulled lessons.</p>}
        </div>
      </section>

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

// ─── Users Tab ───────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedUser, setExpandedUser] = useState(null)
  const [userDetail, setUserDetail] = useState({}) // { [user_id]: { sessions, lessons, loading } }

  useEffect(() => {
    api.get('/admin/users')
      .then(d => setUsers(d.users || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = users.filter(u =>
    !search || u.email.toLowerCase().includes(search.toLowerCase())
  )

  async function toggleUser(user_id) {
    if (expandedUser === user_id) {
      setExpandedUser(null)
      return
    }
    setExpandedUser(user_id)
    if (userDetail[user_id]) return

    setUserDetail(prev => ({ ...prev, [user_id]: { loading: true } }))
    try {
      const [sessRes, lesRes] = await Promise.all([
        api.get(`/admin/users/${user_id}/sessions`),
        api.get(`/admin/users/${user_id}/lessons`),
      ])
      setUserDetail(prev => ({
        ...prev,
        [user_id]: { sessions: sessRes.sessions || [], lessons: lesRes.lessons || [], loading: false },
      }))
    } catch {
      setUserDetail(prev => ({ ...prev, [user_id]: { sessions: [], lessons: [], loading: false } }))
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search by email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="input"
      />

      <p className="text-xs text-gray-500">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</p>

      <div className="space-y-2">
        {filtered.map(u => {
          const isExpanded = expandedUser === u.user_id
          const detail = userDetail[u.user_id]

          return (
            <div key={u.user_id} className="card overflow-hidden">
              {/* User row */}
              <button
                onClick={() => toggleUser(u.user_id)}
                className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{u.email}</span>
                      {u.is_admin && (
                        <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-medium">Admin</span>
                      )}
                    </div>
                    <div className="flex gap-4 mt-0.5 text-xs text-gray-500 flex-wrap">
                      <span>Joined {formatTs(u.created_at)}</span>
                      <span>Total: {formatDuration(u.total_seconds)}</span>
                    </div>
                  </div>
                  <ChevronIcon open={isExpanded} />
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50">
                  {detail?.loading ? (
                    <Spinner />
                  ) : (
                    <>
                      {/* Sessions */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                          Sessions ({detail?.sessions?.length || 0})
                        </h4>
                        {detail?.sessions?.length > 0 ? (
                          <div className="space-y-1">
                            {detail.sessions.map(s => (
                              <div key={s.session_id} className="flex items-center gap-3 text-xs text-gray-600 bg-white rounded px-3 py-2 border border-gray-100">
                                <span className="font-mono shrink-0">{formatTs(s.login_at)}</span>
                                <span className="text-gray-400">→</span>
                                <span className="font-mono shrink-0">{s.logout_at ? formatTs(s.logout_at) : <span className="text-green-600">active</span>}</span>
                                <span className="ml-auto shrink-0 text-gray-500">{formatDuration(s.duration_seconds)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">No sessions yet.</p>
                        )}
                      </div>

                      {/* Lessons */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                          Lessons ({detail?.lessons?.length || 0})
                        </h4>
                        {detail?.lessons?.length > 0 ? (
                          <div className="space-y-1">
                            {detail.lessons.map(l => (
                              <div key={l.lesson_id} className="flex items-center gap-3 text-xs bg-white rounded px-3 py-2 border border-gray-100">
                                <span className="font-medium text-gray-800 flex-1 truncate">{l.title}</span>
                                <span className="text-gray-400 shrink-0">{l.sentence_count} sentences</span>
                                <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                                  l.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>{l.status}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">No lessons yet.</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && <p className="text-gray-500 text-sm">No users found.</p>}
      </div>
    </div>
  )
}

// ─── About Tab ───────────────────────────────────────────────────────────────

function AboutTab() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get('/about')
      .then(d => setContent(d.content || ''))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      await api.put('/admin/about', { content })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setContent(ev.target.result || '')
    reader.readAsText(file)
    e.target.value = ''
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="btn-secondary text-sm cursor-pointer">
          Upload HTML file
          <input type="file" accept=".html,.htm" className="hidden" onChange={handleFileUpload} />
        </label>
        <button
          onClick={() => setPreview(p => !p)}
          className="btn-secondary text-sm"
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary text-sm"
        >
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {preview ? (
        <div className="card p-6 min-h-64">
          {content ? (
            <div className="about-content" dangerouslySetInnerHTML={{ __html: content }} />
          ) : (
            <p className="text-gray-400 text-sm">No content to preview.</p>
          )}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={20}
          className="input resize-y font-mono text-sm"
          placeholder="Paste or type HTML content here…"
          spellCheck={false}
        />
      )}
    </div>
  )
}

// ─── Main AdminPanel ──────────────────────────────────────────────────────────

const TABS = ['Lessons', 'Users', 'About']

export default function AdminPanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState(0)

  useEffect(() => {
    if (!user?.is_admin) navigate('/practice')
  }, [user, navigate])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Admin Panel</h1>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((label, i) => (
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

      {tab === 0 && <LessonsTab />}
      {tab === 1 && <UsersTab />}
      {tab === 2 && <AboutTab />}
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full" />
    </div>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
