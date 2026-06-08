import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Practice from './pages/Practice'
import PracticeSession from './pages/PracticeSession'
import CreateLesson from './pages/CreateLesson'
import AdminPanel from './pages/AdminPanel'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full" /></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/practice" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/practice" replace />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/practice/:id" element={<PracticeSession />} />
          <Route path="/create" element={<CreateLesson />} />
          <Route path="/create/:id" element={<CreateLesson />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Route>
        <Route path="*" element={<Navigate to="/practice" replace />} />
      </Routes>
    </AuthProvider>
  )
}
