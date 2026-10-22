import type { ReactNode } from 'react'
import { PasswordGate } from '@/components/PasswordGate'
import { isGlamiexUnlocked, unlockGlamiex } from './lockState'

/** Password screen in front of the GLAMIEX section; the rest of the app stays usable. */
export function GlamiexLock({ children }: { children: ReactNode }) {
  return <PasswordGate unlocked={isGlamiexUnlocked()} verify={unlockGlamiex} title="GLAMIEX is locked" subtitle="Enter the password to open GLAMIEX Business.">{children}</PasswordGate>
}
