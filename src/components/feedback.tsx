import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { createStore } from '@/lib/store'
import { uid } from '@/lib/id'
import { Button, Modal } from './ui'

/* ---------------- Toasts ---------------- */
type Tone = 'success' | 'error' | 'info' | 'warn'
interface ToastItem { id: string; tone: Tone; message: string; action?: { label: string; run: () => void }; ttl: number }
const toasts = createStore<ToastItem[]>([])

export function toast(message: string, tone: Tone = 'success', action?: ToastItem['action'], ttl = tone === 'error' ? 8000 : 3500) {
  const id = uid()
  toasts.set((t) => [...t.slice(-4), { id, tone, message, action, ttl }])
  setTimeout(() => dismiss(id), ttl)
  return id
}
const dismiss = (id: string) => toasts.set((t) => t.filter((x) => x.id !== id))

/**
 * Run a persistence operation and surface failures with a Retry action, so saves never fail silently.
 * Returns the operation result, or undefined if it failed.
 */
export async function safeWrite<T>(op: () => Promise<T>, success?: string, failure = 'Could not save'): Promise<T | undefined> {
  try {
    const r = await op()
    if (success) toast(success, 'success')
    return r
  } catch (e) {
    console.error(e)
    toast(`${failure}: ${(e as Error).message || 'unknown error'}`, 'error', { label: 'Retry', run: () => void safeWrite(op, success, failure) })
    return undefined
  }
}

export function Toaster() {
  const items = toasts.use()
  const icon = { success: CheckCircle2, error: XCircle, info: Info, warn: AlertTriangle }
  const color = { success: 'text-ok', error: 'text-danger', info: 'text-accent2', warn: 'text-warn' }
  return (
    <div className="pointer-events-none fixed bottom-24 end-4 z-[60] lg:bottom-4 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite" role="status">
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const I = icon[t.tone]
          return (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }}
              className="glass pointer-events-auto flex items-start gap-3 rounded-2xl p-3 text-sm" role={t.tone === 'error' ? 'alert' : undefined}>
              <I className={`mt-0.5 h-4 w-4 shrink-0 ${color[t.tone]}`} aria-hidden />
              <div className="flex-1">{t.message}</div>
              {t.action && <button className="font-semibold text-accent hover:underline" onClick={() => { t.action!.run(); dismiss(t.id) }}>{t.action.label}</button>}
              <button aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="text-muted hover:text-fg"><X className="h-4 w-4" /></button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

/* ---------------- Confirm dialog ---------------- */
interface ConfirmReq { title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
const confirmStore = createStore<ConfirmReq | null>(null)

export function confirm(opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => confirmStore.set({ ...opts, resolve }))
}

export function ConfirmHost() {
  const req = confirmStore.use()
  const [busy, setBusy] = useState(false)
  const close = (v: boolean) => { req?.resolve(v); confirmStore.set(null); setBusy(false) }
  return (
    <Modal open={!!req} onClose={() => close(false)} title={req?.title ?? ''}
      footer={<>
        <Button onClick={() => close(false)}>Cancel</Button>
        <Button variant={req?.danger ? 'danger' : 'primary'} loading={busy} onClick={() => { setBusy(true); close(true) }}>{req?.confirmLabel ?? 'Confirm'}</Button>
      </>}>
      <div className="text-sm text-muted">{req?.body}</div>
    </Modal>
  )
}
