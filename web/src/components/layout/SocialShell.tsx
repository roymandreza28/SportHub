import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { IconChevronLeft } from './icons'
import { UserMenu } from './UserMenu'

export function SocialShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-8 py-4 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard"
            aria-label="Back to dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <IconChevronLeft className="h-4 w-4" />
          </Link>
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-7 w-7" />
            <span className="text-base font-bold text-slate-900">
              Sport<span className="text-teal-600">Hub</span>
            </span>
          </Link>
        </div>
        <UserMenu />
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 sm:px-8">{children}</main>
    </div>
  )
}
