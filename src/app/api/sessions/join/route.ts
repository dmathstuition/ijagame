// src/app/api/sessions/join/route.ts
// Participant session join - validates code, creates participant record

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

export async function POST(request: NextRequest) {
  const serviceClient = createServiceClient()

  let body: { session_code: string; display_name: string; team_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { session_code, display_name, team_id } = body

  if (!session_code?.trim() || !display_name?.trim()) {
    return NextResponse.json({ error: 'Session code and display name are required' }, { status: 400 })
  }

  const cleanName = display_name.trim().slice(0, 50)
  const cleanCode = session_code.trim().toUpperCase()

  // ── Find session ───────────────────────────────────────────────────────────
  const { data: session, error: sessErr } = await serviceClient
    .from('sessions')
    .select('id, status, competition_id')
    .eq('session_code', cleanCode)
    .single()

  if (sessErr || !session) {
    return NextResponse.json({ error: 'Invalid session code' }, { status: 404 })
  }

  if (!['lobby', 'active'].includes(session.status)) {
    return NextResponse.json(
      { error: 'This session is not accepting participants right now' },
      { status: 409 }
    )
  }

  // ── Check for duplicate name in session ────────────────────────────────────
  const { data: existing } = await serviceClient
    .from('participants')
    .select('id, join_code')
    .eq('session_id', session.id)
    .eq('display_name', cleanName)
    .single()

  if (existing) {
    // Return existing participant (allows reconnect)
    const { data: sess } = await serviceClient
      .from('sessions')
      .select('*, competition:competitions(title)')
      .eq('id', session.id)
      .single()

    return NextResponse.json({
      participant: existing,
      session: sess,
      join_code: existing.join_code,
      reconnected: true,
    })
  }

  // ── Create participant ─────────────────────────────────────────────────────
  const joinCode = randomBytes(16).toString('hex')

  const { data: participant, error: pErr } = await serviceClient
    .from('participants')
    .insert({
      session_id: session.id,
      display_name: cleanName,
      team_id: team_id ?? null,
      join_code: joinCode,
      is_online: true,
      total_score: 0,
      correct_count: 0,
      wrong_count: 0,
    })
    .select('*')
    .single()

  if (pErr || !participant) {
    console.error('Participant insert error:', pErr)
    return NextResponse.json({ error: 'Failed to join session' }, { status: 500 })
  }

  // ── Fetch session with competition for participant ─────────────────────────
  const { data: fullSession } = await serviceClient
    .from('sessions')
    .select('*, competition:competitions(title, subject)')
    .eq('id', session.id)
    .single()

  return NextResponse.json({
    participant,
    session: fullSession,
    join_code: joinCode,
    reconnected: false,
  })
}
