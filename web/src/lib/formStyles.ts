// Shared visual language for every form/table across the dashboards, so a
// text input or a button looks the same whether it's on the Admin, Player,
// Coach, or Organizer page instead of each component carrying its own
// slightly-different ad hoc styling.

export const input =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100'

export const select = input + ' appearance-none bg-no-repeat pr-8'

export const textarea = input + ' resize-y'

export const label = 'text-xs font-semibold uppercase tracking-wide text-slate-500'

export const fieldGroup = 'flex flex-col gap-1.5'

const buttonBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50'

export const buttonPrimary = `${buttonBase} bg-teal-600 text-white shadow-sm hover:bg-teal-700`
export const buttonSecondary = `${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
export const buttonDanger = `${buttonBase} bg-red-50 text-red-700 hover:bg-red-100`
export const buttonSuccess = `${buttonBase} bg-green-600 text-white shadow-sm hover:bg-green-700`
export const buttonGhost = `inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700`

export const chip = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-medium transition ${
    active ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
  }`

export const card = 'flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-4'

export const tableWrap = 'overflow-x-auto'
export const table = 'w-full text-left text-sm'
export const tableHeadRow = 'border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500'
export const tableHeadCell = 'py-2.5 pr-4'
export const tableRow = 'border-b border-slate-100 last:border-0 hover:bg-slate-50/70'
export const tableCell = 'py-2.5 pr-4 text-slate-700'
