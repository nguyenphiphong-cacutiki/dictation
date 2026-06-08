import React, { useState, useRef, useEffect } from 'react'

export default function TranscriptTab({ sentences, audioUrl }) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef(null)
  const activeSentenceRef = useRef(null)

  const activeSentenceIdx = sentences.findIndex(
    s => currentTime >= s.start && currentTime < s.end
  )

  useEffect(() => {
    if (activeSentenceRef.current) {
      activeSentenceRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeSentenceIdx])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else audio.play()
  }

  function seek(start) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = start
    audio.play()
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60)
    const s = (sec % 60).toFixed(1).padStart(4, '0')
    return `${m}:${s}`
  }

  return (
    <div className="space-y-4">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        preload="metadata"
        className="hidden"
      />

      <div className="flex items-center gap-3">
        <button onClick={togglePlay} className="btn-primary gap-2">
          {playing ? <PauseIcon /> : <PlayIcon />}
          {playing ? 'Pause' : 'Play'}
        </button>
        {currentTime > 0 && (
          <span className="text-sm text-gray-500">{formatTime(currentTime)}</span>
        )}
      </div>

      <div className="space-y-1">
        {sentences.map((s, i) => {
          const isActive = i === activeSentenceIdx
          return (
            <div
              key={i}
              ref={isActive ? activeSentenceRef : null}
              onClick={() => seek(s.start)}
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
