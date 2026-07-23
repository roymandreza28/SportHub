import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function base(children: React.ReactNode, props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}

export function IconHome(props: IconProps) {
  return base(
    <>
      <path d="m3.5 10 8.5-7 8.5 7" />
      <path d="M5.5 9v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9" />
    </>,
    props
  )
}

export function IconUsers(props: IconProps) {
  return base(
    <>
      <circle cx="8.5" cy="8" r="3" />
      <path d="M2.5 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="8.5" r="2.5" />
      <path d="M14.5 20a5 5 0 0 1 7-4.6" />
    </>,
    props
  )
}

export function IconUserCog(props: IconProps) {
  return base(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="18" cy="15.5" r="2.3" />
      <path d="M18 12v1M18 18v1M15.2 13.8l.9.5M19.9 16.7l.9.5M15.2 17.2l.9-.5M19.9 14.3l.9-.5" />
    </>,
    props
  )
}

export function IconFileText(props: IconProps) {
  return base(
    <>
      <path d="M6 2.5h8l4 4V21a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" />
      <path d="M14 2.5V7h4M8.5 12h7M8.5 15.5h7M8.5 8.5h3" />
    </>,
    props
  )
}

export function IconCalendar(props: IconProps) {
  return base(
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v3M16 3v3" />
    </>,
    props
  )
}

export function IconMapPin(props: IconProps) {
  return base(
    <>
      <path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </>,
    props
  )
}

export function IconTrophy(props: IconProps) {
  return base(
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5" />
      <path d="M12 14v3M9 20h6M9.5 20c0-1.8.7-2.6 2.5-3 1.8.4 2.5 1.2 2.5 3" />
    </>,
    props
  )
}

export function IconClipboard(props: IconProps) {
  return base(
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="1.5" />
      <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
      <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" />
    </>,
    props
  )
}

export function IconRadio(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7.5 8.5a6.5 6.5 0 0 0 0 7M16.5 8.5a6.5 6.5 0 0 1 0 7M4.5 5.5a11 11 0 0 0 0 13M19.5 5.5a11 11 0 0 1 0 13" />
    </>,
    props
  )
}

export function IconTarget(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </>,
    props
  )
}

export function IconLogOut(props: IconProps) {
  return base(
    <>
      <path d="M9 4H5.5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1H9" />
      <path d="M14.5 16.5 19 12l-4.5-4.5M19 12H9" />
    </>,
    props
  )
}

export function IconChevronLeft(props: IconProps) {
  return base(<path d="m14.5 5-7 7 7 7" />, props)
}
