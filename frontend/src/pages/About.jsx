import React, { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function About() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/about')
      .then(d => setContent(d.content || ''))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!content) {
    return (
      <div className="text-center py-16 text-gray-400">
        No content yet. Admin can add content from the Admin Panel.
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div
        className="about-content"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  )
}
