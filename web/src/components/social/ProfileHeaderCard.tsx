import { useRef, type ReactNode } from 'react'
import { Avatar } from '../layout/Avatar'

export function ProfileHeaderCard({
  name,
  roles,
  friendsCount,
  avatarUrl,
  coverUrl,
  editable,
  onAvatarChange,
  avatarPending,
  onCoverChange,
  coverPending,
  actions,
  error,
}: {
  name: string
  roles: string[]
  friendsCount: number
  avatarUrl: string | null
  coverUrl: string | null
  editable: boolean
  onAvatarChange?: (file: File) => void
  avatarPending?: boolean
  onCoverChange?: (file: File) => void
  coverPending?: boolean
  actions?: ReactNode
  error?: string | null
}) {
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="relative h-40 bg-gradient-to-br from-teal-100 via-teal-50 to-slate-100 sm:h-56">
        {coverUrl && <img src={coverUrl} alt="" className="h-full w-full object-cover" />}

        {editable && (
          <>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onCoverChange?.(file)
              }}
            />
            <button
              onClick={() => coverInputRef.current?.click()}
              disabled={coverPending}
              className="absolute bottom-3 right-3 rounded-lg bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow transition hover:bg-white disabled:opacity-50"
            >
              {coverPending ? 'Uploading...' : coverUrl ? 'Change cover photo' : 'Add cover photo'}
            </button>
          </>
        )}
      </div>

      <div className="px-6 pb-6">
        <div className="relative -mt-12 inline-block sm:-mt-16">
          {editable ? (
            <>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onAvatarChange?.(file)
                }}
              />
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarPending}
                className="group relative block rounded-full"
                aria-label={avatarUrl ? 'Change profile photo' : 'Add profile photo'}
              >
                <Avatar name={name} url={avatarUrl} size="xl" className="border-4 border-white shadow" />
                <span className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/40 text-xs font-semibold text-pure-white group-hover:flex">
                  {avatarPending ? '...' : 'Change'}
                </span>
              </button>
            </>
          ) : (
            <Avatar name={name} url={avatarUrl} size="xl" className="border-4 border-white shadow" />
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{name}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {friendsCount} {friendsCount === 1 ? 'friend' : 'friends'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {roles.map((role) => (
                <span key={role} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">
                  {role.replace('_', ' ')}
                </span>
              ))}
            </div>
          </div>

          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}
