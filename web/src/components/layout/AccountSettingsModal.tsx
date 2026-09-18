import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useAuth } from '../../lib/AuthContext'
import { deleteOwnAccount, exportOwnData, updateOwnPassword, updateOwnProfile } from '../../lib/accountApi'
import { buttonDanger, buttonPrimary, buttonSecondary, fieldGroup, input, label } from '../../lib/formStyles'
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushPermissionState,
  hasActivePushSubscription,
  needsHomeScreenInstallOnIOS,
  type PushPermissionState,
} from '../../lib/pushNotifications'

function extractErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined
    const firstFieldError = data?.errors && Object.values(data.errors)[0]?.[0]
    if (firstFieldError) return firstFieldError
    if (data?.message) return data.message
  }
  return 'Something went wrong. Please try again.'
}

export function AccountSettingsModal({ onClose }: { onClose: () => void }) {
  const { user, refreshUser, logout } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [pushState, setPushState] = useState<PushPermissionState>('unsupported')
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')

  // Basic details — everything EXCEPT email/password/role/verification,
  // which either have their own dedicated section below (password) or no
  // self-service edit at all (see AuthController::updateProfile()'s own
  // comment on why those are excluded). Seeded from the current user once,
  // not kept in sync afterward — the modal fully unmounts/remounts each
  // time it's opened (see UserMenu's `{settingsOpen && <AccountSettingsModal
  // .../>}`), so reopening it after a save already reflects the fresh value.
  const [firstName, setFirstName] = useState(user?.first_name ?? '')
  const [middleName, setMiddleName] = useState(user?.middle_name ?? '')
  const [lastName, setLastName] = useState(user?.last_name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [address, setAddress] = useState(user?.address ?? '')

  useEffect(() => {
    setPushState(getPushPermissionState())
    hasActivePushSubscription().then(setPushSubscribed)
  }, [])

  const profileMutation = useMutation({
    mutationFn: () =>
      updateOwnProfile({
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        phone,
        address,
      }),
    onSuccess: () => refreshUser(),
  })

  const mutation = useMutation({
    mutationFn: () => updateOwnPassword(currentPassword, password),
    onSuccess: () => {
      setCurrentPassword('')
      setPassword('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteOwnAccount(deletePassword),
    onSuccess: () => logout(),
  })

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      await exportOwnData()
    } catch (error) {
      setExportError(extractErrorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  async function handleEnablePush() {
    setPushBusy(true)
    try {
      const result = await enablePushNotifications()
      setPushState(result)
      setPushSubscribed(result === 'granted')
    } finally {
      setPushBusy(false)
    }
  }

  async function handleDisablePush() {
    setPushBusy(true)
    try {
      await disablePushNotifications()
      setPushSubscribed(false)
    } finally {
      setPushBusy(false)
    }
  }

  // Portaled to <body> — this modal is opened from UserMenu, which lives
  // inside the header's backdrop-blur bar (DashboardShell/SocialShell), and
  // backdrop-filter establishes a new containing block for fixed-position
  // descendants. Left inline, "fixed inset-0" resolved against the header's
  // own short box instead of the viewport, squeezing the dialog into a
  // strip near the top instead of centering it on the page.
  return createPortal(
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">Account settings</h3>
        <p className="mt-1 text-xs text-slate-500">{user?.name} — {user?.email}</p>

        <div className="mt-4 flex flex-col gap-3 border-b border-slate-100 pb-4">
          <p className={label}>Basic details</p>
          <div className="grid grid-cols-2 gap-3">
            <div className={fieldGroup}>
              <label className={label}>First name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={input}
              />
            </div>
            <div className={fieldGroup}>
              <label className={label}>Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={input}
              />
            </div>
          </div>
          <div className={fieldGroup}>
            <label className={label}>Middle name</label>
            <input
              type="text"
              placeholder="Optional"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              className={input}
            />
          </div>
          <div className={fieldGroup}>
            <label className={label}>Mobile number</label>
            <input
              type="tel"
              placeholder="09XX XXX XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={input}
            />
          </div>
          <div className={fieldGroup}>
            <label className={label}>Address</label>
            <input
              type="text"
              placeholder="House/street, barangay, city"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={input}
            />
          </div>

          {profileMutation.isError && (
            <p className="text-xs text-red-600">{extractErrorMessage(profileMutation.error)}</p>
          )}
          {profileMutation.isSuccess && <p className="text-xs text-green-700">Details updated.</p>}

          <button
            onClick={() => profileMutation.mutate()}
            disabled={!firstName || !lastName || profileMutation.isPending}
            className={`${buttonPrimary} self-start`}
          >
            {profileMutation.isPending ? 'Saving...' : 'Save details'}
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className={fieldGroup}>
            <label className={label}>Device notifications</label>
            {pushState === 'unsupported' && (
              <p className="text-xs text-slate-400">Not supported in this browser.</p>
            )}
            {pushState === 'denied' && (
              <p className="text-xs text-slate-400">
                Blocked — enable notifications for SportsHub in your browser's site settings to turn this on.
              </p>
            )}
            {pushState !== 'unsupported' && pushState !== 'denied' && pushSubscribed && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-teal-600">Enabled on this device.</p>
                <button onClick={handleDisablePush} disabled={pushBusy} className={buttonSecondary}>
                  {pushBusy ? 'Working...' : 'Disable'}
                </button>
              </div>
            )}
            {pushState !== 'unsupported' && pushState !== 'denied' && !pushSubscribed && (
              <div className="flex flex-col gap-1.5">
                <button onClick={handleEnablePush} disabled={pushBusy} className={buttonSecondary}>
                  {pushBusy ? 'Working...' : 'Enable device notifications'}
                </button>
                {needsHomeScreenInstallOnIOS() && (
                  <p className="text-xs text-slate-400">
                    On iPhone, first add SportsHub to your Home Screen (Share → Add to Home Screen), then open it
                    from there and enable this.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className={fieldGroup}>
            <label className={label}>Current password</label>
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={input}
            />
          </div>
          <div className={fieldGroup}>
            <label className={label}>New password</label>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </div>

          {mutation.isError && <p className="text-xs text-red-600">{extractErrorMessage(mutation.error)}</p>}
          {mutation.isSuccess && <p className="text-xs text-green-700">Password updated.</p>}
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
          <div className={fieldGroup}>
            <label className={label}>Your data</label>
            <p className="text-xs text-slate-500">
              Download a copy of everything SportsHub has on record for your account — profile, registrations,
              bookings, skill history, and anything you've posted.
            </p>
            <button onClick={handleExport} disabled={exporting} className={`${buttonSecondary} self-start`}>
              {exporting ? 'Preparing download...' : 'Download my data'}
            </button>
            {exportError && <p className="text-xs text-red-600">{exportError}</p>}
          </div>

          <div className={`${fieldGroup} rounded-lg border border-red-100 bg-red-50/50 p-3`}>
            <label className={label}>Delete account</label>
            <p className="text-xs text-slate-500">
              Permanently deactivates your account and signs you out everywhere. This can't be undone from the app —
              contact an administrator if you change your mind.
            </p>

            {!showDeleteConfirm ? (
              <button onClick={() => setShowDeleteConfirm(true)} className={`${buttonDanger} self-start`}>
                Delete my account
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="password"
                  placeholder="Confirm your password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className={input}
                />
                {deleteMutation.isError && (
                  <p className="text-xs text-red-600">{extractErrorMessage(deleteMutation.error)}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      setDeletePassword('')
                    }}
                    className={buttonSecondary}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate()}
                    disabled={!deletePassword || deleteMutation.isPending}
                    className={buttonDanger}
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Permanently delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={buttonSecondary}>
            Close
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!currentPassword || password.length < 8 || mutation.isPending}
            className={buttonPrimary}
          >
            {mutation.isPending ? 'Saving...' : 'Update password'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
