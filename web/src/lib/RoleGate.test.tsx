import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoleGate } from './RoleGate'
import * as AuthContext from './AuthContext'

function mockAuth(roles: string[]) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user: { id: 1, name: 'Test', email: 't@test.com', roles: roles as never },
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    hasRole: (...check: string[]) => check.some((r) => roles.includes(r)),
  })
}

describe('RoleGate', () => {
  it('renders children when the user has one of the required roles', () => {
    mockAuth(['admin'])

    render(
      <RoleGate roles={['admin']}>
        <p>Admin content</p>
      </RoleGate>
    )

    expect(screen.getByText('Admin content')).toBeInTheDocument()
  })

  it('renders nothing when the user lacks the required role', () => {
    mockAuth(['player'])

    render(
      <RoleGate roles={['admin']}>
        <p>Admin content</p>
      </RoleGate>
    )

    expect(screen.queryByText('Admin content')).not.toBeInTheDocument()
  })

  it('renders children when the user has any one of multiple allowed roles', () => {
    mockAuth(['venue_facilitator'])

    render(
      <RoleGate roles={['venue_facilitator', 'admin']}>
        <p>Facilitator or admin content</p>
      </RoleGate>
    )

    expect(screen.getByText('Facilitator or admin content')).toBeInTheDocument()
  })
})
