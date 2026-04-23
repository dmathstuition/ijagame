'use client'
// src/app/login/page.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import { BrandHeaderDark } from '@/components/shared/BrandHeader'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    const supabase = getSupabaseClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Invalid email or password')
      setIsLoading(false)
      return
    }

    // Check role
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'participant') {
        setError('Participants should use the Join page, not this admin login.')
        await supabase.auth.signOut()
        setIsLoading(false)
        return
      }
    }

    router.push('/admin/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--ij-navy-deep)] via-[var(--ij-navy)] to-[var(--ij-navy-mid)] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex justify-center mb-8">
          <BrandHeaderDark size="lg" className="[&_h1]:text-white [&_p]:text-[var(--ij-gold-light)]" />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-[var(--ij-gold)] to-[var(--ij-gold-light)]" />
          <div className="p-8">
            <h2 className="font-display text-2xl font-bold text-navy mb-1">Admin Sign In</h2>
            <p className="text-slate-500 text-sm mb-6">
              For participants, use the{' '}
              <a href="/join" className="text-[var(--ij-navy)] font-semibold hover:underline">Join</a> page.
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-navy mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-navy text-sm focus:outline-none focus:border-[var(--ij-navy)] focus:ring-4 focus:ring-[var(--ij-navy)]/10 transition-all"
                  placeholder="admin@infantjesus.edu.ng"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-navy mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-navy text-sm focus:outline-none focus:border-[var(--ij-navy)] focus:ring-4 focus:ring-[var(--ij-navy)]/10 transition-all"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl bg-[var(--ij-navy)] text-white font-semibold text-sm
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
                    Signing in...
                  </span>
                ) : (
                  'Sign In →'
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          Infant Jesus School · SPAK Competition Platform · Admin Portal
        </p>
      </div>
    </div>
  )
}
