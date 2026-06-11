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
  const [sentenceMode, setSentenceMode] = useState(false)
  const [sentenceIdx, setSentenceIdx] = useState(0)

  const audioRef = useRef(null)
  const activeSentenceRef = useRef(null)
  const sentencesContainerRef = useRef(null)
  const stopAtRef = useRef(null)
  // Mirrors sentenceIdx so event handlers always see the current value
  const sentenceIdxRef = useRef(0)

  useEffect(() => {
    sentenceIdxRef.current = sentenceIdx
  }, [sentenceIdx])

  const activeSentenceIdx = sentenceMode
    ? sentenceIdx
    : sentences.findIndex(s => currentTime >= s.start && currentTime < s.end)

  useEffect(() => {
    if (activeSentenceRef.current && sentencesContainerRef.current) {
      activeSentenceRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeSentenceIdx])

  function handleTimeUpdate(e) {
    const t = e.target.currentTime
    setCurrentTime(t)
    if (stopAtRef.current !== null && t >= stopAtRef.current) {
      stopAtRef.current = null
      const next = sentenceIdxRef.current + 1
      if (next < sentences.length) {
        setSentenceIdx(next)
        sentenceIdxRef.current = next
        e.target.currentTime = sentences[next].start
        stopAtRef.current = sentences[next].end
        // audio keeps playing from new position
      } else {
        e.target.pause()
      }
    }
  }

  function playSentenceAt(idx) {
    const audio = audioRef.current
    if (!audio || idx >= sentences.length) return
    stopAtRef.current = sentences[idx].end
    audio.currentTime = sentences[idx].start
    audio.play()
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      stopAtRef.current = null
    } else {
      if (sentenceMode) playSentenceAt(sentenceIdx)
      else audio.play()
    }
  }

  function seekTo(time) {
    const audio = audioRef.current
    if (!audio) return
    stopAtRef.current = null
    audio.currentTime = Math.max(0, Math.min(time, duration))
    if (!playing) audio.play()
  }

  function handleSentenceClick(idx) {
    if (sentenceMode) {
      setSentenceIdx(idx)
      sentenceIdxRef.current = idx
      playSentenceAt(idx)
    } else {
      seekTo(sentences[idx].start)
    }
  }

  function stepSentence(delta) {
    const audio = audioRef.current
    if (audio) { audio.pause(); stopAtRef.current = null }
    setSentenceIdx(prev => {
      const next = Math.max(0, Math.min(sentences.length - 1, prev + delta))
      sentenceIdxRef.current = next
      return next
    })
  }

  function handleSliderChange(e) {
    const audio = audioRef.current
    if (!audio) return
    stopAtRef.current = null
    audio.currentTime = parseFloat(e.target.value)
  }

  function handleSeekInputKeyDown(e) {
    if (e.key === 'Enter') {
      const t = parseTimeInput(seekInput)
      if (t !== null) { seekTo(t); setSeekInput('') }
    }
  }

  function toggleSentenceMode() {
    const audio = audioRef.current
    if (audio && playing) { audio.pause(); stopAtRef.current = null }
    setSentenceMode(prev => {
      if (!prev) {
        const idx = Math.max(0, sentences.findIndex(s => currentTime >= s.start && currentTime < s.end))
        setSentenceIdx(idx)
        sentenceIdxRef.current = idx
      }
      return !prev
    })
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex gap-6 items-start">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); stopAtRef.current = null }}
        preload="metadata"
        className="hidden"
      />

      {/* Left: audio controls */}
      <div className="w-1/2 shrink-0">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">

          {/* Seek slider — always visible for position reference */}
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

          {/* Controls row */}
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={togglePlay} className="btn-primary gap-2 shrink-0">
              {playing ? <PauseIcon /> : <PlayIcon />}
              {playing ? 'Pause' : 'Play'}
            </button>

            {sentenceMode ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => stepSentence(-1)}
                  disabled={sentenceIdx === 0}
                  className="btn-secondary text-sm py-1 px-2.5 disabled:opacity-40"
                >
                  ‹ Prev
                </button>
                <span className="text-xs text-gray-500 tabular-nums">
                  {sentenceIdx + 1} / {sentences.length}
                </span>
                <button
                  onClick={() => stepSentence(1)}
                  disabled={sentenceIdx === sentences.length - 1}
                  className="btn-secondary text-sm py-1 px-2.5 disabled:opacity-40"
                >
                  Next ›
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Jump to:</span>
                <input
                  type="text"
                  value={seekInput}
                  onChange={e => setSeekInput(e.target.value)}
                  onKeyDown={handleSeekInputKeyDown}
                  placeholder="1:30"
                  className="input text-sm py-1 px-2 w-20 font-mono"
                  title="Enter a time (e.g. 1:30 or 90) and press Enter"
                />
              </div>
            )}

            {/* Mode toggle */}
            <button
              onClick={toggleSentenceMode}
              className={`ml-auto text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                sentenceMode
                  ? 'bg-primary-100 border-primary-300 text-primary-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              title={sentenceMode ? 'Switch to full audio' : 'Switch to sentence-by-sentence'}
            >
              {sentenceMode ? <><SentenceIcon /> Sentence</>  : <><AudioIcon /> Full Audio</>}
            </button>
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
              onClick={() => handleSentenceClick(i)}
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
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
}
function PauseIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
}
function AudioIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-1">
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  )
}
function SentenceIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-1">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" />
    </svg>
  )
}
