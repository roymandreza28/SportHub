import { useNavigate, Link } from 'react-router'
import { LoginForm } from '../components/auth/LoginForm'

export function LoginPage() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <LoginForm onSuccess={() => navigate('/dashboard')} />
      <p className="text-sm">
        No account? <Link to="/register" className="text-indigo-600">Register</Link>
      </p>
    </div>
  )
}
