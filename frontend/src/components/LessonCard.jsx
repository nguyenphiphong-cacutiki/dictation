import React from 'react'
import { useNavigate } from 'react-router-dom'

function StarIcon({ count }) {
  const color =
    count === 0 ? '#d1d5db' :
    count <= 2  ? '#f59e0b' :
    count <= 5  ? '#eab308' :
    count <= 10 ? '#facc15' :
                  '#a855f7'

  const size = count === 0 ? 16 : Math.min(16 + count, 24)

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} title={`Practiced ${count} time${count !== 1 ? 's' : ''}`}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

export default function LessonCard({ lesson, pulled }) {
  const navigate = useNavigate()
  const progress = lesson.progress || { current_sentence: 0, practice_count: 0 }

  const progressPct = lesson.sentence_count > 0
    ? Math.round((progress.current_sentence / lesson.sentence_count) * 100)
    : 0

  return (
    <div
      onClick={() => navigate(`/practice/${lesson.lesson_id}`)}
      className={`card p-4 cursor-pointer hover:shadow-md hover:border-primary-200 transition-all ${
        pulled ? 'border-red-200 bg-red-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{lesson.title}</h3>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span>{lesson.sentence_count} sentences</span>
            {progress.current_sentence > 0 && (
              <span className="text-primary-600">{progressPct}% done</span>
            )}
          </div>

          {pulled && lesson.admin_feedback && (
            <p className="mt-2 text-xs text-red-600 bg-red-100 rounded px-2 py-1">
              Admin: {lesson.admin_feedback}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <StarIcon count={progress.practice_count} />
          {progress.practice_count > 0 && (
            <span className="text-xs text-gray-400">{progress.practice_count}</span>
          )}
        </div>
      </div>

      {progress.current_sentence > 0 && progress.current_sentence < lesson.sentence_count && (
        <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  )
}
