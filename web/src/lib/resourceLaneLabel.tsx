import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ResourceLabelContentArg, ResourceLaneContentArg } from '@fullcalendar/resource'

// BRCC's bowling lanes are seeded as "Duckpin Lane 1".."Duckpin Lane 12" and
// "Ten-Pin Lane 1".."Ten-Pin Lane 8" (one court row per physically
// independent lane — see VenueSeeder, and the separate "...Bowling Center"
// venue it now lives under). The full name is too wide to read as a flat
// column header once there are 20 of them, so the column itself just shows
// the lane number — LaneGroupBanner (below) renders the "Duckpin lane" /
// "Ten-Pin lane" group title as one merged bar above the numbers.
const LANE_PATTERN = /^(Duckpin|Ten-Pin) Lane (\d+)$/

export function renderResourceLaneLabel(arg: ResourceLabelContentArg) {
  const match = arg.resource.title.match(LANE_PATTERN)
  if (!match) return arg.resource.title
  return <span className="font-semibold">{match[2]}</span>
}

// A lane only needs room for a 1-2 digit number, so give it noticeably less
// column width than the other courts (whose full names need the space) —
// see the .fc-lane-col rule in index.css.
export function laneColumnClassNames(arg: ResourceLabelContentArg | ResourceLaneContentArg) {
  return LANE_PATTERN.test(arg.resource.title) ? ['fc-lane-col'] : []
}

type LaneGroupSegment = { group: string; left: number; width: number }

// FullCalendar's resource-timegrid has no concept of a header cell spanning
// multiple resource columns (that's a resourceTimeline-only feature) — its
// header is always exactly one <th> per resource. To get a real merged
// "Duckpin lane" / "Ten-Pin lane" title bar spanning the matching columns,
// this measures the actual rendered position/width of each lane's header
// cell (after FullCalendar lays them out) and draws the merged bar as an
// absolutely-positioned overlay on top, rather than guessing column widths
// ahead of time — the columns aren't a fixed pixel size (see .fc-lane-col:
// FullCalendar stretches them to fill whatever room the venue's other
// columns don't use), so anything short of measuring the real DOM would
// drift out of alignment.
export function LaneGroupBanner({
  resources,
  children,
}: {
  resources: { id: string; title: string }[]
  children: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [segments, setSegments] = useState<LaneGroupSegment[]>([])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    function measure() {
      const headerCells = Array.from(
        container!.querySelectorAll<HTMLElement>('.fc-col-header-cell.fc-resource'),
      )
      const containerLeft = container!.getBoundingClientRect().left
      const next: LaneGroupSegment[] = []

      headerCells.forEach((cell, i) => {
        const match = resources[i]?.title.match(LANE_PATTERN)
        if (!match) return
        const group = match[1] === 'Duckpin' ? 'Duckpin lane' : 'Ten-Pin lane'
        const rect = cell.getBoundingClientRect()
        const left = rect.left - containerLeft
        const last = next[next.length - 1]
        if (last && last.group === group) {
          last.width = left + rect.width - last.left
        } else {
          next.push({ group, left, width: rect.width })
        }
      })

      setSegments((prev) =>
        prev.length === next.length && prev.every((p, i) => p.group === next[i].group && Math.abs(p.left - next[i].left) < 0.5 && Math.abs(p.width - next[i].width) < 0.5)
          ? prev
          : next,
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [resources])

  return (
    <div ref={containerRef} className="relative">
      {segments.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6">
          {segments.map((segment) => (
            <div
              key={segment.group + segment.left}
              style={{ left: segment.left, width: segment.width }}
              className="absolute top-0 flex h-6 items-center justify-center overflow-hidden border-x border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {segment.group}
            </div>
          ))}
        </div>
      )}
      <div style={{ paddingTop: segments.length > 0 ? 24 : 0 }}>{children}</div>
    </div>
  )
}
