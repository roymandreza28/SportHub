// Hand-rolled SVG radar chart — no charting library in this codebase (see
// web/src/components/layout/icons.tsx's all-inline-SVG convention), and a
// 5-axis pentagon is simple enough to compute directly with trigonometry
// rather than pulling in a dependency for one chart type.
type PentagonAxis = { key: string; label: string; scale_max: number }

const SIZE = 240
const CENTER = SIZE / 2
const RADIUS = SIZE * 0.34
const LABEL_RADIUS = SIZE * 0.44
const RING_SCALES = [0.33, 0.66, 1]

function pointAt(index: number, scale: number): { x: number; y: number } {
  // Start at the top (12 o'clock) and go clockwise, one vertex per axis.
  const angle = index * ((2 * Math.PI) / 5) - Math.PI / 2
  return {
    x: CENTER + RADIUS * scale * Math.cos(angle),
    y: CENTER + RADIUS * scale * Math.sin(angle),
  }
}

function polygonPoints(scales: number[]): string {
  return scales.map((scale, i) => { const p = pointAt(i, scale); return `${p.x},${p.y}` }).join(' ')
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
  if (axes.length === 0) return null

  // Clamped only for the polygon's shape — the label text below always
  // shows the real, unclamped career total.
  const dataScales = axes.map((axis) => Math.min(totals[axis.key] ?? 0, axis.scale_max) / axis.scale_max)

  return (
    <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-slate-100 p-4">
      <p className="text-sm font-semibold text-slate-800">{sportName}</p>
      <p className="text-xs text-slate-400">
        {matchesPlayed} match{matchesPlayed === 1 ? '' : 'es'} recorded
      </p>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        {RING_SCALES.map((scale) => (
          <polygon key={scale} points={polygonPoints([scale, scale, scale, scale, scale])} fill="none" stroke="#e2e8f0" strokeWidth={1} />
        ))}
        {axes.map((_, i) => {
          const outer = pointAt(i, 1)
          return <line key={i} x1={CENTER} y1={CENTER} x2={outer.x} y2={outer.y} stroke="#e2e8f0" strokeWidth={1} />
        })}
        <polygon points={polygonPoints(dataScales)} fill="rgb(13 148 136 / 0.25)" stroke="rgb(13 148 136)" strokeWidth={2} />
        {axes.map((axis, i) => {
          const label = pointAt(i, LABEL_RADIUS / RADIUS)
          const total = totals[axis.key] ?? 0
          return (
            <text
              key={axis.key}
              x={label.x}
              y={label.y}
              textAnchor="middle"
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
