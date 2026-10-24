import { useId } from 'react'

/** Brand teal from the workMYwork logo. */
export const BRAND_TEAL = '#4aa3a6'
/** In the app the logo follows the theme's single accent colour (blue by default). */
const BRAND_ACCENT = 'rgb(var(--accent))'

/**
 * "work MY work" wordmark (vector, so it stays sharp at any size). The second "work" uses the current text colour,
 * so it reads white in dark mode and near-black in light mode. Uses the bundled heading font.
 */
export function Wordmark({ className, title = 'workMYwork' }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 300 72" className={className} role="img" aria-label={title}>
      <defs>
        <clipPath id={`${id}-teal`}><polygon points="100,0 121,0 181,72 100,72" /></clipPath>
        <clipPath id={`${id}-white`}><polygon points="121,0 200,0 200,72 181,72" /></clipPath>
      </defs>
      <g fontFamily="'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', Inter, system-ui, sans-serif" fontWeight={700}>
        <text x="0" y="50" fontSize="44" style={{ fill: BRAND_ACCENT }} letterSpacing="-1">work</text>
        <circle cx="150" cy="36" r="34" style={{ fill: BRAND_ACCENT }} clipPath={`url(#${id}-teal)`} />
        <circle cx="150" cy="36" r="34" fill="#f1f3f5" clipPath={`url(#${id}-white)`} />
        <circle cx="150" cy="36" r="34" fill="none" stroke="currentColor" strokeOpacity="0.12" />
        <text x="150" y="49" fontSize="34" fontWeight={800} textAnchor="middle" fill="#15171c" letterSpacing="-1.5">MY</text>
        <text x="191" y="50" fontSize="44" fill="currentColor" letterSpacing="-1">work</text>
      </g>
    </svg>
  )
}

/** Shield-with-arrow brand mark (used as the compact logo and app icon). */
export function BrandMark({ className, title = 'workMYwork' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={title}>
      <path d="M32 5 9 13v17c0 15 10 25 23 30" fill="none" style={{ stroke: BRAND_ACCENT }} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M32 5l23 8v17c0 15-10 25-23 30" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M32 48V20M21 31l11-11 11 11" fill="none" style={{ stroke: BRAND_ACCENT }} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
