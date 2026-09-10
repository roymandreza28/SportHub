import type { ResourceLabelContentArg, ResourceLaneContentArg } from '@fullcalendar/resource'

// BRCC's bowling lanes are seeded as "Duckpin Lane 1".."Duckpin Lane 12" and
// "Ten-Pin Lane 1".."Ten-Pin Lane 8" (one court row per physically
// independent lane — see VenueSeeder). The full name is too wide to read as
// a flat column header once there are 20 of them, so show just the lane
// number, with the lane type as a small label above lane 1 of each group to
// keep the two groups visually distinguishable without repeating it on
// every column.
const LANE_PATTERN = /^(Duckpin|Ten-Pin) Lane (\d+)$/

export function renderResourceLaneLabel(arg: ResourceLabelContentArg) {
  const match = arg.resource.title.match(LANE_PATTERN)
  if (!match) return arg.resource.title

  const [, group, number] = match
  return (
    <div className="flex flex-col items-center leading-tight">
      {number === '1' && <span className="text-[10px] font-medium text-slate-400">{group}</span>}
      <span className="font-semibold">{number}</span>
    </div>
  )
}

// A lane only needs room for a 1-2 digit number, so give it noticeably less
// column width than the other courts (whose full names need the space) —
// see the .fc-lane-col rule in index.css.
export function laneColumnClassNames(arg: ResourceLabelContentArg | ResourceLaneContentArg) {
  return LANE_PATTERN.test(arg.resource.title) ? ['fc-lane-col'] : []
}
