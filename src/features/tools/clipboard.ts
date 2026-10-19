import { toast } from '@/components/feedback'

/** Copy text to the clipboard and confirm with a toast. Falls back to a hidden textarea when the async API is unavailable. */
export async function copyText(text: string, what = 'Copied') {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
    else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;left:-9999px;top:0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      if (!ok) throw new Error('Copy command was rejected')
    }
    toast(what === 'Copied' ? 'Copied to clipboard' : `${what} copied`, 'success')
    return true
  } catch {
    toast('Could not copy — your browser blocked clipboard access', 'error')
    return false
  }
}

/** Read/write a small JSON preference in localStorage (per-device convenience only; never critical data). */
export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`bta.${key}`)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch { return fallback }
}
export function savePref(key: string, value: unknown) {
  try { localStorage.setItem(`bta.${key}`, JSON.stringify(value)) } catch { /* storage unavailable: preference is not kept */ }
}

/** Parse a user-entered number. Returns null for empty / non-finite input. */
export function num(s: string): number | null {
  const t = s.trim().replace(/,/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
