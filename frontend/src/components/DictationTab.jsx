import React, { useState, useRef, useEffect, useCallback } from 'react'

// Strips all quote/apostrophe-like characters and common punctuation before comparison.
// This covers the full Unicode range of visually similar quote marks that transcription
// sources (YouTube captions, etc.) may use instead of a standard keyboard apostrophe.
const QUOTE_RE = /["'`«´»ʹʻʼʽʾʿˈˊˋʹ͵՚׳᾽᾿῀῾‘’‚‛“”„‟′″‵‶‹›❛❜❝❞＂＇｀]/g

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(QUOTE_RE, '')
    .replace(/[.,!?;:()[\]…]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Maps each normalized word index back to the original token for hint display.
// Hyphenated words expand to 2 normalized words, so we need this mapping.
function buildOriginalWordMap(text) {
  const result = []
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const normToken = normalize(token)
    const count = normToken ? normToken.split(' ').length : 1
    for (let i = 0; i < count; i++) result.push(token)
  }
  return result
}

// Returns the char position immediately after word at wordIdx (0-based) in the original string.
// Falls back to text.length when wordIdx exceeds the word count (used for 'missing' case).
function wordEndInOriginal(text, wordIdx) {
  let wCount = -1
  let i = 0
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (i >= text.length) break
    wCount++
    while (i < text.length && /\S/.test(text[i])) i++
    if (wCount === wordIdx) return i
  }
  return text.length
}

function checkAnswer(userInput, target) {
  const normUser = normalize(userInput)
  const normTarget = normalize(target)

  if (normUser === normTarget) return { correct: true }

  const userWords = normUser ? normUser.split(' ') : []
  const targetWords = normTarget ? normTarget.split(' ') : []
  const origWords = buildOriginalWordMap(target)

  for (let i = 0; i < Math.min(userWords.length, targetWords.length); i++) {
    if (userWords[i] !== targetWords[i]) {
      return { correct: false, hint: origWords[i] ?? targetWords[i], wordIdx: i, type: 'wrong' }
    }
  }

  if (userWords.length < targetWords.length) {
    return { correct: false, hint: origWords[userWords.length] ?? targetWords[userWords.length], wordIdx: userWords.length, type: 'missing' }
  }

  return { correct: false, hint: null, wordIdx: targetWords.length, type: 'extra' }
}

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

// Selectable replay shortcuts: value is the KeyboardEvent.key to match, label is shown in the UI.
const REPLAY_KEYS = [
  { value: 'Control', label: 'Ctrl' },
  { value: 'Shift', label: 'Shift' },
  { value: 'F2', label: 'F2' },
]
const REPLAY_KEY_STORAGE = 'replay_shortcut'

function loadReplayKey() {
  try {
    const v = localStorage.getItem(REPLAY_KEY_STORAGE)
    return REPLAY_KEYS.some(k => k.value === v) ? v : 'Control'
  } catch {
    return 'Control'
  }
}

