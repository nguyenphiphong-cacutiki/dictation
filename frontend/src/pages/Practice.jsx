import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import LessonCard from '../components/LessonCard'

export default function Practice() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/lessons')
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full" /></div>
  if (error) return <p className="text-red-600 py-8 text-center">{error}</p>

  const myLessons = data?.my_lessons || []
  const community = data?.community || []

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">My Lessons</h2>
          <button className="btn-primary text-sm py-1.5" onClick={() => navigate('/create')}>
            + New Lesson
          </button>
        </div>

        {myLessons.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">
            <p className="text-3xl mb-2">📝</p>
            <p>No lessons yet. Create your first one!</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {myLessons.map(lesson => (
              <LessonCard
                key={lesson.lesson_id}
                lesson={lesson}
                pulled={lesson.status === 'pulled'}
              />
            ))}
          </div>
        )}
      </section>

      {community.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Community Lessons</h2>
          <div className="space-y-6">
            {community.map(group => (
              <div key={group.owner_email}>
                <p className="text-sm font-medium text-gray-500 mb-2">{group.owner_email}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.lessons.map(lesson => (
                    <LessonCard key={lesson.lesson_id} lesson={lesson} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
