import React, { createContext, useContext, useState, useEffect } from 'react'

const _API_BASE = import.meta.env.VITE_API_URL || '/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const stored = localStorage.getItem('user')
    if (token && stored) {
      try {
        setUser(JSON.parse(stored))
      } catch {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    }
    setLoading(false)
  }, [])

  // End session on tab close / page unload
  useEffect(() => {
    function handleUnload() {
      const sessionId = localStorage.getItem('session_id')
      const sessionStart = parseInt(localStorage.getItem('session_start') || '0')
      if (!sessionId) return
      const duration = Math.floor((Date.now() - sessionStart) / 1000)
      const payload = JSON.stringify({ duration_seconds: duration })
      navigator.sendBeacon(
        `${_API_BASE}/sessions/${sessionId}/end`,
        new Blob([payload], { type: 'application/json' })
      )
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  function login(token, userData, sessionId) {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    localStorage.setItem('session_start', Date.now().toString())
    if (sessionId) localStorage.setItem('session_id', sessionId)
    setUser(userData)
  }

  function logout() {
    const sessionId = localStorage.getItem('session_id')
    const sessionStart = parseInt(localStorage.getItem('session_start') || '0')
    if (sessionId) {
      const duration = Math.floor((Date.now() - sessionStart) / 1000)
      const payload = JSON.stringify({ duration_seconds: duration })
      try {
        navigator.sendBeacon(
          `${_API_BASE}/sessions/${sessionId}/end`,
          new Blob([payload], { type: 'application/json' })
        )
      } catch { /* best-effort */ }
    }
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('session_id')
    localStorage.removeItem('session_start')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
