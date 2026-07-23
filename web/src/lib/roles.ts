import type { Role } from './AuthContext'

// Every account has exactly one role, with one deliberate exception: a coach
// account also carries the player role, so a coach can be evaluated/booked
// like any other player. Priority order only matters for that combination —
// admin/organizer/venue_facilitator never co-occur with anything else.
const ROLE_PRIORITY: Role[] = ['admin', 'organizer', 'venue_facilitator', 'coach', 'player']

const ROLE_PATHS: Record<Role, string> = {
  admin: '/admin',
  organizer: '/organizer',
  venue_facilitator: '/facilitator',
  coach: '/coach',
  player: '/player',
}

export function primaryDashboardPath(roles: Role[]): string {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return ROLE_PATHS[role]
  }
  return '/login'
}
