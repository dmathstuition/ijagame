'use client'
// src/app/admin/dashboard/page.tsx

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { BrandHeaderDark } from '@/components/shared/BrandHeader'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Competition, Session } from '@/lib/types'

export default function AdminDashboard() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [recentSessions, setRecentSessions] = useState<Session[]>([])
  const [profile, setProfile] = useState<{ full_name: string; role: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabaseClient()

    async function load() {
      const [{ data: comps }, { data: sessions }, { data: { user } }] = await Promise.all([
        supabase.from('competitions').select('*').order('created_at', { ascending: false }),
        supabase.from('sessions').select('*, competition:competitions(title)').order('created_at', { ascending: false }).limit(10),
        supabase.auth.getUser(),
      ])

      setCompetitions(comps ?? [])
      setRecentSessions(sessions ?? [])

      if (user) {
        const { data: prof } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single()
        setProfile(prof)
      }
      setIsLoading(false)
    }

    load()
  }, [])

  const activeSessions = recentSessions.filter(s => ['active', 'paused', 'lobby'].includes(s.status))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[var(--ij-navy)] shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <BrandHeaderDark size="md" className="[&_h1]:text-white [&_p]:text-[var(--ij-gold-light)]" />
          <div className="flex items-center gap-4">
            {profile && (
              <div className="text-right">
                <div className="text-white text-sm font-semibold">{profile.full_name}</div>
                <div className="text-[var(--ij-gold-light)] text-xs capitalize">{profile.role.replace('_', ' ')}</div>
              </div>
            )}
            <AdminNav />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Active sessions banner */}
        {activeSessions.length > 0 && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <div>
                <p className="font-semibold text-green-800 text-sm">
                  {activeSessions.length} active session{activeSessions.length > 1 ? 's' : ''}
                </p>
                <p className="text-green-600 text-xs">{activeSessions.map(s => s.title).join(', ')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {activeSessions.map(s => (
                <Link
                  key={s.id}
                  href={`/admin/live/${s.id}`}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700"
                >
                  Control →
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <QuickStat label="Competitions" value={competitions.length} icon="🏆" />
          <QuickStat label="Total Sessions" value={recentSessions.length} icon="📋" />
          <QuickStat label="Active Now" value={activeSessions.length} icon="🔴" accent />
          <QuickStat label="Completed" value={recentSessions.filter(s => s.status === 'completed').length} icon="✅" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Competitions */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-navy">Competitions</h2>
              <Link
                href="/admin/competitions/new"
                className="px-4 py-2 bg-[var(--ij-navy)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ij-navy-deep)]"
              >
                + New Competition
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="h-20 bg-slate-200 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : competitions.length === 0 ? (
              <div className="ij-card p-8 text-center text-slate-400">
                <p className="text-lg mb-2">No competitions yet</p>
                <Link href="/admin/competitions/new" className="text-[var(--ij-navy)] font-semibold hover:underline text-sm">
                  Create your first competition →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {competitions.map(comp => (
                  <CompetitionCard key={comp.id} competition={comp} />
                ))}
              </div>
            )}
          </div>

          {/* Recent Sessions */}
          <div>
            <h2 className="font-display text-xl font-bold text-navy mb-4">Recent Sessions</h2>
            <div className="space-y-2">
              {recentSessions.slice(0, 8).map(session => (
                <SessionRow key={session.id} session={session} />
              ))}
              {recentSessions.length === 0 && (
                <p className="text-slate-400 text-sm text-center py-6">No sessions yet</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function CompetitionCard({ competition }: { competition: Competition }) {
  return (
    <div className="ij-card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-display font-bold text-navy text-base">{competition.title}</h3>
            {!competition.is_active && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">Archived</span>
            )}
          </div>
          {competition.description && (
            <p className="text-sm text-slate-500 truncate">{competition.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
            {competition.subject && <span>📚 {competition.subject}</span>}
            {competition.school_year && <span>📅 {competition.school_year}</span>}
            {competition.team_mode && <span>👥 Team Mode</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link
            href={`/admin/competitions/${competition.id}`}
            className="px-3 py-1.5 border border-slate-200 text-navy rounded-lg text-xs font-semibold hover:bg-slate-50"
          >
            Manage
          </Link>
          <Link
            href={`/admin/competitions/${competition.id}/session/new`}
            className="px-3 py-1.5 bg-[var(--ij-navy)] text-white rounded-lg text-xs font-semibold hover:bg-[var(--ij-navy-deep)]"
          >
            + Session
          </Link>
        </div>
      </div>
    </div>
  )
}

function SessionRow({ session }: { session: Session }) {
  const statusColors: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    lobby: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    paused: 'bg-amber-100 text-amber-700',
    completed: 'bg-slate-100 text-slate-500',
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-navy truncate">{session.title}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold capitalize ${statusColors[session.status]}`}>
            {session.status}
          </span>
          <span className="text-xs font-mono text-slate-400">{session.session_code}</span>
        </div>
      </div>
      {['active', 'paused', 'lobby'].includes(session.status) && (
        <Link
          href={`/admin/live/${session.id}`}
          className="opacity-0 group-hover:opacity-100 text-xs text-[var(--ij-navy)] font-semibold transition-opacity"
        >
          Control →
        </Link>
      )}
    </div>
  )
}

function QuickStat({ label, value, icon, accent }: { label: string; value: number; icon: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-5 ${accent ? 'bg-[var(--ij-navy)] text-white' : 'bg-white border border-slate-200'}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`font-mono font-bold text-3xl ${accent ? 'text-white' : 'text-navy'}`}>{value}</div>
      <div className={`text-xs font-body mt-1 ${accent ? 'text-white/60' : 'text-slate-500'}`}>{label}</div>
    </div>
  )
}

function AdminNav() {
  return (
    <nav className="flex items-center gap-1">
      {[
        { href: '/admin/dashboard', label: 'Dashboard' },
        { href: '/admin/competitions', label: 'Competitions' },
      ].map(item => (
        <Link
          key={item.href}
          href={item.href}
          className="px-3 py-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg text-sm font-body transition-colors"
        >
          {item.label}
        </Link>
      ))}
      <button
        onClick={async () => {
          const supabase = getSupabaseClient()
          await supabase.auth.signOut()
          window.location.href = '/login'
        }}
        className="px-3 py-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg text-sm font-body transition-colors"
      >
        Sign Out
      </button>
    </nav>
  )
}
