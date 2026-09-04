import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { AuthModal, type AuthMode } from '../components/auth/AuthModal'
import { PublicNewsModal } from '../components/landing/PublicNewsModal'
import { ContactAdminForm } from '../components/landing/ContactAdminForm'
import { useIsMobile } from '../lib/useIsMobile'

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

// Mobile nav row icons — distinct from the feature/about icons above (those
// represent product capabilities; these represent the five nav destinations
// themselves), kept as their own small set so swapping one doesn't risk
// misreading as changing a feature's icon elsewhere on the page.
function NavIconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3.5 10 8.5-7 8.5 7" />
      <path d="M5.5 9v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9" />
    </svg>
  )
}

function NavIconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  )
}

function NavIconInfo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.1" fill="currentColor" stroke="currentColor" />
    </svg>
  )
}

function NavIconNews() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="15" height="16" rx="1.5" />
      <path d="M18 8h3v10a2 2 0 0 1-2 2H6" />
      <path d="M7 8h7M7 12h7M7 16h4" />
    </svg>
  )
}

function NavIconHelp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.5 2.1-2.5 3.9" />
      <circle cx="12" cy="17" r="0.1" fill="currentColor" stroke="currentColor" />
    </svg>
  )
}

// Scroll-reveal: fades/slides an element in the first time it enters the
// viewport, then leaves it alone (observer disconnects after triggering
// once, so scrolling back up and down doesn't replay it). Skips the
// animation entirely under prefers-reduced-motion — content just renders
// visible immediately, never stuck at opacity: 0 waiting on an observer
// that a reduced-motion user wouldn't want firing anyway.
function Reveal({ children, className = '', delayMs = 0 }: { children: ReactNode; className?: string; delayMs?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return
    }
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'} ${className}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
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

const MOBILE_NAV_ITEMS: { id: string; label: string; icon: () => JSX.Element; href?: string }[] = [
  { id: 'home', label: 'Home', icon: NavIconHome, href: '#home' },
  { id: 'features', label: 'Features', icon: NavIconGrid, href: '#features' },
  { id: 'about', label: 'About', icon: NavIconInfo, href: '#about' },
  { id: 'news', label: 'News', icon: NavIconNews },
  { id: 'faq', label: 'FAQ', icon: NavIconHelp, href: '#faq' },
]

export function LandingPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [authModal, setAuthModal] = useState<{ open: boolean; mode: AuthMode }>({
    open: false,
    mode: 'login',
  })
  const [newsModalOpen, setNewsModalOpen] = useState(false)

  function openAuth(mode: AuthMode) {
    setAuthModal({ open: true, mode })
  }

  // Mobile only: the logo/Join Now row slides up out of view once the
  // visitor scrolls down (leaving only the icon nav row, which shifts up to
  // take its place), and slides back the moment they scroll up at all — the
  // same "sticky element whose own top offset chases the header" technique
  // DashboardShell uses for its mobile icon bar. Desktop is untouched: both
  // rows stay put regardless of scroll.
  const headerRef = useRef<HTMLElement>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  const [headerHidden, setHeaderHidden] = useState(false)
  const lastScrollY = useRef(0)

  useLayoutEffect(() => {
    if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight)
  }, [isMobile])

  useEffect(() => {
    if (!isMobile) {
      setHeaderHidden(false)
      return
    }

    lastScrollY.current = window.scrollY

    function handleScroll() {
      const currentY = window.scrollY
      if (Math.abs(currentY - lastScrollY.current) < 8) return

      if (currentY > lastScrollY.current && currentY > headerHeight) {
        setHeaderHidden(true)
      } else if (currentY < lastScrollY.current) {
        setHeaderHidden(false)
      }
      lastScrollY.current = currentY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isMobile, headerHeight])

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header
        ref={headerRef}
        style={isMobile ? { transform: headerHidden ? `translateY(-${headerHeight}px)` : 'translateY(0)' } : undefined}
        className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur transition-transform duration-300"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <img src="/logo.png" alt="" className="h-8 w-8" />
            Sport<span className="text-teal-600">Hub</span>
          </span>
          <div className="hidden gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#home" className="hover:text-slate-900">Home</a>
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#about" className="hover:text-slate-900">About</a>
            <button onClick={() => setNewsModalOpen(true)} className="hover:text-slate-900">News</button>
            <a href="#faq" className="hover:text-slate-900">FAQ</a>
          </div>
          {/* Sign In / Join Now only have room to sit inline with the nav
              links from md up. Below that, the icon row underneath (see
              MOBILE_NAV_ITEMS) replaces these text links entirely, and Join
              Now alone stands in for this whole block, level with the logo —
              Sign In stays reachable from there via the register form's own
              "Already have an account?" link. */}
          <div className="hidden items-center gap-4 md:flex">
            <button
              onClick={() => openAuth('login')}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Sign In
            </button>
            <button
              onClick={() => openAuth('register')}
              className="flex items-center gap-1.5 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-pure-white transition hover:bg-teal-700 active:scale-95"
            >
              Join Now
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
          <button
            onClick={() => openAuth('register')}
            className="flex items-center gap-1.5 rounded-md bg-teal-600 px-3.5 py-2 text-sm font-semibold text-pure-white transition active:scale-95 md:hidden"
          >
            Join Now
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
      </header>

      {/* Mobile-only icon nav, replacing the old hamburger dropdown — every
          destination is one tap away instead of two, and it matches
          DashboardShell's own mobile icon bar elsewhere in the app. Its own
          sticky `top` chases the header above: flush beneath it while the
          header's showing, and up to top-0 the moment the header slides
          away, so it always ends up occupying the header's vacated spot
          instead of leaving a gap. */}
      <div
        style={isMobile ? { top: headerHidden ? 0 : headerHeight } : undefined}
        className="sticky z-20 flex items-center justify-center gap-1 overflow-x-auto border-b border-slate-100 bg-white/90 px-2 py-1.5 backdrop-blur transition-[top] duration-300 md:hidden"
      >
        {MOBILE_NAV_ITEMS.map((item) => {
          const content = (
            <>
              <item.icon />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </>
          )
          const className =
            'flex shrink-0 flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-slate-600 transition [&_svg]:h-5 [&_svg]:w-5 hover:bg-slate-50 hover:text-slate-900'

          return item.href ? (
            <a key={item.id} href={item.href} className={className}>
              {content}
            </a>
          ) : (
            <button key={item.id} onClick={() => setNewsModalOpen(true)} className={className}>
              {content}
            </button>
          )
        })}
      </div>

      {/* This header always sits over a fixed dark photo backdrop
          (hero.jpg + a dark gradient scrim), independent of the app's own
          Championship Spirit/Night Game Lights toggle — so every color in
          it uses the pure-* / fixed tokens rather than the theme-reactive
          teal/slate/white scale, which would otherwise invert against a
          background that never changes. */}
      <section
        id="home"
        className="relative scroll-mt-16 overflow-hidden bg-cover bg-center text-pure-white"
        style={{
          backgroundImage:
            'linear-gradient(160deg, rgba(9, 38, 38, 0.82), rgba(11, 61, 58, 0.72)), url(/hero.jpg)',
        }}
      >
        <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-28 text-center">
          <Reveal className="flex flex-col items-center">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-pure-white/25 bg-pure-white/10 px-4 py-1.5 text-sm font-medium">
              <span aria-hidden="true">&#127942;</span>
              Binangonan, Rizal&apos;s Municipal Sports Platform
            </span>
            <h1 className="text-4xl font-extrabold leading-tight text-balance sm:text-5xl md:text-6xl">
              Every Court, Every Coach, Every Match &mdash; One Platform
            </h1>
          </Reveal>
          <Reveal delayMs={120}>
            <p className="mt-6 max-w-2xl text-lg text-pure-white/90">
              Sporthub brings venue booking, tournament brackets, live scoreboards, and skill-based
              matchmaking together for organizers, facilitators, coaches, and players across the
              Municipality of Binangonan, Rizal.
            </p>
          </Reveal>
          <Reveal delayMs={240} className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => openAuth('register')}
              className="rounded-md bg-teal-500 px-6 py-3 font-semibold text-pure-white shadow-lg shadow-teal-900/30 transition hover:-translate-y-0.5 hover:bg-teal-400 hover:shadow-xl active:translate-y-0 active:scale-95"
            >
              Join Sporthub &rarr;
            </button>
            <a
              href="#features"
              className="rounded-md border border-pure-white/30 bg-pure-white/5 px-6 py-3 font-semibold text-pure-white transition hover:-translate-y-0.5 hover:bg-pure-white/15"
            >
              See how it works
            </a>
          </Reveal>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-widest text-teal-600">Features</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-extrabold text-balance text-slate-900 sm:text-4xl">
            Key tools for better sports management in Binangonan.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delayMs={(i % 3) * 90}>
              <div className="group h-full rounded-xl border border-slate-100 bg-slate-50/60 p-6 transition duration-300 hover:-translate-y-1 hover:border-teal-100 hover:bg-teal-50/40 hover:shadow-lg">
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
            </Reveal>
          ))}
        </div>
      </section>

      <section id="about" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-widest text-teal-600">About Sporthub</p>
            <h2 className="mt-2 max-w-3xl text-3xl font-extrabold text-balance text-slate-900 sm:text-4xl">
              End-to-end platform for the Municipality of Binangonan&apos;s sports program.
            </h2>
            <p className="mt-6 max-w-3xl text-lg text-slate-600">
              Sporthub gives every part of Binangonan&apos;s municipal sports program its own workspace:
              venues and courts for facilitators, tournaments and brackets for organizers, evaluations
              and registrations for coaches, and bookings, matchmaking, and profiles for players
              &mdash; all backed by the same real-time data.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {ABOUT_POINTS.map((point, i) => (
              <Reveal key={point.title} delayMs={i * 90}>
                <div className="group h-full rounded-xl border border-slate-100 bg-slate-50/60 p-6 transition duration-300 hover:-translate-y-1 hover:border-teal-100 hover:bg-teal-50/40 hover:shadow-lg">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-700 transition-transform duration-300 group-hover:-translate-y-1">
                    <point.icon />
                  </div>
                  <h3 className="mt-4 font-bold text-slate-900">{point.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{point.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Also a fixed dark band (bg-slate-950, untouched by the palette
          override) regardless of app theme — see the hero section above for
          why this section uses pure-* tokens instead of the theme-reactive
          ones. The form itself sits on a plain white card so its inputs get
          normal light-mode contrast rather than trying to style form
          controls for a dark background. */}
      <section id="faq" className="scroll-mt-16 bg-slate-950 text-pure-white">
        <div className="mx-auto max-w-2xl px-6 py-20">
          <Reveal className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-teal-400">FAQ &amp; Support</p>
            <h2 className="mt-2 text-3xl font-extrabold text-balance sm:text-4xl">
              Have a question? Ask us directly.
            </h2>
            <p className="mt-4 text-pure-white/70">
              Send a message and we&apos;ll reply straight to your email &mdash; no account needed.
            </p>
          </Reveal>

          <Reveal delayMs={120} className="mt-10 rounded-2xl bg-white p-6 text-left text-slate-900 shadow-2xl sm:p-8">
            <ContactAdminForm />
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">
        Sporthub &mdash; Municipal Sport Community Hub of Binangonan, Rizal
      </footer>

      <AuthModal
        open={authModal.open}
        initialMode={authModal.mode}
        onClose={() => setAuthModal((s) => ({ ...s, open: false }))}
        onAuthenticated={() => {
          setAuthModal((s) => ({ ...s, open: false }))
          navigate('/dashboard', { replace: true })
        }}
      />
      <PublicNewsModal open={newsModalOpen} onClose={() => setNewsModalOpen(false)} />
    </div>
  )
}
