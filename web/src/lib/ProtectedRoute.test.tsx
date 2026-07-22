import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'
import * as AuthContext from './AuthContext'

function mockAuth(overrides: Partial<ReturnType<typeof AuthContext.useAuth>>) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user: null,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    hasRole: () => false,
    ...overrides,
  })
}

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/dashboard" element={<p>Dashboard page</p>} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['admin']}>
              <p>Admin content</p>
            </ProtectedRoute>
          }
        />
        <Route
          path="/anywhere"
          element={
            <ProtectedRoute>
              <p>Protected content</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  it('renders nothing while auth is still loading', () => {
    mockAuth({ isLoading: true })
    const { container } = renderAt('/anywhere')
    expect(container).toBeEmptyDOMElement()
  })

  it('redirects to /login when there is no authenticated user', () => {
    mockAuth({ user: null })
    renderAt('/anywhere')
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('renders the protected content when authenticated with no role restriction', () => {
    mockAuth({ user: { id: 1, name: 'Test', email: 't@test.com', roles: [] } })
    renderAt('/anywhere')
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('redirects to /dashboard when authenticated but missing the required role', () => {
    mockAuth({
      user: { id: 1, name: 'Test', email: 't@test.com', roles: ['player'] },
      hasRole: () => false,
    })
    renderAt('/admin')
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })

  it('renders the protected content when the user has the required role', () => {
    mockAuth({
      user: { id: 1, name: 'Test', email: 't@test.com', roles: ['admin'] },
      hasRole: (...roles) => roles.includes('admin'),
    })
    renderAt('/admin')
    expect(screen.getByText('Admin content')).toBeInTheDocument()
  })
})
