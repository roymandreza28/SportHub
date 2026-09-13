import { SPORT_ATTRIBUTE_CRITERIA } from '../../lib/evaluationCriteria'

// A radar/spider chart of a coach's actual per-attribute ratings for one
// sport — not just the overall level badge. Mirrors PlayerStatsPentagon.tsx
// (career match-stat totals) visually, but that one is a fixed 5-axis
// pentagon; this shape is a REGULAR N-GON, since N is however many
// attributes that sport's SPORT_ATTRIBUTE_CRITERIA defines (6 for
// Basketball, 7 for the rest today — see evaluationCriteria.ts), so a sport
// with a different number of rated attributes automatically gets a
// matching hexagon/heptagon/etc. rather than a hardcoded 5-sided shape.
// SIZE is deliberately much bigger than the chart itself (RADIUS) — the
// leftover margin is where axis labels live, and a long label like "Shot
// Variety" needs real room to extend into on the chart's left/right sides
// without clipping against the viewBox edge.
const SIZE = 400
const CENTER = SIZE / 2
const RADIUS = 95
const LABEL_RADIUS = RADIUS + 35
const SCALE_MAX = 10 // attributes are rated 1-10 — see EvaluationForm.tsx's range input
const RING_SCALES = [0.2, 0.4, 0.6, 0.8, 1]

function pointAt(index: number, total: number, scale: number) {
  // -90deg (-Math.PI / 2) starts the first vertex straight up, matching the
  // reference layout instead of starting at 3 o'clock.
  const angle = (index * 2 * Math.PI) / total - Math.PI / 2
  return { x: CENTER + RADIUS * scale * Math.cos(angle), y: CENTER + RADIUS * scale * Math.sin(angle) }
}

function polygonPoints(total: number, scale: number) {
  return Array.from({ length: total }, (_, i) => pointAt(i, total, scale))
    .map((p) => `${p.x},${p.y}`)
    .join(' ')
}

// A label centered on a vertex near the chart's left/right edge clips
// against the viewBox — anchoring it to grow AWAY from center instead (the
// standard radar-chart technique) uses the same margin far more
// effectively. Only a vertex close to dead-center horizontally (near the
// top/bottom of the shape) keeps a centered anchor.
function anchorFor(x: number): 'start' | 'middle' | 'end' {
  const dx = x - CENTER
  if (Math.abs(dx) < 8) return 'middle'
  return dx > 0 ? 'start' : 'end'
}

export function SkillEvaluationChart({
  sportName,
  attributes,
  caption,
}: {
  sportName: string
  attributes: Record<string, number>
  caption?: string
}) {
  const criteria = SPORT_ATTRIBUTE_CRITERIA[sportName]
  // Fewer than 3 points can't read as a real polygon — nothing sensible to
  // draw (not that any sport's criteria list is actually this short today).
  if (!criteria || criteria.length < 3) return null

  const sides = criteria.length
  const dataScales = criteria.map((c) => Math.max(0, Math.min(SCALE_MAX, attributes[c.key] ?? 0)) / SCALE_MAX)

  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-slate-100 p-4">
      <p className="text-sm font-semibold text-slate-800">{sportName} Skill Evaluation</p>
      {caption && <p className="text-xs text-slate-400">{caption}</p>}
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mt-1 w-full max-w-[280px]" role="img" aria-label={`${sportName} skill ratings`}>
        {/* Nested rings, one per fifth of the 1-10 scale — the same "spider
            web" grid the reference image uses, just drawn for however many
            sides this sport's attribute list has instead of a fixed 5. */}
        {RING_SCALES.map((scale) => (
          <polygon key={scale} points={polygonPoints(sides, scale)} className="fill-none stroke-slate-200" strokeWidth={1} />
        ))}
        {/* Spokes from center to each attribute's vertex. */}
        {criteria.map((c, i) => {
          const outer = pointAt(i, sides, 1)
          return <line key={c.key} x1={CENTER} y1={CENTER} x2={outer.x} y2={outer.y} className="stroke-slate-200" strokeWidth={1} />
        })}

        {/* The coach's actual ratings. */}
        <polygon
          points={dataScales.map((scale, i) => { const p = pointAt(i, sides, scale); return `${p.x},${p.y}` }).join(' ')}
          className="fill-teal-500/25 stroke-teal-600"
          strokeWidth={2}
        />

        {/* Each axis's real recorded score above its label — the point is
            to show the actual evaluation detail, not just the shape. */}
        {criteria.map((c, i) => {
          const label = pointAt(i, sides, LABEL_RADIUS / RADIUS)
          const value = attributes[c.key]
          return (
            <text
              key={c.key}
              x={label.x}
              y={label.y}
              textAnchor={anchorFor(label.x)}
              dominantBaseline="middle"
              className="fill-slate-600"
              style={{ fontSize: 11 }}
            >
              <tspan x={label.x} dy="-0.4em" fontWeight={600} className="fill-teal-700">
                {value ?? '—'}
              </tspan>
              <tspan x={label.x} dy="1.1em">
                {c.label}
              </tspan>
            </text>
          )
        })}
      </svg>
    </div>
  )
}
