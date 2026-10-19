import {
  Banknote, BarChart3, Briefcase, Calculator, CalendarDays, CheckSquare, FileText, FolderKanban, GanttChart, Hash, Heart, Home,
  Gem, Image, ImagePlus, LayoutDashboard, Link2, Lock, NotebookPen, Palette, Settings, ShieldCheck, Timer, Trash2, Type, LayoutTemplate, PieChart, type LucideIcon,
} from 'lucide-react'

export interface NavLeaf { id: string; label: string; path: string; icon: LucideIcon; shortcut?: string }
export interface NavGroup { id: string; label: string; icon: LucideIcon; path?: string; tone?: string; children?: NavLeaf[] }

/** Sidebar structure (grouped as requested). Modules can be hidden per user in Settings. */
export const NAV: NavGroup[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { id: 'life', label: 'My Life', icon: Heart, path: '/life', tone: 'text-life' },
  { id: 'home', label: 'Home', icon: Home, path: '/home', tone: 'text-home' },
  { id: 'work', label: 'Work', icon: Briefcase, path: '/work', tone: 'text-work' },
  {
    id: 'pt', label: 'Projects & Tasks', icon: FolderKanban, children: [
      { id: 'projects', label: 'Projects', path: '/projects', icon: FolderKanban },
      { id: 'tasks', label: 'Tasks', path: '/tasks', icon: CheckSquare },
    ],
  },
  {
    id: 'ct', label: 'Calendar & Timelines', icon: CalendarDays, children: [
      { id: 'calendar', label: 'Calendar', path: '/calendar', icon: CalendarDays },
      { id: 'timelines', label: 'Timelines', path: '/timelines', icon: GanttChart },
    ],
  },
  {
    id: 'dn', label: 'Documents & Notes', icon: FileText, children: [
      { id: 'documents', label: 'Documents', path: '/documents', icon: FileText },
      { id: 'notes', label: 'Notes', path: '/notes', icon: NotebookPen },
      { id: 'templates', label: 'Templates', path: '/templates', icon: LayoutTemplate },
    ],
  },
  {
    id: 'ml', label: 'Media & Links', icon: Image, children: [
      { id: 'media', label: 'Media Library', path: '/media', icon: Image },
      { id: 'studio', label: 'Image Studio', path: '/studio', icon: ImagePlus },
      { id: 'links', label: 'Links & Bookmarks', path: '/links', icon: Link2 },
    ],
  },
  {
    id: 'tools', label: 'Tools & Calculations', icon: Calculator, children: [
      { id: 'time', label: 'Time Tools', path: '/time', icon: Timer },
      { id: 'calculator', label: 'Calculator', path: '/calculator', icon: Calculator },
      { id: 'numbers', label: 'Number Tools', path: '/numbers', icon: Hash },
      { id: 'colors', label: 'Colors', path: '/colors', icon: Palette },
      { id: 'text', label: 'Alphabet & Text', path: '/text', icon: Type },
    ],
  },
  {
    id: 'gr', label: 'Graphs & Reports', icon: BarChart3, children: [
      { id: 'graphs', label: 'Graphs & Data', path: '/graphs', icon: BarChart3 },
      { id: 'reports', label: 'Reports', path: '/reports', icon: PieChart },
    ],
  },
  { id: 'glamiex', label: 'GLAMIEX Business', icon: Gem, path: '/glamiex', tone: 'text-accent' },
  { id: 'finance', label: 'Finance & Expenses', icon: Banknote, path: '/finance' },
  { id: 'security', label: 'Security Center', icon: ShieldCheck, path: '/security', tone: 'text-secure' },
  { id: 'vault', label: 'Private Vault', icon: Lock, path: '/vault', tone: 'text-secure' },
  {
    id: 'settings-group', label: 'Settings', icon: Settings, children: [
      { id: 'settings', label: 'Settings', path: '/settings', icon: Settings },
      { id: 'trash', label: 'Trash', path: '/trash', icon: Trash2 },
    ],
  },
]

export const ALL_LEAVES: NavLeaf[] = NAV.flatMap((g) => (g.children ? g.children : [{ id: g.id, label: g.label, path: g.path!, icon: g.icon }]))
/** Modules that can be hidden in Settings (core navigation is always available). */
export const HIDEABLE = ALL_LEAVES.filter((l) => !['dashboard', 'settings', 'trash', 'security'].includes(l.id))
