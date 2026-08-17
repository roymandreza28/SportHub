import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { api, clearStoredToken, getStoredToken, setStoredToken } from './api'

vi.mock('./api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getStoredToken: vi.fn(),
  setStoredToken: vi.fn(),
  clearStoredToken: vi.fn(),
}))

function Probe() {
  const { user, isLoading, login, logout, hasRole } = useAuth()

  if (isLoading) return <p>Loading...</p>

  return (
    <div>
      <p>{user ? `Logged in as ${user.name}` : 'Not logged in'}</p>
      <p>Has admin role: {hasRole('admin') ? 'yes' : 'no'}</p>
      <button onClick={() => login('a@test.com', 'password')}>Log in</button>
      <button onClick={() => logout()}>Log out</button>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(getStoredToken).mockReset()
    vi.mocked(setStoredToken).mockReset()
    vi.mocked(clearStoredToken).mockReset()
  })

  it('fetches the current user on mount when a token is already stored', async () => {
    vi.mocked(getStoredToken).mockReturnValue('existing-token')
    vi.mocked(api.get).mockResolvedValue({
      data: { id: 1, name: 'Ada Admin', email: 'a@test.com', roles: ['admin'] },
    })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('Logged in as Ada Admin')).toBeInTheDocument())
    expect(screen.getByText('Has admin role: yes')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/user')
  })

  it('skips the /api/user check entirely when no token is stored', async () => {
    vi.mocked(getStoredToken).mockReturnValue(null)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByText('Not logged in')).toBeInTheDocument())
    expect(api.get).not.toHaveBeenCalled()
  })

  it('shows not-logged-in and clears the token when the stored token is rejected (401)', async () => {
    vi.mocked(getStoredToken).mockReturnValue('stale-token')
    vi.mocked(api.get).mockRejectedValue(new Error('401'))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByText('Not logged in')).toBeInTheDocument())
    expect(clearStoredToken).toHaveBeenCalled()
  })

  it('logs in via POST /api/login, stores the returned token, and updates user state', async () => {
    vi.mocked(getStoredToken).mockReturnValue(null)
    vi.mocked(api.post).mockResolvedValue({
      data: { id: 2, name: 'Pat Player', email: 'p@test.com', roles: ['player'], token: 'new-token' },
    })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByText('Not logged in')).toBeInTheDocument())

    await userEvent.click(screen.getByText('Log in'))

    await waitFor(() => expect(screen.getByText('Logged in as Pat Player')).toBeInTheDocument())
    expect(api.post).toHaveBeenCalledWith('/api/login', { email: 'a@test.com', password: 'password' })
    expect(setStoredToken).toHaveBeenCalledWith('new-token')
  })

  it('logs out, clears the stored token, and clears user state', async () => {
    vi.mocked(getStoredToken).mockReturnValue('existing-token')
    vi.mocked(api.get).mockResolvedValue({
      data: { id: 1, name: 'Ada Admin', email: 'a@test.com', roles: ['admin'] },
    })
    vi.mocked(api.post).mockResolvedValue({ data: null })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByText('Logged in as Ada Admin')).toBeInTheDocument())

    await userEvent.click(screen.getByText('Log out'))

    await waitFor(() => expect(screen.getByText('Not logged in')).toBeInTheDocument())
    expect(api.post).toHaveBeenCalledWith('/api/logout')
    expect(clearStoredToken).toHaveBeenCalled()
  })
})
