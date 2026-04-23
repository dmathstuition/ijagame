# 🏆 Infant Jesus SPAK Competition Platform

A production-ready, real-time school competition platform inspired by Interswitch-SPAK, built for Infant Jesus school events.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     THREE LIVE INTERFACES                        │
│                                                                  │
│  Admin Control Panel    Participant Interface    Main Screen     │
│  /admin/live/[id]       /play/[sessionId]        /screen/[id]   │
│        │                        │                     │         │
│        └────────────────────────┼─────────────────────┘         │
│                                 │                                │
│                    Supabase Realtime                             │
│              (Postgres Changes + Presence)                       │
│                                 │                                │
│                    ┌────────────▼──────────┐                     │
│                    │   display_state table  │ ← single source     │
│                    │   (per-session row)    │   of truth         │
│                    └────────────┬──────────┘                     │
│                                 │                                │
│              ┌──────────────────┼──────────────────┐            │
│              │                  │                   │            │
│     Next.js Route Handlers   Supabase RPC        Direct DB      │
│     /api/sessions/control    update_score        queries         │
│     /api/answers/submit      get_leaderboard                    │
│     /api/sessions/join       get_distribution                   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**Why `display_state` as single source of truth:**
Three clients (admin, participant, screen) need identical state. Instead of broadcasting events that can be missed, all state lives in one row per session. Every client subscribes to changes on that row. This makes reconnect trivial — just re-read the row.

**Why NOT Edge Functions for most logic:**
Edge Functions add cold start latency and complexity. Route Handlers running on Next.js (Vercel Edge Runtime or Node.js) are fast enough and easier to debug. Edge Functions are used only for the `update_participant_score` RPC, which needs to run atomically in the database.

**Why server-side timestamps for fastest-finger:**
Client clocks are unreliable and gameable. The Route Handler captures `new Date()` as its very first statement. This is the authoritative submission time. Client timestamps are accepted only for reference/logging.

**Realtime strategy:**
- `postgres_changes` on `display_state` → drives ALL three UIs
- `postgres_changes` on `answers` → admin answer count ticker
- `presence` → online participant tracking
- No custom broadcast events needed — DB changes are the events

---

## 2. Folder Structure

