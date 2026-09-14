// Hand-rolled SVG radar chart — no charting library in this codebase (see
// web/src/components/layout/icons.tsx's all-inline-SVG convention). A
// REGULAR N-GON, same generalization as SkillEvaluationChart.tsx's — a
// 5-axis per-sport stat set draws a pentagon, but the "overall win rate by
// sport" chart (ProfilePage.tsx) has one axis per sport the player's
// actually played, which isn't always 5.
type PentagonAxis = { key: string; label: string; scale_max: number }

// SIZE is deliberately much bigger than the chart itself (RADIUS) — the
// leftover margin is where axis labels live, and a longer label like
// "Shooting %" or "TO/G" needs real room to extend into on the chart's
// left/right sides without clipping against the viewBox edge (see
// SkillEvaluationChart.tsx's identical fix for the same reason).
const SIZE = 320
const CENTER = SIZE / 2
const RADIUS = 80
const LABEL_RADIUS = RADIUS + 45
const RING_SCALES = [0.33, 0.66, 1]

function pointAt(index: number, total: number, scale: number): { x: number; y: number } {
  // Start at the top (12 o'clock) and go clockwise, one vertex per axis.
  const angle = (index * 2 * Math.PI) / total - Math.PI / 2
  return {
    x: CENTER + RADIUS * scale * Math.cos(angle),
    y: CENTER + RADIUS * scale * Math.sin(angle),
  }
}

function polygonPoints(total: number, scale: number): string {
  return Array.from({ length: total }, (_, i) => pointAt(i, total, scale))
    .map((p) => `${p.x},${p.y}`)
    .join(' ')
}

// Same edge-safe label anchoring as SkillEvaluationChart.tsx — a label
// centered on a vertex near the left/right edge clips against the viewBox.
function anchorFor(x: number): 'start' | 'middle' | 'end' {
  const dx = x - CENTER
  if (Math.abs(dx) < 8) return 'middle'
  return dx > 0 ? 'start' : 'end'
}

export function PlayerStatsPentagon({
  sportName,
  axes,
  totals,
  matchesPlayed,
}: {
  sportName: string
  axes: PentagonAxis[]
  totals: Record<string, number>
  matchesPlayed: number
}) {
  if (axes.length < 3) return null

  const sides = axes.length
  // Clamped only for the polygon's shape — the label text below always
  // shows the real, unclamped career total.
  const dataScales = axes.map((axis) => Math.min(totals[axis.key] ?? 0, axis.scale_max) / axis.scale_max)

  return (
    <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-slate-100 p-4">
      <p className="text-sm font-semibold text-slate-800">{sportName}</p>
      <p className="text-xs text-slate-400">
        {matchesPlayed} match{matchesPlayed === 1 ? '' : 'es'} recorded
      </p>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[280px]">
        {RING_SCALES.map((scale) => (
          <polygon key={scale} points={polygonPoints(sides, scale)} fill="none" stroke="#e2e8f0" strokeWidth={1} />
        ))}
        {axes.map((_, i) => {
          const outer = pointAt(i, sides, 1)
          return <line key={i} x1={CENTER} y1={CENTER} x2={outer.x} y2={outer.y} stroke="#e2e8f0" strokeWidth={1} />
        })}
        <polygon
          points={dataScales.map((scale, i) => { const p = pointAt(i, sides, scale); return `${p.x},${p.y}` }).join(' ')}
          fill="rgb(13 148 136 / 0.25)"
          stroke="rgb(13 148 136)"
          strokeWidth={2}
        />
        {axes.map((axis, i) => {
          const label = pointAt(i, sides, LABEL_RADIUS / RADIUS)
          const total = totals[axis.key] ?? 0
          return (
            <text
              key={axis.key}
              x={label.x}
              y={label.y}
              textAnchor={anchorFor(label.x)}
              dominantBaseline="middle"
              className="fill-slate-600"
              style={{ fontSize: 10 }}
            >
              <tspan x={label.x} dy="-0.4em" fontWeight={600}>{total}</tspan>
              <tspan x={label.x} dy="1.1em">{axis.label}</tspan>
            </text>
          )
        })}
      </svg>
    </div>
  )
}
