// Covers frontend/src/components/LessonCard.jsx — display states and navigation.
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import LessonCard from '@src/components/LessonCard'

function PracticeProbe() {
  return <div>PRACTICE-{useParams().id}</div>
}
function CreateProbe() {
  return <div>CREATE-{useParams().id}</div>
}

function renderCard(props) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LessonCard {...props} />} />
        <Route path="/practice/:id" element={<PracticeProbe />} />
        <Route path="/create/:id" element={<CreateProbe />} />
      </Routes>
    </MemoryRouter>
  )
}

const baseLesson = {
  lesson_id: 'l1',
  title: 'BBC News',
  sentence_count: 10,
  status: 'published',
  admin_feedback: '',
}

it('renders title and sentence count', () => {
  renderCard({ lesson: baseLesson })
  expect(screen.getByText('BBC News')).toBeInTheDocument()
  expect(screen.getByText('10 sentences')).toBeInTheDocument()
})

it('hides progress percentage when nothing is done', () => {
  renderCard({ lesson: baseLesson })
  expect(screen.queryByText(/% done/)).not.toBeInTheDocument()
})

it('shows progress percentage and bar when in progress', () => {
  const lesson = { ...baseLesson, progress: { current_sentence: 5, practice_count: 0 } }
  const { container } = renderCard({ lesson })
  expect(screen.getByText('50% done')).toBeInTheDocument()
  expect(container.querySelector('.bg-primary-500')).toBeInTheDocument()
})

it('hides the progress bar once the lesson is fully done', () => {
  const lesson = { ...baseLesson, progress: { current_sentence: 10, practice_count: 0 } }
  const { container } = renderCard({ lesson })
  expect(screen.getByText('100% done')).toBeInTheDocument()
  expect(container.querySelector('.bg-primary-500')).not.toBeInTheDocument()
})

it('shows admin feedback on pulled lessons', () => {
  const lesson = { ...baseLesson, admin_feedback: 'Bad audio' }
  renderCard({ lesson, pulled: true })
  expect(screen.getByText('Admin: Bad audio')).toBeInTheDocument()
})

it('shows the practice count badge and star title', () => {
  const lesson = { ...baseLesson, progress: { current_sentence: 0, practice_count: 3 } }
  renderCard({ lesson })
  expect(screen.getByTitle('Practiced 3 times')).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
})

it('navigates to the practice session on click', () => {
  renderCard({ lesson: baseLesson })
  fireEvent.click(screen.getByText('BBC News'))
  expect(screen.getByText('PRACTICE-l1')).toBeInTheDocument()
})

it('shows the edit button only for owners', () => {
  renderCard({ lesson: baseLesson })
  expect(screen.queryByTitle('Edit lesson')).not.toBeInTheDocument()
})

it('edit button navigates to the editor without opening the lesson', () => {
  renderCard({ lesson: baseLesson, isOwner: true })
  fireEvent.click(screen.getByTitle('Edit lesson'))
  expect(screen.getByText('CREATE-l1')).toBeInTheDocument()
  expect(screen.queryByText('PRACTICE-l1')).not.toBeInTheDocument()
})

it('shows the delete button only when canDelete is set', () => {
  renderCard({ lesson: baseLesson, isOwner: true })
  expect(screen.queryByTitle('Delete lesson')).not.toBeInTheDocument()
})

it('delete button calls onDelete with the lesson without opening it', () => {
  const onDelete = vi.fn()
  renderCard({ lesson: baseLesson, canDelete: true, onDelete })
  fireEvent.click(screen.getByTitle('Delete lesson'))
  expect(onDelete).toHaveBeenCalledWith(baseLesson)
  expect(screen.queryByText('PRACTICE-l1')).not.toBeInTheDocument()
})

it('handles zero sentence_count without dividing by zero', () => {
  const lesson = { ...baseLesson, sentence_count: 0, progress: { current_sentence: 0, practice_count: 0 } }
  renderCard({ lesson })
  expect(screen.getByText('0 sentences')).toBeInTheDocument()
})