export default function DictationTab({ sentences, initialSentence, onProgress, onComplete }) {
  const [idx, setIdx] = useState(initialSentence || 0)
  const [input, setInput] = useState('')
  const [state, setState] = useState('idle') // idle | correct | error
  const [hint, setHint] = useState('')
  const [hintType, setHintType] = useState('')
  const [showCongrats, setShowCongrats] = useState(false)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const [timeInput, setTimeInput] = useState('')
  const [replayKey, setReplayKey] = useState(loadReplayKey)
  const audioRef = useRef(null)
  const inputRef = useRef(null)
  const submitBtnRef = useRef(null)
  const stopAtRef = useRef(null)

  const sentence = sentences[idx]

  const playAudio = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !sentence) return
    stopAtRef.current = sentence.end
    audio.currentTime = sentence.start
    audio.play().catch(() => {})
  }, [sentence])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    function onTimeUpdate() {
      setAudioCurrentTime(audio.currentTime)
      if (stopAtRef.current !== null && audio.currentTime >= stopAtRef.current) {
        audio.pause()
        stopAtRef.current = null
      }
    }
    audio.addEventListener('timeupdate', onTimeUpdate)
    return () => audio.removeEventListener('timeupdate', onTimeUpdate)
  }, [])

  // Auto-play when sentence changes
  useEffect(() => {
    setInput('')
    setState('idle')
    setHint('')
    setShowCongrats(false)
    // Defer focus: setShowCongrats(false) hasn't re-rendered yet, textarea is still disabled
    setTimeout(() => inputRef.current?.focus(), 0)
    const audio = audioRef.current
    const s = sentences[idx]
    if (audio && s) {
      const t = setTimeout(() => {
        stopAtRef.current = s.end
        audio.currentTime = s.start
        audio.play().catch(() => {})
      }, 100)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  // Focus submit button when congrats shows so Enter advances to next sentence
  useEffect(() => {
    if (showCongrats) {
      submitBtnRef.current?.focus()
    }
  }, [showCongrats])

  // Replay shortcut (configurable: Ctrl / Shift / F2)
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === replayKey) {
        if (replayKey === 'F2') e.preventDefault()
        playAudio()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [playAudio, replayKey])

  function changeReplayKey(value) {
    setReplayKey(value)
    try {
      localStorage.setItem(REPLAY_KEY_STORAGE, value)
    } catch { /* setting just won't persist */ }
  }

  function seekToTime(time) {
    const audio = audioRef.current
    if (!audio) return
    const clamped = Math.max(0, Math.min(time, audioDuration))
    stopAtRef.current = null
    audio.currentTime = clamped
    const sentIdx = sentences.findIndex(s => clamped >= s.start && clamped < s.end)
    if (sentIdx !== -1 && sentIdx !== idx) {
      setIdx(sentIdx)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!sentence) return

    if (showCongrats) {
      const next = idx + 1
      if (next >= sentences.length) {
        onComplete?.()
      } else {
        setIdx(next)
        onProgress?.(next, false)
      }
      return
    }

    const result = checkAnswer(input, sentence.transcript)
    if (result.correct) {
      setState('correct')
      setShowCongrats(true)
      // Show the original source sentence in the input box; the answer card shows the translation
      setInput(sentence.transcript)
      onProgress?.(idx, idx === sentences.length - 1)
      return
    }

    setState('error')
    let nextInput = input
    if (result.type === 'wrong') {
      setHint(`Hint: "${result.hint}"`)
      setHintType('wrong')
    } else if (result.type === 'missing') {
      setHint(`Next word: "${result.hint}"`)
      setHintType('missing')
      // Append a trailing space so the user can type the next word right away
      if (nextInput && !/\s$/.test(nextInput)) {
        nextInput = `${nextInput} `
        setInput(nextInput)
      }
    } else {
      setHint('Too many words')
      setHintType('extra')
    }

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        const pos = result.type === 'missing'
          ? nextInput.length
          : wordEndInOriginal(nextInput, result.wordIdx)
        inputRef.current.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  if (!sentence) return null

  const pct = audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0

  return (
    <div className="flex gap-6 items-start">
      <audio
        ref={audioRef}
        src={sentence.audioUrl}
        preload="metadata"
        onLoadedMetadata={e => setAudioDuration(e.target.duration)}
        className="hidden"
      />

      {/* Left: audio controls */}
      <div className="w-1/2 space-y-4 shrink-0">
        {audioDuration > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="relative flex items-center gap-2">
              <span className="text-xs text-gray-400 font-mono w-14 text-right shrink-0">{formatTime(audioCurrentTime)}</span>
              <div className="relative flex-1 h-3 flex items-center">
                <div className="absolute inset-x-0 h-1.5 bg-gray-200 rounded-full" />
                <div
                  className="absolute left-0 h-1.5 bg-primary-500 rounded-full pointer-events-none"
                  style={{ width: `${pct}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={audioDuration || 1}
                  step={0.1}
                  value={audioCurrentTime}
                  onChange={e => seekToTime(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                />
              </div>
              <span className="text-xs text-gray-400 font-mono w-14 shrink-0">{formatTime(audioDuration)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Jump to:</span>
              <input
                type="text"
                value={timeInput}
                onChange={e => setTimeInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const t = parseTimeInput(timeInput)
                    if (t !== null) { seekToTime(t); setTimeInput('') }
                  }
                }}
                placeholder="1:30"
                className="input text-xs py-1 px-2 w-20 font-mono"
                title="Nhập thời điểm (vd: 1:30 hoặc 90) và nhấn Enter"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={playAudio}
            className="btn-primary gap-2"
            title={`Replay (or press ${REPLAY_KEYS.find(k => k.value === replayKey)?.label})`}
          >
            <ReplayIcon />
            Replay
            <span className="text-xs opacity-70">{REPLAY_KEYS.find(k => k.value === replayKey)?.label}</span>
          </button>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            Shortcut:
            <select
              value={replayKey}
              onChange={e => changeReplayKey(e.target.value)}
              className="input text-xs py-1 px-2 w-auto"
              title="Keyboard shortcut for Replay"
            >
              {REPLAY_KEYS.map(k => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Right: practice area */}
      <div className="flex-1 space-y-4">
        {/* Sentence progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((idx / sentences.length) * 100)}%` }}
            />
          </div>
          <span className="text-sm text-gray-500 shrink-0">{idx + 1} / {sentences.length}</span>
        </div>

        {/* Input area */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => { setInput(e.target.value); setState('idle'); setHint('') }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            rows={2}
            className={`input resize-none text-base font-mono transition-colors ${
              state === 'correct' ? 'border-green-400 bg-green-50' :
              state === 'error' ? 'border-red-300 bg-red-50' : ''
            }`}
            placeholder="Type what you hear… (Enter to check)"
            disabled={showCongrats}
          />

          {hint && (
            <p className={`text-sm px-3 py-2 rounded-lg ${
              hintType === 'wrong' ? 'bg-amber-50 text-amber-800' :
              hintType === 'missing' ? 'bg-blue-50 text-blue-800' :
              'bg-red-50 text-red-800'
            }`}>
              {hint}
            </p>
          )}

          {showCongrats && (
            <div className="card p-4 border-green-200 bg-green-50 space-y-2">
              <p className="font-medium text-green-800">Correct!</p>
              {sentence.translation && (
                <p className="text-sm text-gray-500 italic">{sentence.translation}</p>
              )}
              <p className="text-xs text-gray-400">Press Enter to continue</p>
            </div>
          )}

          <button ref={submitBtnRef} type="submit" className="btn-primary w-full">
            {showCongrats ? (idx === sentences.length - 1 ? 'Finish' : 'Next →') : 'Check (Enter)'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ReplayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
    </svg>
  )
}
