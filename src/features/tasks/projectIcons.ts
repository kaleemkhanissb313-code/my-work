import {
  BookOpen, Briefcase, Camera, Code, Dumbbell, Folder, GraduationCap, Heart, Home, Leaf, Lightbulb, Music, Palette, Plane, Rocket,
  ShoppingCart, Target, Wrench, type LucideIcon,
} from 'lucide-react'
import type { ProjectStatus } from '@/types/models'

/** Fixed set of icons a project can use (stored by name in `Project.icon`). */
export const PROJECT_ICONS: Record<string, LucideIcon> = {
  Folder, Briefcase, Rocket, Home, Heart, Code, BookOpen, Camera, Music, Plane, ShoppingCart, Target, Lightbulb, Palette, Wrench, GraduationCap, Dumbbell, Leaf,
}
export const projectIcon = (name: string | undefined): LucideIcon => (name && PROJECT_ICONS[name]) || Folder

export const PROJECT_COLORS = ['#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#64748b']

export const PROJECT_STATUSES: { id: ProjectStatus; label: string; tone: 'muted' | 'accent' | 'warn' | 'ok' | 'danger' }[] = [
  { id: 'planning', label: 'Planning', tone: 'muted' },
  { id: 'active', label: 'Active', tone: 'accent' },
  { id: 'on_hold', label: 'On hold', tone: 'warn' },
  { id: 'completed', label: 'Completed', tone: 'ok' },
  { id: 'cancelled', label: 'Cancelled', tone: 'danger' },
]
export const PROJECT_STATUS_LABEL = Object.fromEntries(PROJECT_STATUSES.map((s) => [s.id, s.label])) as Record<ProjectStatus, string>
export const PROJECT_STATUS_TONE = Object.fromEntries(PROJECT_STATUSES.map((s) => [s.id, s.tone])) as Record<ProjectStatus, (typeof PROJECT_STATUSES)[number]['tone']>
