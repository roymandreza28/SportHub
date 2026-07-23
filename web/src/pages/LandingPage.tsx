import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AuthModal, type AuthMode } from '../components/auth/AuthModal'

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v3M16 3v3" />
      <path d="m8.5 14 2 2 4-4" />
    </svg>
  )
}

function IconTrophy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5" />
      <path d="M12 14v3M9 20h6M9.5 20c0-1.8.7-2.6 2.5-3 1.8.4 2.5 1.2 2.5 3" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="8" r="3" />
      <path d="M2.5 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="8.5" r="2.5" />
      <path d="M14.5 20a5 5 0 0 1 7-4.6" />
    </svg>
  )
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M2.5 20.5h19" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5 5 6v5.5c0 4.6 2.9 7.9 7 9 4.1-1.1 7-4.4 7-9V6l-7-2.5Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function IconBroadcast() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7.5 8.5a6.5 6.5 0 0 0 0 7M16.5 8.5a6.5 6.5 0 0 1 0 7M4.5 5.5a11 11 0 0 0 0 13M19.5 5.5a11 11 0 0 1 0 13" />
    </svg>
  )
}

const FEATURES = [
  {
    icon: IconCalendar,
    title: 'Venue Booking & Scheduling',
    points: [
      'Interactive venue map for the whole city',
      'Live court and equipment availability',
      'Facilitator approval queue for requests',
      'Conflict-free booking windows per court',
    ],
  },
  {
    icon: IconTrophy,
    title: 'Tournament Brackets',
    points: [
      'Single-elimination and round-robin formats',
      'Automatic seeding and bye distribution',
      'Live scoreboard as matches are played',
      'Automatic round-by-round advancement',
    ],
  },
  {
    icon: IconUsers,
    title: 'Skill-Based Matchmaking',
    points: [
      'Real-time opponent pairing by sport',
      'Matched instantly when someone else is looking',
      'No manual browsing for an opponent',
      'Live pairing notification the moment it happens',
    ],
  },
  {
    icon: IconChart,
    title: 'Coach Evaluations',
    points: [
      'Per-sport skill level tracking',
      'Full evaluation history, not just a current score',
      'Tournament registration on a player’s behalf',
      'Progress visible to the player over time',
    ],
  },
  {
    icon: IconShield,
    title: 'Role-Based Access',
    points: [
      'Five dashboards: Admin, Organizer, Facilitator, Coach, Player',
      'Roles and permissions managed by admins, not code',
      'Facilitators and organizers scoped to their own venues/events',
      'Every action logged to an audit trail',
    ],
  },
  {
    icon: IconBroadcast,
    title: 'Live News & Streaming',
    points: [
      'Community news feed from organizers',
      'Embedded livestreams linked to a tournament',
      'Real-time viewer chat during a broadcast',
      'Scoreboard updates reach every open tab instantly',
    ],
  },
]

const ABOUT_POINTS = [
  {
    icon: IconUsers,
    title: 'Built for Every Stakeholder',
    body: 'Organizers, facilitators, coaches, and players each get a dashboard scoped to exactly what their role needs to do — nothing more.',
  },
  {
    icon: IconBroadcast,
    title: 'Real-Time by Design',
    body: 'Scores, pairings, and bracket updates reach every open screen the instant they happen, over a live WebSocket connection — no refreshing.',
  },
  {
    icon: IconShield,
    title: 'Secure, Role-Based Access',
    body: 'Every action is checked against real server-side permissions, not a hidden button — admins control who can do what, and it’s enforced everywhere.',
  },
]

