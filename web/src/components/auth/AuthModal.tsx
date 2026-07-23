import { useEffect, useRef, useState } from 'react'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'

export type AuthMode = 'login' | 'register'

export function AuthModal({
  open,
  initialMode,
  onClose,
  onAuthenticated,
}: {
  open: boolean
  initialMode: AuthMode
  onClose: () => void
  onAuthenticated: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<AuthMode>(initialMode)

  useEffect(() => {
    if (open) setMode(initialMode)
  }, [open, initialMode])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // Native <dialog> backdrop clicks land on the dialog element itself
        // (not a child) — this is the standard way to detect a click-outside
        // without a separate overlay element.
        if (e.target === dialogRef.current) onClose()
      }}
      className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-sm rounded-xl border-none bg-white p-0 shadow-2xl backdrop:bg-slate-900/60"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {mode === 'login' ? 'Sign in to Sporthub' : 'Create your Sporthub account'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            &times;
          </button>
        </div>

        {mode === 'login' ? (
          <LoginForm onSuccess={onAuthenticated} onSwitchToRegister={() => setMode('register')} />
        ) : (
          <RegisterForm onSuccess={onAuthenticated} onSwitchToLogin={() => setMode('login')} />
        )}
      </div>
    </dialog>
  )
}
