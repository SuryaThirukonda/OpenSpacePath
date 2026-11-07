/** Small stroke icons, drawn inline so they take the text colour and need no downloads. */
import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

function Icon({ children, size = 15, ...rest }: P & { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}
    >
      {children}
    </svg>
  )
}

export const IconLogo = (p: P) => (
  <Icon size={18} {...p}>
    <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
    <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-28 12 12)" />
    <circle cx="19.6" cy="6.6" r="1.4" fill="currentColor" stroke="none" />
  </Icon>
)
export const IconPlay = (p: P) => <Icon {...p}><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></Icon>
export const IconPause = (p: P) => <Icon {...p}><path d="M8 5v14M16 5v14" strokeWidth={3} /></Icon>
export const IconGlobe = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" /></Icon>
export const IconOrbit = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="2.4" /><ellipse cx="12" cy="12" rx="10" ry="4.6" transform="rotate(-30 12 12)" /></Icon>
export const IconReset = (p: P) => <Icon {...p}><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 4v4.5h4.5" /></Icon>
export const IconLink = (p: P) => <Icon {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Icon>
export const IconChase = (p: P) => <Icon {...p}><path d="M12 3l7 17-7-4-7 4z" /></Icon>
export const IconBird = (p: P) => <Icon {...p}><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /></Icon>
export const IconChevron = (p: P) => <Icon size={12} {...p}><path d="M8 5l8 7-8 7" /></Icon>
export const IconPlus = (p: P) => <Icon size={13} {...p}><path d="M12 5v14M5 12h14" /></Icon>
export const IconMinus = (p: P) => <Icon size={13} {...p}><path d="M5 12h14" /></Icon>
export const IconX = (p: P) => <Icon size={12} {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>
export const IconUp = (p: P) => <Icon size={12} {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Icon>
export const IconDown = (p: P) => <Icon size={12} {...p}><path d="M12 5v14M6 13l6 6 6-6" /></Icon>
export const IconSatellite = (p: P) => <Icon {...p}><rect x="9" y="9" width="6" height="6" rx="1" transform="rotate(45 12 12)" /><path d="M5.5 5.5l3 3M15.5 15.5l3 3M4 9l5-5M15 20l5-5" /></Icon>
export const IconAsteroid = (p: P) => <Icon {...p}><path d="M9 3l6 1 5 5-1 7-6 5-7-2-3-6 2-6z" /><path d="M9 9h.01M14 13h.01" /></Icon>
export const IconHelp = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.6" /><circle cx="12" cy="16.9" r="0.9" fill="currentColor" stroke="none" /></Icon>
export const IconExpand = (p: P) => <Icon {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Icon>
export const IconShrink = (p: P) => <Icon {...p}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></Icon>
export const IconPanels = (p: P) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M3 15h18" /></Icon>
export const IconSkipBack = (p: P) => <Icon {...p}><path d="M6 5v14" /><path d="M18 6l-9 6 9 6z" fill="currentColor" /></Icon>
export const IconSkipForward = (p: P) => <Icon {...p}><path d="M18 5v14" /><path d="M6 6l9 6-9 6z" fill="currentColor" /></Icon>
export const IconSun = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></Icon>
export const IconMoon = (p: P) => <Icon {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></Icon>
export const IconFrame = (p: P) => <Icon {...p}><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></Icon>
export const IconCamera = (p: P) => <Icon {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.4" /></Icon>
export const IconRoute = (p: P) => <Icon {...p}><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><path d="M7 18h6a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8" transform="translate(0 2)" /></Icon>
