// Two rings spinning in opposite directions around the app logo — the outer
// ring uses Tailwind's built-in animate-spin, the inner uses the
// animate-spin-reverse keyframe defined in index.css, so they visibly turn
// against each other rather than together.
export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white">
      <div className="relative h-28 w-28">
        <div className="absolute inset-0 rounded-full border-4 border-slate-100 border-t-teal-600 animate-spin" />
        <div className="absolute inset-3 rounded-full border-4 border-slate-100 border-b-teal-300 animate-spin-reverse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <img src="/logo.png" alt="SportHub" className="h-14 w-14 rounded-full object-cover" />
        </div>
      </div>
      <p className="text-sm font-medium text-slate-500">Loading...</p>
    </div>
  )
}