```
infant-jesus-spak/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # → redirects to /join
│   │   ├── layout.tsx                  # Root layout + metadata
│   │   ├── login/
│   │   │   └── page.tsx               # Admin login
│   │   ├── join/
│   │   │   └── page.tsx               # Participant join
│   │   ├── play/
│   │   │   └── [sessionId]/
│   │   │       └── page.tsx           # Participant competition UI
│   │   ├── screen/
│   │   │   └── [sessionId]/
│   │   │       └── page.tsx           # Projector display
│   │   ├── results/
│   │   │   └── [sessionId]/
│   │   │       └── page.tsx           # Post-competition results
│   │   ├── admin/
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx           # Admin home
│   │   │   ├── competitions/
│   │   │   │   ├── page.tsx           # Competitions list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx       # Competition detail + Q management
│   │   │   └── live/
│   │   │       └── [sessionId]/
│   │   │           └── page.tsx       # Live control panel ← most important
│   │   └── api/
│   │       ├── answers/
│   │       │   └── submit/route.ts    # Answer submission (anti-cheat)
│   │       └── sessions/
│   │           ├── join/route.ts      # Join session
│   │           ├── control/route.ts   # Admin session control
│   │           └── [sessionId]/
│   │               └── live-stats/route.ts
│   ├── components/
│   │   └── shared/
│   │       ├── BrandHeader.tsx        # Logo + school name
│   │       ├── CountdownTimer.tsx     # Server-authoritative timer
│   │       ├── AnswerDistribution.tsx # Bar chart component
│   │       └── Leaderboard.tsx        # Rankings component
│   ├── hooks/
│   │   └── useSessionRealtime.ts      # Realtime + countdown hooks
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts              # Browser Supabase client
│   │   │   ├── server.ts              # Server + service role clients
│   │   │   └── database.types.ts      # Generated DB types
│   │   ├── realtime/
│   │   │   └── session-channel.ts     # Realtime channel manager
│   │   └── types/
│   │       └── index.ts               # All TypeScript types
│   ├── middleware.ts                   # Auth protection
│   └── styles/
│       ├── globals.css                 # Brand tokens + utilities
│       └── forms.css                   # Form component styles
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 001_schema.sql             # All tables + enums + triggers
│       ├── 002_rls.sql                # Row Level Security policies
│       ├── 003_seed.sql               # Example data
│       ├── 004_rpc.sql                # RPC functions + indexes
│       └── 005_auth_trigger.sql       # Auto-create profile on signup
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. Environment Variables

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Optional
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Critical:** `SUPABASE_SERVICE_ROLE_KEY` must NEVER be in a `NEXT_PUBLIC_` variable or exposed to the browser. It's only used in Route Handlers (`/api/*`) which run on the server.

---

## 4. Local Setup Steps

### Prerequisites
- Node.js 20+
- npm or pnpm
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`)
- A Supabase project (free tier works for development)

### Step 1: Clone and install

```bash
git clone <your-repo>
cd infant-jesus-spak
npm install
```

### Step 2: Set up environment

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase project credentials
```

Get credentials from: Supabase Dashboard → Project Settings → API

### Step 3: Run database migrations

**Option A: Against your cloud Supabase project (recommended for first setup)**

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations in order
supabase db push
```

**Option B: Local Supabase (Docker)**

```bash
supabase start
supabase db reset   # runs all migrations + seed
```

### Step 4: Create your first admin user

Go to Supabase Dashboard → Authentication → Users → Invite User

Enter: `admin@infantjesus.edu.ng`

Then in the SQL Editor:
```sql
UPDATE profiles 
SET role = 'super_admin' 
WHERE email = 'admin@infantjesus.edu.ng';
```

### Step 5: Enable Realtime

In Supabase Dashboard → Database → Replication:
- Enable `supabase_realtime` publication
- Add tables: `sessions`, `display_state`, `answers`, `participants`, `leaderboard_snapshots`

OR the `ALTER PUBLICATION` statements at the bottom of `001_schema.sql` do this automatically.

### Step 6: Run the app

```bash
npm run dev
```

Open:
- http://localhost:3000/login — Admin login
- http://localhost:3000/join — Participant join (test with session code from seed: `SPAK2025`)
- http://localhost:3000/screen/SESSION_ID — Projector screen

---

## 5. Deployment Steps (Vercel)

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: Infant Jesus SPAK Platform"
git remote add origin https://github.com/your-org/infant-jesus-spak.git
git push -u origin main
```

### Step 2: Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Or connect via Vercel Dashboard → Import from GitHub
```

### Step 3: Set environment variables in Vercel

Vercel Dashboard → Project → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL        → your value
NEXT_PUBLIC_SUPABASE_ANON_KEY   → your value
SUPABASE_SERVICE_ROLE_KEY       → your value (mark as Secret)
NEXT_PUBLIC_APP_URL             → https://your-domain.vercel.app
```

### Step 4: Configure Supabase Auth redirect URLs

Supabase Dashboard → Authentication → URL Configuration:

```
Site URL: https://your-domain.vercel.app
Redirect URLs: https://your-domain.vercel.app/admin/dashboard
```

### Step 5: Verify Realtime is working

After deployment, open:
1. Admin panel `/admin/live/SESSION_ID` 
2. Projector screen `/screen/SESSION_ID` (different browser tab)
3. Participant `/play/SESSION_ID` (mobile or incognito)

Start a session and verify all three update simultaneously.

### Optional: Custom domain

Vercel Dashboard → Project → Domains → Add domain

---

## 6. Competition Flow (Quick Reference)

```
1. Admin: Create Competition → Add Session → Add Rounds → Add Questions
2. Admin: Open session (status: lobby) → share session code
3. Participants: Go to /join → enter code + name → enter waiting room
4. Admin: /admin/live/[sessionId] → "Start Session"
5. For each question:
   a. Admin: "Open Answering" → timer starts → participants can answer
   b. Participants: tap A/B/C/D → submitted state
   c. Admin: "Lock Answering" when ready
   d. Admin: (optional) "Show Distribution"
   e. Admin: "Reveal Answer" → scores calculated → screen updates
   f. Admin: (optional) "Show Leaderboard"
   g. Admin: "Next Question"
6. Admin: "End Session" → final leaderboard → /results/[sessionId]
```

---

## 7. Anti-Cheat Summary

| Threat | Mitigation |
|--------|-----------|
| Client submits before window opens | Server checks `display_state.answer_window_state === 'open'` |
| Client manipulates timestamp for speed bonus | Server captures `new Date()` as first operation in Route Handler |
| Client reads correct answer | `is_correct` only exposed via `question_options` after `reveal_state = 'answer_revealed'` in display layer |
| Duplicate submissions | `UNIQUE(participant_id, question_id)` constraint + idempotency check |
| Submit after timer expires | Server checks `timer_started_at + duration < now` with 500ms grace |
| Submit to wrong question | Server checks `selected_option_id` belongs to `current_question_id` |
| Participant sees others' answers | RLS: participants can only SELECT their own answer rows |
| Admin spoofing | All admin actions verify user role from `profiles` table via authenticated session |

---

## 8. Scaling Notes (300+ concurrent participants)

- **Supabase Realtime** handles ~10,000 concurrent connections on Pro plan. 300 is well within limits.
- **Leaderboard reads** are served from `leaderboard_snapshots` (pre-computed on each reveal), not live aggregates.
- **Answer distribution** is polled every 2s on the screen — a single indexed COUNT query. At 300 participants this is sub-5ms.
- **answer submissions** go to a Route Handler (not Realtime), so they don't congest the WS channel.
- **Presence** tracking is lightweight — only metadata (name, join_code), not answer data.
- If you hit Supabase Realtime limits, add debouncing on the display_state subscriber (batch updates every 500ms).

---

## 9. Five Smart Product Suggestions

### 1. QR Code Session Join
**Instead of typing the session code**, display a QR code on the projector screen that links directly to `/join?code=SPAK2025`. Reduces join friction from ~15 seconds to 3 seconds. Especially useful for large groups. Generate it server-side using `qrcode` npm package and embed it in the screen UI. This alone will save 5-10 minutes at the start of every competition.

### 2. Practice Mode with Instant Feedback
**Add a dedicated practice session type** where correct answers are revealed immediately after each submission (no admin reveal step). Students can use this during free periods to test themselves on past competition questions. The admin can mark a session as `practice=true` and the participant UI auto-reveals the answer locally using the correct `question_options` row — safe to fetch after submission since there's no competitive integrity concern. This builds student confidence and keeps the platform used year-round, not just during competitions.

### 3. SMS/WhatsApp Fallback for Poor Connectivity
**For participants with weak internet**, provide a SMS-based answer path: "Text A, B, C, or D to +234-XXX-XXXX. Include your join code." A Twilio webhook hits an API endpoint that calls the same `/api/answers/submit` Route Handler. Server-side timestamps still apply. This matters because school competition venues in Nigeria often have congested WiFi when 200+ students connect simultaneously.

### 4. Question Import from CSV/Excel
**Admins shouldn't type questions into a web form**. Build a CSV importer: `Question,A,B,C,D,Correct,Time,Points`. One-click import creates all questions and options in bulk. Teachers prepare questions in Google Sheets, export as CSV, upload. This is a 30-minute build that removes the biggest adoption barrier for non-technical moderators. Add validation to catch missing correct answers, duplicate questions, and malformed options before import.

### 5. Post-Competition Analytics Dashboard
**Every competition should generate insight**, not just a winner. Build a per-question analytics view: which question had the lowest correct-answer rate? What was the average response time per question? Which participants improved between rounds? Export to PDF for school records. This turns the platform from a one-day event tool into a teaching instrument — teachers can identify knowledge gaps and adjust their curriculum. Store all this in the existing `answers` table; it's all already captured.
#   i j a g a m e  
 