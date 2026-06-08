import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('email') // 'email' | 'otp'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  async function sendOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/request-otp', { email: email.trim().toLowerCase() })
      setStep('otp')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.post('/auth/verify-otp', { email: email.trim().toLowerCase(), code: otp.trim() })
      login(data.token, data.user)
      navigate('/practice')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🎧</div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Dictation</h1>
          <p className="text-sm text-gray-500 mt-1">Practice English listening & writing</p>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-4">
            <p className="text-sm text-gray-600 text-center">
              We sent a 6-digit code to <strong>{email}</strong>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">OTP Code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                className="input text-center text-xl tracking-widest font-mono"
                placeholder="123456"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                required
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="w-full text-sm text-gray-500 hover:text-gray-700"
              onClick={() => { setStep('email'); setOtp(''); setError('') }}
            >
              Change email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
