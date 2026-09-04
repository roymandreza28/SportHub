import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { GuestRoute } from './GuestRoute'
import * as AuthContext from './AuthContext'

function mockAuth(overrides: Partial<ReturnType<typeof AuthContext.useAuth>>) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user: null,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    hasRole: () => false,
    refreshUser: vi.fn(),
    ...overrides,
  })
}

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/dashboard" element={<p>Dashboard page</p>} />
        <Route
          path="/login"
          element={
            <GuestRoute>
              <p>Login form</p>
            </GuestRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('GuestRoute', () => {
  it('shows the loading screen while auth is still loading', () => {
    mockAuth({ isLoading: true })
    renderAt('/login')
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Login form')).not.toBeInTheDocument()
  })

  it('renders the guest content when there is no authenticated user', () => {
    mockAuth({ user: null })
    renderAt('/login')
    expect(screen.getByText('Login form')).toBeInTheDocument()
  })

  // The scenario this guards against: a user logs in, then clicks the
  // browser Back button — the token and user state are untouched by that
  // navigation, so without this redirect they'd land back on a bare login
  // form and look logged out even though their session is still valid.
  it('redirects to /dashboard when the user is already authenticated', () => {
    mockAuth({
      user: { id: 1, name: 'Test', email: 't@test.com', roles: ['player'], avatar_url: null, verification_status: 'verified' as const },
    })
    renderAt('/login')
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
    expect(screen.queryByText('Login form')).not.toBeInTheDocument()
  })
})
