// Shared visual language for every form/table across the dashboards, so a
// text input or a button looks the same whether it's on the Admin, Player,
// Coach, or Organizer page instead of each component carrying its own
// slightly-different ad hoc styling.

// grad-input (see index.css) swaps the old flat white/bordered well for a
// soft two-stop gradient that shifts position (not color-swaps) once
// focused — a quiet "this field is now active" cue beyond just the ring.
export const input =
  'grad-input w-full rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none'

export const select = input + ' appearance-none bg-no-repeat pr-8'

export const textarea = input + ' resize-y'

export const label = 'text-xs font-semibold uppercase tracking-wide text-slate-500'

export const fieldGroup = 'flex flex-col gap-1.5'

// active:scale-[0.98] dropped from the shared base — .grad-surface/
// .grad-brand (index.css) already choreograph their own press feedback,
// so stacking Tailwind's own active: scale on top would double it up.
// duration-150 -> 200 to give the spring easing curve room to read as a
// spring rather than a snap.
const buttonBase =
  'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ease-[var(--ease-spring)] disabled:cursor-not-allowed disabled:opacity-50'

// text-pure-white (not text-white) on the three solid-fill styles below —
// they always need genuinely white text: teal-600 is Orange Red in light
// mode and Cobalt Blue in dark mode, green-600 stays a bright Pitch Green
// under dark mode (see index.css's [data-theme="dark"] overrides) — every
// one of those needs white text regardless of theme, but plain text-white
// itself flips to a near-black surface color under dark mode (it's also the
// token bg-white panels use), so it can't be used here. Every other button
// style keeps its text color as-is across both themes since its background
// stays a tint, not a solid fill.
export const buttonPrimary = `${buttonBase} grad-brand text-pure-white`
export const buttonSecondary = `${buttonBase} grad-surface text-slate-700`
export const buttonDanger = `${buttonBase} bg-red-50 text-red-700 hover:bg-red-100 active:scale-[0.97]`
export const buttonSuccess = `${buttonBase} bg-green-600 text-white dark:text-[#1a1a1a] shadow-sm shadow-green-600/20 hover:bg-green-700 hover:shadow-md active:scale-[0.97]`
export const buttonLive = `${buttonBase} bg-red-600 text-pure-white shadow-sm shadow-red-600/20 hover:bg-red-700 hover:shadow-md hover:shadow-red-600/25 active:scale-[0.97]`
export const buttonGhost = `inline-flex items-center gap-1 text-sm font-medium text-teal-600 transition-all duration-200 ease-[var(--ease-spring)] hover:text-teal-700 hover:gap-1.5`

// A chip's grad-brand-vs-grad-surface state doubles as its own selected/
// unselected indicator — the flowing brand gradient reads as "on", the
// quiet neutral gradient reads as "off".
export const chip = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ease-[var(--ease-spring)] ${
    active ? 'grad-brand text-pure-white' : 'grad-surface text-slate-600 hover:text-slate-800'
  }`

export const card = 'grad-surface flex flex-col gap-3 rounded-xl p-4'

export const tableWrap = 'overflow-x-auto'
export const table = 'w-full text-left text-sm'
export const tableHeadRow = 'border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500'
export const tableHeadCell = 'py-2.5 pr-4'
export const tableRow = 'border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70'
export const tableCell = 'py-2.5 pr-4 text-slate-700'
