import { buttonDanger } from '../../lib/formStyles'

// Continuous rotation for every "spinning" sport (basketball, badminton,
// tennis, pickleball, table tennis) — a shared keyframe so they all spin at
// the same speed instead of each SVG rolling its own animation timing.
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
  // Small hole pattern scattered across the face, mimicking a whiffle-style
  // pickleball rather than a smooth ball.
  const holes = [
    [50, 22], [32, 30], [68, 30], [22, 50], [78, 50],
    [32, 70], [68, 70], [50, 78], [50, 50], [40, 42], [60, 42], [40, 58], [60, 58],
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
  // Previously an all near-white palette (fill/stroke/highlight) on this
  // card's near-white bg-teal-50/50 background, making the icon render but
  // be effectively invisible — switched to the orange competition-ball
  // colorway used at most table tennis clubs, matching every other icon
  // here's use of a strongly saturated fill against a darker stroke.
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
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-teal-100 bg-teal-50/50 p-6 text-center">
      <div className="h-20 w-20">
        <SportIcon sportName={sportName} />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800">Looking for a {sportName} match&hellip;</p>
        <p className="mt-0.5 text-xs text-slate-500">We'll notify you the instant an opponent is found.</p>
      </div>
      <button onClick={onCancel} disabled={cancelling} className={buttonDanger}>
        {cancelling ? 'Cancelling...' : 'Cancel Matchmaking'}
      </button>
    </div>
  )
}
