'use client'
// src/app/admin/competitions/[id]/page.tsx
// Competition management: rounds, questions, sessions

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Competition, Round, Question, QuestionOption, Session } from '@/lib/types'

const ROUND_MODE_LABELS: Record<string, string> = {
  fastest_finger: '⚡ Fastest Finger',
  classic_mcq: '📝 Classic MCQ',
  personal_cbt: '🖥 Personal CBT',
  sudden_death: '💀 Sudden Death',
  practice: '🎯 Practice',
  buzzer: '🔔 Buzzer',
}

export default function CompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [competition, setCompetition] = useState<Competition | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedRound, setSelectedRound] = useState<Round | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modal states
  const [showAddRound, setShowAddRound] = useState(false)
  const [showAddQuestion, setShowAddQuestion] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    const supabase = getSupabaseClient()
    const [{ data: comp }, { data: rnds }, { data: sess }] = await Promise.all([
      supabase.from('competitions').select('*').eq('id', id).single(),
      supabase.from('rounds').select('*, questions(*, question_options(*))').eq('session_id', id).order('order_index'),
      supabase.from('sessions').select('*').eq('competition_id', id).order('created_at', { ascending: false }),
    ])

    // Note: rounds belong to sessions, not competitions directly
    // Load sessions first, then rounds for those sessions
    const sessionIds = sess?.map(s => s.id) ?? []
    let allRounds: Round[] = []
    if (sessionIds.length > 0) {
      const { data: roundData } = await supabase
        .from('rounds')
        .select('*, questions(*, question_options(*))')
        .in('session_id', sessionIds)
        .order('order_index')
      allRounds = (roundData ?? []) as Round[]
    }

    setCompetition(comp as Competition)
    setRounds(allRounds)
    setSessions((sess ?? []) as Session[])
    if (allRounds.length > 0) setSelectedRound(allRounds[0])
    setIsLoading(false)
  }

  useEffect(() => {
    if (selectedRound) {
      setQuestions(selectedRound.questions ?? [])
    }
  }, [selectedRound])

  async function handleCreateSession() {
    const supabase = getSupabaseClient()
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    const title = prompt('Session title?', 'Preliminary Round')
    if (!title) return

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        competition_id: id,
        title,
        session_code: code,
        status: 'draft',
        created_by: user.user.id,
      })
      .select('*')
      .single()

    if (!error && data) {
      setSessions(prev => [data as Session, ...prev])
      // Also create display_state for this session
      await supabase.from('display_state').insert({
        session_id: data.id,
        reveal_state: 'hidden',
        answer_window_state: 'closed',
      })
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!confirm('Delete this question and all its options?')) return
    const supabase = getSupabaseClient()
    await supabase.from('questions').delete().eq('id', questionId)
    setQuestions(prev => prev.filter(q => q.id !== questionId))
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--ij-navy)]/30 border-t-[var(--ij-navy)] rounded-full" />
      </div>
    )
  }

  if (!competition) {
    return <div className="p-8 text-center text-slate-500">Competition not found</div>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[var(--ij-navy)] text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Link href="/admin/dashboard" className="text-white/60 hover:text-white text-sm">← Dashboard</Link>
          <div className="flex-1">
            <h1 className="font-display font-bold text-xl text-white">{competition.title}</h1>
            <div className="flex items-center gap-3 mt-0.5 text-white/50 text-xs">
              {competition.subject && <span>{competition.subject}</span>}
              {competition.school_year && <span>{competition.school_year}</span>}
              {competition.team_mode && <span>👥 Team Mode</span>}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* LEFT SIDEBAR: Sessions + Rounds */}
          <div className="lg:col-span-1 space-y-4">
            {/* Sessions */}
            <div className="ij-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-bold text-navy text-base">Sessions</h3>
                <button
                  onClick={handleCreateSession}
                  className="text-xs text-[var(--ij-navy)] font-semibold hover:underline"
                >
                  + New
                </button>
              </div>
              <div className="space-y-2">
                {sessions.map(sess => (
                  <div key={sess.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 group">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-navy truncate">{sess.title}</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-slate-400">{sess.session_code}</span>
                        <SessionStatusDot status={sess.status} />
                      </div>
                    </div>
                    <Link
                      href={`/admin/live/${sess.id}`}
                      className="opacity-0 group-hover:opacity-100 text-xs bg-[var(--ij-navy)] text-white px-2 py-1 rounded transition-opacity"
                    >
                      Control
                    </Link>
                  </div>
                ))}
                {sessions.length === 0 && (
                  <p className="text-slate-400 text-xs text-center py-3">No sessions yet</p>
                )}
              </div>
            </div>

            {/* Rounds */}
            <div className="ij-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-bold text-navy text-base">Rounds</h3>
                {sessions.length > 0 && (
                  <button
                    onClick={() => setShowAddRound(true)}
                    className="text-xs text-[var(--ij-navy)] font-semibold hover:underline"
                  >
                    + Add
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {rounds.map(round => (
                  <button
                    key={round.id}
                    onClick={() => setSelectedRound(round)}
                    className={`
                      w-full text-left p-2.5 rounded-lg text-sm transition-colors
                      ${selectedRound?.id === round.id
                        ? 'bg-[var(--ij-navy)] text-white'
                        : 'hover:bg-slate-100 text-slate-700'
                      }
                    `}
                  >
                    <div className="font-semibold text-sm leading-tight">{round.title}</div>
                    <div className={`text-xs mt-0.5 ${selectedRound?.id === round.id ? 'text-white/60' : 'text-slate-400'}`}>
                      {ROUND_MODE_LABELS[round.mode]} · {round.questions?.length ?? 0}Q
                    </div>
                  </button>
                ))}
                {rounds.length === 0 && (
                  <p className="text-slate-400 text-xs text-center py-3">
                    {sessions.length === 0 ? 'Create a session first' : 'No rounds yet'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* MAIN: Questions */}
          <div className="lg:col-span-3">
            {selectedRound ? (
              <div>
                {/* Round header */}
                <div className="ij-card p-5 mb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-display font-bold text-navy text-xl">{selectedRound.title}</h2>
                      <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                        <span>{ROUND_MODE_LABELS[selectedRound.mode]}</span>
                        <span>⏱ {selectedRound.time_limit_seconds}s per question</span>
                        <span>⭐ {selectedRound.base_points} pts base</span>
                        {selectedRound.allow_speed_bonus && <span>⚡ Speed bonus +{selectedRound.speed_bonus_max}</span>}
                        {selectedRound.allow_negative && <span>➖ Negative -{selectedRound.negative_value}</span>}
                        {selectedRound.eliminate_on_wrong && <span>💀 Elimination</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAddQuestion(true)}
                      className="px-4 py-2 bg-[var(--ij-navy)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ij-navy-deep)]"
                    >
                      + Add Question
                    </button>
                  </div>
                </div>

                {/* Questions list */}
                {questions.length === 0 ? (
                  <div className="ij-card p-10 text-center text-slate-400">
                    <p className="text-lg mb-2">No questions in this round</p>
                    <button
                      onClick={() => setShowAddQuestion(true)}
                      className="text-[var(--ij-navy)] font-semibold hover:underline text-sm"
                    >
                      Add your first question →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {questions
                      .sort((a, b) => a.order_index - b.order_index)
                      .map((question, idx) => (
                        <QuestionCard
                          key={question.id}
                          question={question}
                          index={idx + 1}
                          onEdit={() => setEditingQuestion(question)}
                          onDelete={() => handleDeleteQuestion(question.id)}
                        />
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="ij-card p-10 text-center text-slate-400">
                <p>Select a round to manage its questions</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAddRound && (
        <AddRoundModal
          sessions={sessions}
          onClose={() => setShowAddRound(false)}
          onSaved={(round) => {
            setRounds(prev => [...prev, round])
            setSelectedRound(round)
            setShowAddRound(false)
          }}
        />
      )}

      {(showAddQuestion || editingQuestion) && selectedRound && (
        <AddQuestionModal
          round={selectedRound}
          question={editingQuestion}
          onClose={() => { setShowAddQuestion(false); setEditingQuestion(null) }}
          onSaved={(question) => {
            if (editingQuestion) {
              setQuestions(prev => prev.map(q => q.id === question.id ? question : q))
            } else {
              setQuestions(prev => [...prev, question])
            }
            setShowAddQuestion(false)
            setEditingQuestion(null)
          }}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function QuestionCard({
  question, index, onEdit, onDelete,
}: {
  question: Question
  index: number
  onEdit: () => void
  onDelete: () => void
}) {
  const correctOption = question.options?.find(o => o.is_correct)

  return (
    <div className="ij-card p-4 hover:shadow-md transition-shadow group">
      <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded-lg bg-[var(--ij-navy)] text-white flex items-center justify-center font-mono font-bold text-sm flex-shrink-0">
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body font-medium text-navy text-sm leading-snug">{question.question_text}</p>
          {/* Options preview */}
          {question.options && question.options.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {question.options.sort((a, b) => a.order_index - b.order_index).map(opt => (
                <div
                  key={opt.id}
                  className={`
                    flex items-center gap-1.5 px-2 py-1 rounded text-xs font-body
                    ${opt.is_correct ? 'bg-green-50 text-green-700 font-semibold' : 'bg-slate-50 text-slate-500'}
                  `}
                >
                  <span className={`font-mono font-bold text-xs ${opt.is_correct ? 'text-green-600' : 'text-slate-400'}`}>
                    {opt.option_label}
                  </span>
                  <span className="truncate">{opt.option_text}</span>
                  {opt.is_correct && <span className="ml-auto">✓</span>}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
            {question.time_limit_seconds && <span>⏱ {question.time_limit_seconds}s</span>}
            {question.base_points && <span>⭐ {question.base_points}pts</span>}
          </div>
        </div>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="text-xs px-2 py-1 border border-slate-200 rounded text-slate-600 hover:bg-slate-50">
            Edit
          </button>
          <button onClick={onDelete} className="text-xs px-2 py-1 border border-red-200 rounded text-red-600 hover:bg-red-50">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function AddRoundModal({
  sessions,
  onClose,
  onSaved,
}: {
  sessions: Session[]
  onClose: () => void
  onSaved: (round: Round) => void
}) {
  const [form, setForm] = useState({
    session_id: sessions[0]?.id ?? '',
    title: '',
    mode: 'classic_mcq' as Round['mode'],
    time_limit_seconds: 30,
    base_points: 10,
    allow_speed_bonus: false,
    speed_bonus_max: 5,
    allow_negative: false,
    negative_value: 2,
    eliminate_on_wrong: false,
  })
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave() {
    if (!form.title.trim() || !form.session_id) return
    setIsSaving(true)
    const supabase = getSupabaseClient()

    const { count } = await supabase
      .from('rounds')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', form.session_id)

    const { data, error } = await supabase
      .from('rounds')
      .insert({ ...form, order_index: count ?? 0, status: 'pending' })
      .select('*')
      .single()

    setIsSaving(false)
    if (!error && data) onSaved({ ...data, questions: [] } as Round)
  }

  return (
    <Modal title="Add Round" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="form-label">Session</label>
          <select className="form-input" value={form.session_id} onChange={e => setForm(f => ({ ...f, session_id: e.target.value }))}>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.title} ({s.session_code})</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Round Title</label>
          <input className="form-input" placeholder="e.g. Round 1: General Science" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Mode</label>
          <select className="form-input" value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value as Round['mode'] }))}>
            {Object.entries(ROUND_MODE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Time Limit (seconds)</label>
            <input type="number" className="form-input" min={5} max={300} value={form.time_limit_seconds} onChange={e => setForm(f => ({ ...f, time_limit_seconds: +e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Base Points</label>
            <input type="number" className="form-input" min={1} value={form.base_points} onChange={e => setForm(f => ({ ...f, base_points: +e.target.value }))} />
          </div>
        </div>
        <div className="space-y-2">
          <Toggle label="Speed Bonus" value={form.allow_speed_bonus} onChange={v => setForm(f => ({ ...f, allow_speed_bonus: v }))} />
          {form.allow_speed_bonus && (
            <input type="number" className="form-input" placeholder="Max bonus points" value={form.speed_bonus_max} onChange={e => setForm(f => ({ ...f, speed_bonus_max: +e.target.value }))} />
          )}
          <Toggle label="Negative Marking" value={form.allow_negative} onChange={v => setForm(f => ({ ...f, allow_negative: v }))} />
          {form.allow_negative && (
            <input type="number" className="form-input" placeholder="Points deducted" value={form.negative_value} onChange={e => setForm(f => ({ ...f, negative_value: +e.target.value }))} />
          )}
          <Toggle label="Eliminate on Wrong Answer" value={form.eliminate_on_wrong} onChange={v => setForm(f => ({ ...f, eliminate_on_wrong: v }))} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="admin-btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={isSaving} className="admin-btn-primary">
            {isSaving ? 'Saving...' : 'Add Round'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function AddQuestionModal({
  round,
  question,
  onClose,
  onSaved,
}: {
  round: Round
  question: Question | null
  onClose: () => void
  onSaved: (q: Question) => void
}) {
  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [options, setOptions] = useState<{ label: string; text: string; is_correct: boolean }[]>(
    question?.options
      ? question.options.sort((a, b) => a.order_index - b.order_index).map(o => ({ label: o.option_label, text: o.option_text, is_correct: o.is_correct }))
      : [
          { label: 'A', text: '', is_correct: false },
          { label: 'B', text: '', is_correct: false },
          { label: 'C', text: '', is_correct: false },
          { label: 'D', text: '', is_correct: false },
        ]
  )
  const [isSaving, setIsSaving] = useState(false)

  function setCorrect(idx: number) {
    setOptions(opts => opts.map((o, i) => ({ ...o, is_correct: i === idx })))
  }

  async function handleSave() {
    if (!questionText.trim()) return
    if (!options.some(o => o.is_correct)) {
      alert('Please mark one option as correct')
      return
    }
    if (options.some(o => !o.text.trim())) {
      alert('Please fill in all answer options')
      return
    }

    setIsSaving(true)
    const supabase = getSupabaseClient()

    if (question) {
      // Update
      await supabase.from('questions').update({ question_text: questionText }).eq('id', question.id)
      // Update options
      for (let i = 0; i < options.length; i++) {
        const existing = question.options?.[i]
        if (existing) {
          await supabase.from('question_options').update({ option_text: options[i].text, is_correct: options[i].is_correct }).eq('id', existing.id)
        }
      }
      const updatedQ = { ...question, question_text: questionText, options: question.options?.map((o, i) => ({ ...o, option_text: options[i].text, is_correct: options[i].is_correct })) }
      setIsSaving(false)
      onSaved(updatedQ as Question)
    } else {
      // Insert
      const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('round_id', round.id)
      const { data: newQ, error } = await supabase
        .from('questions')
        .insert({ round_id: round.id, question_text: questionText, question_type: 'multiple_choice', order_index: count ?? 0 })
        .select('*')
        .single()

      if (error || !newQ) { setIsSaving(false); return }

      const optInserts = options.map((o, i) => ({
        question_id: newQ.id,
        option_label: o.label,
        option_text: o.text,
        is_correct: o.is_correct,
        order_index: i,
      }))
      const { data: newOpts } = await supabase.from('question_options').insert(optInserts).select('*')

      setIsSaving(false)
      onSaved({ ...newQ, options: newOpts ?? [] } as Question)
    }
  }

  return (
    <Modal title={question ? 'Edit Question' : 'Add Question'} onClose={onClose} wide>
      <div className="space-y-5">
        <div>
          <label className="form-label">Question Text</label>
          <textarea
            className="form-input min-h-[80px] resize-none"
            placeholder="Type your question here..."
            value={questionText}
            onChange={e => setQuestionText(e.target.value)}
          />
        </div>

        <div>
          <label className="form-label">Answer Options <span className="text-slate-400 font-normal">(click to mark correct)</span></label>
          <div className="space-y-2">
            {options.map((opt, idx) => (
              <div key={opt.label} className="flex items-center gap-3">
                <button
                  onClick={() => setCorrect(idx)}
                  className={`
                    w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-sm flex-shrink-0 transition-colors
                    ${opt.is_correct ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                  `}
                >
                  {opt.label}
                </button>
                <input
                  className="form-input flex-1"
                  placeholder={`Option ${opt.label}`}
                  value={opt.text}
                  onChange={e => setOptions(opts => opts.map((o, i) => i === idx ? { ...o, text: e.target.value } : o))}
                />
                {opt.is_correct && <span className="text-green-600 text-sm font-semibold">✓ Correct</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">Click the letter button to mark as correct answer</p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="admin-btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={isSaving} className="admin-btn-primary">
            {isSaving ? 'Saving...' : question ? 'Update Question' : 'Add Question'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Shared UI helpers ──────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-display font-bold text-navy text-lg">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!value)}
        className={`w-10 h-6 rounded-full transition-colors relative ${value ? 'bg-[var(--ij-navy)]' : 'bg-slate-200'}`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
      </div>
      <span className="text-sm font-body text-slate-700">{label}</span>
    </label>
  )
}

function SessionStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-slate-400',
    lobby: 'bg-blue-500',
    active: 'bg-green-500',
    paused: 'bg-amber-500',
    completed: 'bg-slate-400',
  }
  return <div className={`w-2 h-2 rounded-full inline-block ${colors[status] ?? 'bg-slate-400'}`} />
}
