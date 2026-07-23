import { useNavigate, Link } from 'react-router'
import { RegisterForm } from '../components/auth/RegisterForm'

export function RegisterPage() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Register</h1>
      <RegisterForm onSuccess={() => navigate('/dashboard')} />
      <p className="text-sm">
        Already have an account? <Link to="/login" className="text-indigo-600">Log in</Link>
      </p>
    </div>
  )
}
