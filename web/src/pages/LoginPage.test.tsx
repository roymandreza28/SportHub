import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'
import * as AuthContext from '../lib/AuthContext'

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<p>Dashboard page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LoginPage', () => {
  it('submits email/password to login() and navigates to /dashboard on success', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      login,
      register: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    })

    renderLoginPage()

    await userEvent.type(screen.getByPlaceholderText('Email'), 'test@example.com')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(login).toHaveBeenCalledWith('test@example.com', 'password123')
    await waitFor(() => expect(screen.getByText('Dashboard page')).toBeInTheDocument())
  })

  it('shows an error message and stays on the page when login fails', async () => {
    const login = vi.fn().mockRejectedValue(new Error('invalid'))
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      login,
      register: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    })

    renderLoginPage()

    await userEvent.type(screen.getByPlaceholderText('Email'), 'test@example.com')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(screen.getByText('Invalid credentials.')).toBeInTheDocument())
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument()
  })
})
