import { Link } from 'react-router'
import { MetricsCards } from '../components/admin/MetricsCards'
import { FacilitatorCreateForm } from '../components/admin/FacilitatorCreateForm'
import { UserManagementTable } from '../components/admin/UserManagementTable'
import { AuditLogTable } from '../components/admin/AuditLogTable'

export function AdminPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <Link to="/dashboard" className="text-sm text-indigo-600">
          Back to dashboard
        </Link>
      </div>

      <MetricsCards />
      <FacilitatorCreateForm />
      <UserManagementTable />
      <AuditLogTable />
    </div>
  )
}
