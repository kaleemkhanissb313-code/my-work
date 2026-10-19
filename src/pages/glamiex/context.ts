import { createContext, useContext } from 'react'
import type { GxData } from '@/features/glamiex/engine'
import type { GxSettings } from '@/features/glamiex/types'

export interface GxCtxValue { data: GxData; settings: GxSettings; tz: string; go: (path: string) => void }
export const GxCtx = createContext<GxCtxValue | null>(null)
export function useGx() {
  const v = useContext(GxCtx)
  if (!v) throw new Error('useGx must be used inside GLAMIEX')
  return v
}
export const live = <T extends { deletedAt: number | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt)
