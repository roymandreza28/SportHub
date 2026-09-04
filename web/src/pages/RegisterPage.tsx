import { useNavigate, Link } from 'react-router'
import { RegisterForm } from '../components/auth/RegisterForm'

export function RegisterPage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <Link to="/" className="mb-4 inline-flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-8 w-8" />
            <span className="text-lg font-bold text-slate-900">
              Sport<span className="text-teal-600">Hub</span>
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">Join Sporthub as a player or a coach.</p>
        </div>
        <RegisterForm onSuccess={() => navigate('/dashboard', { replace: true })} />
        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-teal-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
