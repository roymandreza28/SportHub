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
      className={`modal-dialog fixed inset-0 m-auto h-fit max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-none bg-white p-0 shadow-2xl backdrop:bg-slate-950/60 ${
        mode === 'register' ? 'max-w-xl' : 'max-w-sm'
      }`}
    >
      {/* A trophy-ribbon accent rather than a plain top border — the same
          brand gradient (Orange Red -> Gold in Championship Spirit, Gold ->
          Dark Orange under Night Game Lights) that already colors the rest
          of the app, so this modal reads as SportHub even before the logo
          loads. */}
      <div className="h-1.5 w-full bg-gradient-to-r from-teal-600 via-teal-500 to-teal-800" />

      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        &times;
      </button>

      <div className="flex flex-col items-center gap-1.5 px-8 pb-2 pt-8 text-center">
        <img
          src="/logo.png"
          alt="SportHub"
          className="h-16 w-16 rounded-full object-cover shadow-md ring-4 ring-teal-50"
        />
        <h2 className="mt-2 text-xl font-bold text-slate-900">
          {mode === 'login' ? 'Welcome back' : 'Join SportHub'}
        </h2>
        <p className="text-sm text-slate-500">
          {mode === 'login' ? 'Sign in to continue to your dashboard.' : "Binangonan's Municipal Sports Platform"}
        </p>
      </div>

      {/* Keyed by mode so switching login <-> register remounts this wrapper
          and replays auth-content-fade (see index.css) — a quiet confirmation
          the form underneath actually changed. */}
      <div key={mode} className="modal-content-fade flex flex-col gap-4 px-8 pb-8 pt-4">
        {mode === 'login' ? (
          <LoginForm onSuccess={onAuthenticated} onSwitchToRegister={() => setMode('register')} />
        ) : (
          <RegisterForm onSuccess={onAuthenticated} onSwitchToLogin={() => setMode('login')} />
        )}
      </div>
    </dialog>
  )
}
