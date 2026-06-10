import React, { useState, useRef, useEffect } from 'react'

function formatTime(sec) {
  if (!sec || isNaN(sec) || sec < 0) return '0:00.0'
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function parseTimeInput(str) {
  const trimmed = (str || '').trim()
  if (!trimmed) return null
  if (trimmed.includes(':')) {
    const [mStr, sStr] = trimmed.split(':')
    const m = parseInt(mStr) || 0
    const s = parseFloat(sStr) || 0
    return m * 60 + s
  }
  const t = parseFloat(trimmed)
  return isNaN(t) ? null : t
}

export default function TranscriptTab({ sentences, audioUrl }) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [seekInput, setSeekInput] = useState('')
  const audioRef = useRef(null)
  const activeSentenceRef = useRef(null)
  const sentencesContainerRef = useRef(null)

  const activeSentenceIdx = sentences.findIndex(
    s => currentTime >= s.start && currentTime < s.end
  )

  useEffect(() => {
    if (activeSentenceRef.current && sentencesContainerRef.current) {
      activeSentenceRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeSentenceIdx])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else audio.play()
  }

  function seekTo(time) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(time, duration))
    if (!playing) audio.play()
  }

  function handleSliderChange(e) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = parseFloat(e.target.value)
  }

  function handleSeekInputKeyDown(e) {
    if (e.key === 'Enter') {
      const t = parseTimeInput(seekInput)
      if (t !== null) {
        seekTo(t)
        setSeekInput('')
      }
    }
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex gap-6 items-start">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        preload="metadata"
        className="hidden"
      />

      {/* Left: audio controls */}
      <div className="w-1/2 shrink-0">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          {/* Seek slider */}
          <div className="relative flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono w-14 text-right shrink-0">{formatTime(currentTime)}</span>
            <div className="relative flex-1 h-3 flex items-center">
              <div className="absolute inset-x-0 h-1.5 bg-gray-200 rounded-full" />
              <div
                className="absolute left-0 h-1.5 bg-primary-500 rounded-full pointer-events-none"
                style={{ width: `${pct}%` }}
              />
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={currentTime}
                onChange={handleSliderChange}
                className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
              />
            </div>
            <span className="text-xs text-gray-400 font-mono w-14 shrink-0">{formatTime(duration)}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={togglePlay} className="btn-primary gap-2 shrink-0">
              {playing ? <PauseIcon /> : <PlayIcon />}
              {playing ? 'Pause' : 'Play'}
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Jump to:</span>
              <input
                type="text"
                value={seekInput}
                onChange={e => setSeekInput(e.target.value)}
                onKeyDown={handleSeekInputKeyDown}
                placeholder="1:30"
                className="input text-sm py-1 px-2 w-20 font-mono"
                title="Nhập thời điểm (vd: 1:30 hoặc 90) và nhấn Enter"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right: sentences with independent scroll */}
      <div
        ref={sentencesContainerRef}
        className="flex-1 overflow-y-auto space-y-1 pr-1"
        style={{ maxHeight: 'calc(100vh - 200px)' }}
      >
        {sentences.map((s, i) => {
          const isActive = i === activeSentenceIdx
          return (
            <div
              key={i}
              ref={isActive ? activeSentenceRef : null}
              onClick={() => seekTo(s.start)}
              className={`px-4 py-3 rounded-lg cursor-pointer transition-all ${
                isActive
                  ? 'bg-primary-100 border border-primary-300'
                  : 'hover:bg-gray-100'
              }`}
            >
              <div className="flex items-baseline gap-3">
                <span className="text-xs text-gray-400 shrink-0 font-mono">{formatTime(s.start)}</span>
                <p className={`text-sm leading-relaxed ${isActive ? 'text-primary-800 font-medium' : 'text-gray-700'}`}>
                  {s.transcript}
                </p>
              </div>
              {s.translation && (
                <p className="text-xs text-gray-500 mt-0.5 ml-12 italic">{s.translation}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  )
}