export function LandingPage() {
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [authModal, setAuthModal] = useState<{ open: boolean; mode: AuthMode }>({
    open: false,
    mode: 'login',
  })

  function openAuth(mode: AuthMode) {
    setMobileMenuOpen(false)
    setAuthModal({ open: true, mode })
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <nav className="sticky top-0 z-10 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <img src="/logo.png" alt="" className="h-8 w-8" />
            Sport<span className="text-teal-600">Hub</span>
          </span>
          <div className="hidden gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#home" className="hover:text-slate-900">Home</a>
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#about" className="hover:text-slate-900">About</a>
            <a href="#get-started" className="hover:text-slate-900">Get started</a>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => openAuth('login')}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Sign In
            </button>
            <button
              onClick={() => openAuth('register')}
              className="flex items-center gap-1.5 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Join Now
              <span aria-hidden="true">&rarr;</span>
            </button>
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 md:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
                {mobileMenuOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="flex flex-col gap-1 border-t border-slate-100 px-6 py-3 text-sm font-medium text-slate-600 md:hidden">
            <a href="#home" onClick={() => setMobileMenuOpen(false)} className="rounded px-2 py-2 hover:bg-slate-50">Home</a>
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="rounded px-2 py-2 hover:bg-slate-50">Features</a>
            <a href="#about" onClick={() => setMobileMenuOpen(false)} className="rounded px-2 py-2 hover:bg-slate-50">About</a>
            <a href="#get-started" onClick={() => setMobileMenuOpen(false)} className="rounded px-2 py-2 hover:bg-slate-50">Get started</a>
          </div>
        )}
      </nav>

      <header
        id="home"
        className="relative scroll-mt-16 overflow-hidden bg-cover bg-center text-white"
        style={{
          backgroundImage:
            'linear-gradient(160deg, rgba(9, 38, 38, 0.82), rgba(11, 61, 58, 0.72)), url(/hero.jpg)',
        }}
      >
        <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-28 text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-medium">
            <span aria-hidden="true">&#127942;</span>
            Morong, Rizal&apos;s Municipal Sports Platform
          </span>
          <h1 className="text-4xl font-extrabold leading-tight text-balance sm:text-5xl md:text-6xl">
            Every Court, Every Coach, Every Match &mdash; One Platform
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-teal-50/90">
            Sporthub brings venue booking, tournament brackets, live scoreboards, and skill-based
            matchmaking together for organizers, facilitators, coaches, and players across the
            Municipality of Morong, Rizal.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => openAuth('register')}
              className="rounded-md bg-teal-500 px-6 py-3 font-semibold text-white shadow-lg shadow-teal-900/30 hover:bg-teal-400"
            >
              Join Sporthub &rarr;
            </button>
            <a
              href="#features"
              className="rounded-md border border-white/30 bg-white/5 px-6 py-3 font-semibold text-white hover:bg-white/15"
            >
              See how it works
            </a>
          </div>
        </div>
      </header>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-600">Features</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold text-balance text-slate-900 sm:text-4xl">
          Key tools for better sports management in Morong.
        </h2>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-slate-100 bg-slate-50/60 p-6 transition hover:border-teal-100 hover:bg-teal-50/40"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-100 text-teal-700 transition-transform duration-300 group-hover:-translate-y-1">
                <feature.icon />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{feature.title}</h3>
              <ul className="mt-3 flex flex-col gap-2">
                {feature.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-slate-600">
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-0.5 h-4 w-4 shrink-0 text-teal-600"
                    >
                      <path d="m4 10 4 4 8-8" />
                    </svg>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="about" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="text-sm font-semibold uppercase tracking-widest text-teal-600">About Sporthub</p>
          <h2 className="mt-2 max-w-3xl text-3xl font-extrabold text-balance text-slate-900 sm:text-4xl">
            End-to-end platform for the Municipality of Morong&apos;s sports program.
          </h2>
          <p className="mt-6 max-w-3xl text-lg text-slate-600">
            Sporthub gives every part of Morong&apos;s municipal sports program its own workspace:
            venues and courts for facilitators, tournaments and brackets for organizers, evaluations
            and registrations for coaches, and bookings, matchmaking, and profiles for players
            &mdash; all backed by the same real-time data.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {ABOUT_POINTS.map((point) => (
              <div
                key={point.title}
                className="group rounded-xl border border-slate-100 bg-slate-50/60 p-6 transition hover:border-teal-100 hover:bg-teal-50/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-700 transition-transform duration-300 group-hover:-translate-y-1">
                  <point.icon />
                </div>
                <h3 className="mt-4 font-bold text-slate-900">{point.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="get-started" className="scroll-mt-16 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-teal-400">Get started</p>
          <h2 className="max-w-2xl text-3xl font-extrabold text-balance sm:text-4xl">
            Ready to get Morong playing?
          </h2>
          <p className="max-w-xl text-slate-300">
            Register as a player in seconds, or sign in if your organizer has already set up your
            account. Coaches, facilitators, and organizers: ask your admin for role access after
            registering.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => openAuth('register')}
              className="rounded-md bg-teal-500 px-6 py-3 font-semibold text-white hover:bg-teal-400"
            >
              Create free account
            </button>
            <button
              onClick={() => openAuth('login')}
              className="rounded-md border border-white/25 px-6 py-3 font-semibold text-white hover:bg-white/10"
            >
              Sign In
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">
        Sporthub &mdash; Municipal Sport Community Hub of Morong, Rizal
      </footer>

      <AuthModal
        open={authModal.open}
        initialMode={authModal.mode}
        onClose={() => setAuthModal((s) => ({ ...s, open: false }))}
        onAuthenticated={() => {
          setAuthModal((s) => ({ ...s, open: false }))
          navigate('/dashboard')
        }}
      />
    </div>
  )
}
