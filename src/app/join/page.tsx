'use client'
// src/app/join/page.tsx

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BrandHeaderDark } from '@/components/shared/BrandHeader'

export default function JoinPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [sessionCode, setSessionCode] = useState(searchParams.get('code') ?? '')
  const [displayName, setDisplayName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch('/api/sessions/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_code: sessionCode.trim().toUpperCase(),
          display_name: displayName.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to join')
        return
      }

      // Store join code for answer submission auth
      localStorage.setItem('ij_join_code', data.join_code)
      localStorage.setItem('ij_participant_id', data.participant.id)
      localStorage.setItem('ij_session_id', data.session.id)
      localStorage.setItem('ij_display_name', data.participant.display_name)

      router.push(`/play/${data.session.id}`)
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--ij-navy-deep)] via-[var(--ij-navy)] to-[var(--ij-navy-mid)] flex flex-col">
      {/* Header */}
      <header className="p-6 pb-0">
        <BrandHeaderDark size="md" className="[&_h1]:text-white [&_p]:text-[var(--ij-gold-light)]" />
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Gold top stripe */}
            <div className="h-1.5 bg-gradient-to-r from-[var(--ij-gold)] to-[var(--ij-gold-light)]" />

            <div className="p-8">
              <div className="text-center mb-8">
                <h2 className="font-display text-2xl font-bold text-navy">Join Competition</h2>
                <p className="text-slate-500 text-sm mt-1 font-body">
                  Enter your session code to participate
                </p>
              </div>

              <form onSubmit={handleJoin} className="space-y-5">
                {/* Session Code */}
                <div>
                  <label className="block text-sm font-semibold text-navy mb-2">
                    Session Code
                  </label>
                  <input
                    type="text"
                    value={sessionCode}
                    onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                    placeholder="e.g. SPAK2025"
                    maxLength={12}
                    required
                    className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 text-center font-mono font-bold text-xl tracking-widest text-navy uppercase placeholder:normal-case placeholder:font-normal placeholder:text-base placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:border-[var(--ij-navy)] focus:ring-4 focus:ring-[var(--ij-navy)]/10 transition-all"
                    autoComplete="off"
                    autoCapitalize="characters"
                  />
                </div>

                {/* Display Name */}
                <div>
                  <label className="block text-sm font-semibold text-navy mb-2">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your full name"
                    maxLength={50}
                    required
                    className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 font-body text-base text-navy placeholder:text-slate-400 focus:outline-none focus:border-[var(--ij-navy)] focus:ring-4 focus:ring-[var(--ij-navy)]/10 transition-all"
                    autoComplete="name"
                  />
                  <p className="text-xs text-slate-400 mt-1.5 font-body">
                    Use the name your teacher will recognise
                  </p>
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm font-body">
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading || !sessionCode.trim() || !displayName.trim()}
                  className="w-full py-4 rounded-xl bg-[var(--ij-navy)] text-white font-semibold text-base font-body
                             hover:bg-[var(--ij-navy-deep)] active:scale-[0.99] transition-all duration-150
                             disabled:opacity-50 disabled:cursor-not-allowed
                             focus:outline-none focus:ring-4 focus:ring-[var(--ij-navy)]/20"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
                      </svg>
                      Joining...
                    </span>
                  ) : (
                    'Join Competition →'
                  )}
                </button>
              </form>
            </div>

            {/* Footer note */}
            <div className="px-8 pb-6 text-center">
              <p className="text-xs text-slate-400 font-body">
                Are you an admin?{' '}
                <a href="/login" className="text-[var(--ij-navy)] font-semibold hover:underline">
                  Sign in here
                </a>
              </p>
            </div>
          </div>

          {/* Bottom decoration */}
          <p className="text-center text-white/40 text-xs mt-6 font-body">
            Infant Jesus School · SPAK Competition Platform
          </p>
        </div>
      </main>
    </div>
  )
}
