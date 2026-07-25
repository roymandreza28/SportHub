const SIZE_CLASSES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-28 w-28 text-3xl',
} as const

export function Avatar({
  name,
  url,
  size = 'md',
  className = '',
}: {
  name: string
  url?: string | null
  size?: keyof typeof SIZE_CLASSES
  className?: string
}) {
  const sizeClasses = SIZE_CLASSES[size]

  if (url) {
    return <img src={url} alt="" className={`${sizeClasses} shrink-0 rounded-full object-cover ${className}`} />
  }

  return (
    <span
      className={`flex ${sizeClasses} shrink-0 items-center justify-center rounded-full bg-teal-100 font-semibold text-teal-700 ${className}`}
    >
      {name[0]?.toUpperCase() ?? '?'}
    </span>
  )
}
