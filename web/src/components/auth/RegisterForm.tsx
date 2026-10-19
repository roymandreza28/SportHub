import { useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { extractErrorMessage, extractFieldErrors } from '../../lib/errors'
import { buttonPrimary, fieldGroup, input, label, textarea } from '../../lib/formStyles'

type Role = 'player' | 'coach'
type Gender = 'male' | 'female'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-red-600">{message}</p>
}

function FileUploadField({
  id,
  file,
  onChange,
  helperText,
}: {
  id: string
  file: File | null
  onChange: (file: File | null) => void
  helperText: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/jpg,application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Choose file
        </button>
        {file ? (
          <span className="flex items-center gap-2 truncate text-sm text-slate-600">
            <span className="truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => {
                onChange(null)
                if (inputRef.current) inputRef.current.value = ''
              }}
              className="shrink-0 text-xs font-medium text-red-600 hover:text-red-700"
            >
              Remove
            </button>
          </span>
        ) : (
          <span className="text-sm text-slate-400">No file selected</span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">{helperText}</p>
    </div>
  )
}

function PasswordChecklistItem({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 ${met ? 'text-green-600' : 'text-slate-400'}`}>
      <span aria-hidden="true">{met ? '✓' : '○'}</span>
      {children}
    </li>
  )
}

// Mirrors AuthController::matchesBirthday() on the backend closely enough to
// give the user a live heads-up before they submit — the server rule is
// still the one that's actually enforced.
function looksLikeBirthday(password: string, birthday: string): boolean {
  if (!password || !birthday) return false
  const [y, m, d] = birthday.split('-')
  if (!y || !m || !d) return false
  const variants = [`${y}-${m}-${d}`, `${y}${m}${d}`, `${m}/${d}/${y}`, `${d}/${m}/${y}`, `${m}${d}${y}`, `${d}${m}${y}`]
  return variants.includes(password)
}

export function RegisterForm({
  onSuccess,
  onSwitchToLogin,
}: {
  onSuccess: () => void
  onSwitchToLogin?: () => void
}) {
  const { register } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [proofOfAddress, setProofOfAddress] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [role, setRole] = useState<Role>('player')
  const [coachProof, setCoachProof] = useState<File | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)

  const hasMinLength = password.length >= 8
  const hasUppercase = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const notBirthday = !looksLikeBirthday(password, birthday)
  const passwordValid = hasMinLength && hasUppercase && hasNumber && notBirthday
  const passwordsMatch = password.length > 0 && password === passwordConfirmation

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setGeneralError(null)
    setFieldErrors({})

    if (!passwordValid || !passwordsMatch) {
      setGeneralError('Please satisfy every password requirement before continuing.')
      return
    }

    if (!acceptedTerms) {
      setGeneralError('Please accept the Terms & Conditions before creating your account.')
      return
    }

    setIsSubmitting(true)
    try {
      const form = new FormData()
      form.append('first_name', firstName)
      form.append('middle_name', middleName)
      form.append('last_name', lastName)
      form.append('email', email)
      form.append('birthday', birthday)
      form.append('gender', gender)
      form.append('address', address)
      form.append('phone', phone)
      if (proofOfAddress) form.append('proof_of_address', proofOfAddress)
      form.append('role', role)
      if (role === 'coach' && coachProof) form.append('coach_eligibility_proof', coachProof)
      form.append('password', password)
      form.append('password_confirmation', passwordConfirmation)

      await register(form)
      onSuccess()
    } catch (err) {
      const fields = extractFieldErrors(err)
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields)
        setGeneralError('Please fix the highlighted fields.')
      } else {
        setGeneralError(extractErrorMessage(err))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Personal information</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={fieldGroup}>
            <label className={label} htmlFor="first-name">First name</label>
            <input id="first-name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={input} required />
            <FieldError message={fieldErrors.first_name} />
          </div>
          <div className={fieldGroup}>
            <label className={label} htmlFor="last-name">Last name (surname)</label>
            <input id="last-name" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={input} required />
            <FieldError message={fieldErrors.last_name} />
          </div>
        </div>
        <div className={fieldGroup}>
          <label className={label} htmlFor="middle-name">Middle name (optional)</label>
          <input id="middle-name" type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)} className={input} />
          <FieldError message={fieldErrors.middle_name} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={fieldGroup}>
            <label className={label} htmlFor="birthday">Birthday</label>
            <input
              id="birthday"
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className={input}
              required
            />
            <FieldError message={fieldErrors.birthday} />
          </div>
          <div className={fieldGroup}>
            <label className={label} htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} required />
            <p className="mt-1 text-xs text-slate-400">This is also your username for signing in.</p>
            <FieldError message={fieldErrors.email} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={fieldGroup}>
            <label className={label} htmlFor="gender">Gender</label>
            <select
              id="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender)}
              className={input}
              required
            >
              <option value="" disabled>Select...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <p className="mt-1 text-xs text-slate-400">Used to determine eligibility for gender-restricted tournaments.</p>
            <FieldError message={fieldErrors.gender} />
          </div>
          <div className={fieldGroup}>
            <label className={label} htmlFor="phone">Mobile number</label>
            <input
              id="phone"
              type="tel"
              placeholder="09XX XXX XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={input}
              required
            />
            <FieldError message={fieldErrors.phone} />
          </div>
        </div>
        <div className={fieldGroup}>
          <label className={label} htmlFor="address">Address</label>
          <textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} className={textarea} rows={2} required />
          <FieldError message={fieldErrors.address} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Identity verification</h3>
        <div className={fieldGroup}>
          <label className={label} htmlFor="proof-of-address">
            Proof of address
          </label>
          <FileUploadField
            id="proof-of-address"
            file={proofOfAddress}
            onChange={setProofOfAddress}
            helperText="Upload a valid ID or a recent billing statement showing your address (JPG, PNG, or PDF, up to 5MB)."
          />
          <FieldError message={fieldErrors.proof_of_address} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Account security</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={fieldGroup}>
            <label className={label} htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} required />
            <FieldError message={fieldErrors.password} />
          </div>
          <div className={fieldGroup}>
            <label className={label} htmlFor="password-confirmation">Confirm password</label>
            <input
              id="password-confirmation"
              type="password"
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              className={input}
              required
            />
            {passwordConfirmation.length > 0 && !passwordsMatch && (
              <p className="mt-1 text-xs text-red-600">Passwords don&apos;t match.</p>
            )}
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs">
          <PasswordChecklistItem met={hasMinLength}>At least 8 characters</PasswordChecklistItem>
          <PasswordChecklistItem met={hasUppercase}>An uppercase letter</PasswordChecklistItem>
          <PasswordChecklistItem met={hasNumber}>A number</PasswordChecklistItem>
          <PasswordChecklistItem met={notBirthday}>Not your birthday</PasswordChecklistItem>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">I&apos;m joining as a...</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setRole('player')}
            className={`rounded-lg border p-3 text-left transition ${
              role === 'player' ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">Player</p>
            <p className="mt-0.5 text-xs text-slate-500">Book venues, join matchmaking, and join tournaments.</p>
          </button>
          <button
            type="button"
            onClick={() => setRole('coach')}
            className={`rounded-lg border p-3 text-left transition ${
              role === 'coach' ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">Coach</p>
            <p className="mt-0.5 text-xs text-slate-500">Register players for tournaments and evaluate their skill.</p>
          </button>
        </div>

        {role === 'coach' && (
          <div className={fieldGroup}>
            <label className={label} htmlFor="coach-proof">
              Proof of coaching eligibility
            </label>
            <FileUploadField
              id="coach-proof"
              file={coachProof}
              onChange={setCoachProof}
              helperText="Upload a coaching license, certification, or similar credential showing you're qualified to coach players (JPG, PNG, or PDF, up to 5MB)."
            />
            <FieldError message={fieldErrors.coach_eligibility_proof} />
          </div>
        )}
      </section>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-start gap-3 text-sm text-slate-700">
          <input
            id="accept-terms"
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            required
          />
          <div className="flex flex-wrap items-center gap-1">
            <span>I agree to the</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowTermsModal(true)
              }}
              className="font-medium text-teal-600 underline-offset-2 hover:underline"
            >
              Terms & Conditions
            </button>
          </div>
        </div>
      </div>

      {generalError && <p className="text-sm text-red-600">{generalError}</p>}

      <button type="submit" disabled={isSubmitting || !acceptedTerms} className={`${buttonPrimary} justify-center py-2.5`}>
        {isSubmitting ? 'Creating account...' : 'Create account'}
      </button>

      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Terms & Conditions</h3>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4 text-sm text-slate-700">
              <p>
                Welcome to SportsHub, a platform for finding, booking, and organizing sports venues, tournaments,
                coaching services, and livestream activity.
              </p>
              <p>
                By creating an account, you agree to use SportsHub responsibly, provide accurate personal information,
                and follow all rules set by the platform, individual venue operators, organizers, coaches, and event
                administrators.
              </p>

              <ol className="list-decimal space-y-3 pl-5">
                <li>
                  <p className="font-semibold text-slate-900">Account and verification</p>
                  <p>
                    You must provide truthful personal details, a valid email address, and any required proof of identity,
                    address, or coaching eligibility when requested. SportsHub may verify accounts before allowing full
                    access to bookings, tournaments, or coaching features.
                  </p>
                </li>
                <li>
                  <p className="font-semibold text-slate-900">Venue bookings and payments</p>
                  <p>
                    Venue reservations, booking approvals, and any associated fees are managed through SportsHub but are
                    subject to the venue&apos;s own policies, schedule, cancellation rules, and local laws. You are responsible
                    for confirming the time, date, and terms before booking or attending a session.
                  </p>
                </li>
                <li>
                  <p className="font-semibold text-slate-900">Tournament and coaching conduct</p>
                  <p>
                    Players, coaches, organizers, and facilitators must behave respectfully and follow each tournament&apos;s
                    rules, competition format, fair-play standards, and safety requirements. SportsHub may restrict,
                    suspend, or remove access to accounts that misuse the platform, engage in abusive conduct, or violate
                    tournament rules.
                  </p>
                </li>
                <li>
                  <p className="font-semibold text-slate-900">Content and platform use</p>
                  <p>
                    You may not upload unlawful, offensive, misleading, or harmful content. You are responsible for all
                    information you post, including profile details, tournament entries, livestream communication, venue
                    reviews, and messages sent through the platform.
                  </p>
                </li>
                <li>
                  <p className="font-semibold text-slate-900">Privacy and data</p>
                  <p>
                    SportsHub may collect and process personal information to provide account access, verification,
                    bookings, tournament administration, and platform safety features. Information may be shared with
                    relevant venue operators, organizers, and authorized staff only as needed to deliver the service.
                  </p>
                </li>
                <li>
                  <p className="font-semibold text-slate-900">Platform availability and liability</p>
                  <p>
                    SportsHub provides the service on an &ldquo;as is&rdquo; basis and does not guarantee uninterrupted access,
                    flawless operation, or the outcome of any booking, event, or match. We do not guarantee venue
                    availability or tournament outcomes beyond the rules and controls enabled by the platform.
                  </p>
                </li>
                <li>
                  <p className="font-semibold text-slate-900">Termination and compliance</p>
                  <p>
                    SportsHub may suspend or terminate accounts that violate platform rules, participate in fraud,
                    disrupt events, or misuse user data. Continued use of SportsHub after account suspension is not
                    permitted.
                  </p>
                </li>
              </ol>

              <p>
                By accepting these terms, you confirm that you understand the responsibilities of using SportsHub and that
                you agree to comply with the applicable rules for venue booking, tournament participation, coaching,
                livestreaming, and account verification.
              </p>
            </div>
          </div>
        </div>
      )}

      {onSwitchToLogin && (
        <p className="text-center text-sm text-slate-600">
          Already have an account?{' '}
          <button type="button" onClick={onSwitchToLogin} className="font-medium text-teal-600 hover:underline">
            Log in
          </button>
        </p>
      )}
    </form>
  )
}
