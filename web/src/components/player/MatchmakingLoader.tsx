import { buttonDanger } from '../../lib/formStyles'

const SPORT_ACCENTS: Record<string, string> = {
  basketball: '#f97316',
  volleyball: '#2563eb',
  badminton: '#f43f5e',
  tennis: '#84cc16',
  pickleball: '#facc15',
  'table tennis': '#fb923c',
  soccer: '#22c55e',
  football: '#22c55e',
  default: '#14b8a6',
}

const spin = 'animate-[spin_1.8s_linear_infinite]'

function BasketballIcon() {
  return (
    <svg viewBox="0 0 100 100" className={`h-full w-full ${spin}`}>
      <circle cx="50" cy="50" r="46" fill="#f0842a" stroke="#4a2a0a" strokeWidth="3" />
      <path
        d="M50 4 V96 M4 50 H96 M14 14 Q50 50 14 86 M86 14 Q50 50 86 86"
        stroke="#4a2a0a"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

function VolleyballIcon() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full animate-bounce">
      <circle cx="50" cy="50" r="46" fill="#fefefe" stroke="#1d4ed8" strokeWidth="3" />
      <path
        d="M50 4 Q74 30 50 50 Q26 70 50 96"
        stroke="#1d4ed8"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M6 38 Q34 46 50 50 Q66 54 94 62"
        stroke="#facc15"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M10 78 Q38 56 50 50 Q62 44 90 22"
        stroke="#1d4ed8"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ShuttlecockIcon() {
  return (
    <svg viewBox="0 0 100 100" className={`h-full w-full ${spin}`}>
      <path d="M50 6 L24 58 L76 58 Z" fill="#fdfdfd" stroke="#cbd5e1" strokeWidth="2" />
      <path
        d="M50 6 L38 58 M50 6 L50 58 M50 6 L62 58"
        stroke="#cbd5e1"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <ellipse cx="50" cy="58" rx="12" ry="5" fill="#fca5a5" />
      <ellipse cx="50" cy="68" rx="9" ry="11" fill="#f87171" />
    </svg>
  )
}

function TennisBallIcon() {
  return (
    <svg viewBox="0 0 100 100" className={`h-full w-full ${spin}`}>
      <circle cx="50" cy="50" r="46" fill="#d4f24d" stroke="#8fb800" strokeWidth="3" />
      <path d="M6 28 Q50 8 94 28" stroke="#fefefe" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M6 72 Q50 92 94 72" stroke="#fefefe" strokeWidth="4.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function PickleballIcon() {
  const holes = [
    [50, 22], [32, 30], [68, 30], [22, 50], [78, 50], [32, 70], [68, 70], [50, 78], [50, 50], [40, 42],
    [60, 42], [40, 58], [60, 58],
  ]
  return (
    <svg viewBox="0 0 100 100" className={`h-full w-full ${spin}`}>
      <circle cx="50" cy="50" r="46" fill="#fde047" stroke="#ca8a04" strokeWidth="3" />
      {holes.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.4" fill="#a16207" opacity="0.55" />
      ))}
    </svg>
  )
}

function TableTennisIcon() {
  return (
    <svg viewBox="0 0 100 100" className={`h-full w-full ${spin}`}>
      <circle cx="50" cy="50" r="46" fill="#fb923c" stroke="#c2410c" strokeWidth="3" />
      <ellipse cx="37" cy="34" rx="9" ry="5" fill="#fff7ed" opacity="0.85" />
    </svg>
  )
}

function GenericBallIcon() {
  return (
    <svg viewBox="0 0 100 100" className={`h-full w-full ${spin}`}>
      <circle cx="50" cy="50" r="46" fill="#5eead4" stroke="#0f766e" strokeWidth="3" />
      <path d="M50 4 V96 M4 50 H96" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SportIcon({ sportName }: { sportName: string }) {
  switch (sportName.trim().toLowerCase()) {
    case 'basketball':
      return <BasketballIcon />
    case 'volleyball':
      return <VolleyballIcon />
    case 'badminton':
      return <ShuttlecockIcon />
    case 'tennis':
      return <TennisBallIcon />
    case 'pickleball':
      return <PickleballIcon />
    case 'table tennis':
      return <TableTennisIcon />
    default:
      return <GenericBallIcon />
  }
}

export function MatchmakingLoader({
  sportName,
  onCancel,
  cancelling,
}: {
  sportName: string
  onCancel: () => void
  cancelling: boolean
}) {
  const accent = SPORT_ACCENTS[sportName.trim().toLowerCase()] ?? SPORT_ACCENTS.default

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-teal-50/80 p-5 shadow-sm">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.9),_transparent_55%)]" />
      <div className="relative flex flex-col items-center gap-4 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border-2 border-dashed opacity-80"
            style={{ borderColor: accent, animation: 'spin-slow 4s linear infinite' }}
          />
          <div
            className="absolute inset-2 rounded-full border border-white/80"
            style={{ boxShadow: `inset 0 0 20px ${accent}33, 0 0 18px ${accent}22` }}
          />
          <div
            className="absolute inset-3 rounded-full"
            style={{
              background: `radial-gradient(circle, ${accent}20 0%, ${accent}10 38%, rgba(255,255,255,0.4) 62%, rgba(255,255,255,0.05) 100%)`,
            }}
          />
          <div className="relative h-12 w-12 drop-shadow-[0_0_16px_rgba(20,184,166,0.35)]">
            <SportIcon sportName={sportName} />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-slate-800">
            Looking for a <span style={{ color: accent }}>{sportName}</span> match
            <span className="ml-1 inline-flex gap-1 align-middle">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
            </span>
          </p>
          <p className="text-xs text-slate-500">We'll alert you as soon as a suitable opponent is found.</p>
        </div>

        <button onClick={onCancel} disabled={cancelling} className={buttonDanger}>
          {cancelling ? 'Cancelling...' : 'Cancel Matchmaking'}
        </button>
      </div>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
